/**
 * Claude Code transcript backfill.
 *
 * Claude Code writes every session to `~/.claude/projects/<slug>/<id>.jsonl`,
 * and a skill invocation is fully recoverable from it:
 *
 *   - the assistant record holds `tool_use` with `name: "Skill"` and `input.skill`
 *   - the paired `tool_result` carries `toolUseResult.success`
 *   - the follow-up user record begins "Base directory for this skill: <path>",
 *     which pins the install scope and the exact SKILL.md that ran
 *
 * This route needs nothing installed and reaches backwards, so a company sees
 * real adoption data on day one instead of after a rollout. It is also the
 * ground truth the beacon's compliance rate is measured against.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { agentInstallId, buildEvent, newEventId, projectKey, skillContentHash } from '../identity.ts';
import { inferScope } from '../scan.ts';
import type { InstallScope, Outcome, SkillEvent } from '../schema.ts';

const AGENT = 'claude_code' as const;

export interface BackfillOptions {
  root?: string;
  /** Only include invocations at or after this instant. */
  since?: Date | null;
}

export interface BackfillStats {
  filesScanned: number;
  linesParsed: number;
  parseFailures: number;
  events: number;
  /** Invocation count per skill — directly comparable to a grep over the same files. */
  bySkill: Record<string, number>;
}

export function transcriptRoot(): string {
  return join(homedir(), '.claude', 'projects');
}

interface TranscriptRecord {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  session_id?: string;
  promptId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  isSidechain?: boolean;
  uuid?: string;
  message?: {
    role?: string;
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  toolUseResult?: { success?: boolean; commandName?: string };
}

interface PendingInvocation {
  event: SkillEvent;
  toolUseId: string;
}

/** Walk every `.jsonl` transcript under `root`. */
export function listTranscripts(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full);
      else if (entry.endsWith('.jsonl')) files.push(full);
    }
  };
  if (existsSync(root)) walk(root);
  return files;
}

export function backfillClaudeCode(options: BackfillOptions = {}): {
  events: SkillEvent[];
  stats: BackfillStats;
} {
  const root = options.root ?? transcriptRoot();
  const since = options.since ?? null;
  const events: SkillEvent[] = [];
  const stats: BackfillStats = {
    filesScanned: 0,
    linesParsed: 0,
    parseFailures: 0,
    events: 0,
    bySkill: {},
  };

  const installId = agentInstallId(AGENT);

  for (const file of listTranscripts(root)) {
    stats.filesScanned += 1;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    // Invocations awaiting their result record, keyed by tool_use_id.
    const pending = new Map<string, PendingInvocation>();

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      let record: TranscriptRecord;
      try {
        record = JSON.parse(line) as TranscriptRecord;
      } catch {
        stats.parseFailures += 1;
        continue;
      }
      stats.linesParsed += 1;

      for (const invocation of extractInvocations(record, installId, since)) {
        events.push(invocation.event);
        stats.bySkill[invocation.event.observedSkillName] =
          (stats.bySkill[invocation.event.observedSkillName] ?? 0) + 1;
        pending.set(invocation.toolUseId, invocation);
      }

      const completion = extractCompletion(record, pending, installId);
      if (completion) events.push(completion);
    }
  }

  stats.events = events.length;
  return { events, stats };
}

function extractInvocations(
  record: TranscriptRecord,
  installId: string,
  since: Date | null,
): PendingInvocation[] {
  const content = record.message?.content;
  if (!Array.isArray(content)) return [];

  const out: PendingInvocation[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as {
      type?: string;
      name?: string;
      id?: string;
      input?: { skill?: string; args?: string; caller?: { type?: string } };
    };
    if (b.type !== 'tool_use' || b.name !== 'Skill') continue;

    const skillName = b.input?.skill;
    if (!skillName) continue;

    const occurredAt = record.timestamp ?? new Date(0).toISOString();
    if (since && Date.parse(occurredAt) < since.getTime()) continue;

    const toolUseId = b.id ?? `${record.uuid ?? 'unknown'}:${skillName}`;
    const usage = record.message?.usage;

    out.push({
      toolUseId,
      event: buildEvent({
        eventId: newEventId(),
        tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
        principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
        agentInstallId: installId,
        occurredAt,
        agentKind: AGENT,
        agentVersion: record.version ?? null,
        skillId: null,
        skillVersionId: null,
        observedSkillName: skillName,
        observedContentHash: null,
        installScope: inferScope(skillName, null),
        eventType: 'invoked',
        // Historic transcripts do not record whether the user typed the command
        // or the model chose the skill, so this stays honest rather than guessed.
        trigger: record.isSidechain ? 'subagent' : 'unknown',
        outcome: null,
        errorKind: null,
        durationMs: null,
        invocationId: toolUseId,
        parentInvocationId: null,
        sessionId: record.sessionId ?? record.session_id ?? null,
        turnId: record.promptId ?? null,
        isSubagent: Boolean(record.isSidechain),
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        cacheReadTokens: usage?.cache_read_input_tokens ?? null,
        costUsd: null,
        projectKey: projectKey(record.cwd ?? null),
        argsHash: null,
        agentMeta: {
          model: record.message?.model ?? null,
          callerType: b.input?.caller?.type ?? null,
        },
        detectedBy: 'transcript',
      }),
    });
  }
  return out;
}

/**
 * The result record carries `toolUseResult.success`, and the message that
 * follows it names the skill's base directory — the only place the on-disk path
 * appears, and therefore the only way to pin scope and content hash.
 */
function extractCompletion(
  record: TranscriptRecord,
  pending: Map<string, PendingInvocation>,
  installId: string,
): SkillEvent | null {
  const content = record.message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as { type?: string; tool_use_id?: string };
    if (b.type !== 'tool_result' || !b.tool_use_id) continue;

    const invocation = pending.get(b.tool_use_id);
    if (!invocation) continue;
    pending.delete(b.tool_use_id);

    const success = record.toolUseResult?.success !== false;
    const outcome: Outcome = success ? 'success' : 'error';
    const occurredAt = record.timestamp ?? invocation.event.occurredAt;
    const startedAt = Date.parse(invocation.event.occurredAt);
    const endedAt = Date.parse(occurredAt);

    return buildEvent({
      ...invocation.event,
      eventId: newEventId(),
      agentInstallId: installId,
      occurredAt,
      eventType: success ? 'completed' : 'failed',
      outcome,
      errorKind: success ? null : 'skill_launch_failed',
      durationMs:
        Number.isNaN(startedAt) || Number.isNaN(endedAt) ? null : Math.max(0, endedAt - startedAt),
      detectedBy: 'transcript',
    });
  }
  return null;
}

/**
 * Read the "Base directory for this skill: <path>" line a transcript emits when
 * a skill activates, to recover scope and content hash for already-recorded
 * invocations.
 */
export function resolveBaseDirectory(text: string): {
  path: string;
  scope: InstallScope;
  contentHash: string | null;
} | null {
  const match = /^Base directory for this skill:\s*(.+)$/m.exec(text);
  const path = match?.[1]?.trim();
  if (!path) return null;

  let contentHash: string | null = null;
  try {
    contentHash = skillContentHash(readFileSync(join(path, 'SKILL.md'), 'utf8'));
  } catch {
    // The skill may have been moved or uninstalled since; scope is still usable.
  }
  return { path, scope: inferScope('', path), contentHash };
}
