/**
 * Codex rollout backfill.
 *
 * Codex persists sessions to `~/.codex/sessions/YYYY/MM/DD/rollout-<id>.jsonl`.
 * Unlike Claude Code there is no `Skill` tool call to look for, because Codex
 * activates a skill by reading SKILL.md straight into the conversation. So this
 * reader works the other way round: it takes the skills present on disk and
 * looks for their fingerprints in the transcript.
 *
 * The activation is still recoverable, because Codex loads a skill by *reading
 * the file with a shell command*:
 *
 *   {"type":"function_call","name":"exec_command",
 *    "arguments":{"cmd":"sed -n '1,240p' /home/node/.agents/skills/agent-reach/SKILL.md"}}
 *
 * Matching those reads is precise: the skill name comes out of the path, and one
 * read is one activation.
 *
 * An earlier version fingerprinted the skill's text instead, which was wrong in
 * both directions. Matching the skill's *path* hit all 1,840 rollout files —
 * that is the catalog listing progressive disclosure shows at startup, not
 * usage. Matching the body hit 52 sessions against 7 that actually read the
 * file, because a loaded body stays in the transcript and gets replayed. Both
 * measured availability, not use.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { SKILL_MD_READ } from '../adapters/codex.ts';
import { agentInstallId, buildEvent, newEventId, projectKey } from '../identity.ts';
import { discoverSkills } from '../scan.ts';
import type { SkillEvent } from '../schema.ts';

const AGENT = 'codex' as const;

/**
 * A recorded read of the skill body. Just below a Claude Code `Skill` tool call,
 * because the read is inferred to be an activation rather than labelled as one.
 */
const ACTIVATION_CONFIDENCE = 0.95;

export interface CodexBackfillStats {
  filesScanned: number;
  linesParsed: number;
  parseFailures: number;
  events: number;
  bySkill: Record<string, number>;
  /** Set when the documented rollout directory does not exist on this machine. */
  note: string | null;
}

export function rolloutRoot(): string {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  return join(codexHome, 'sessions');
}

export function listRollouts(root: string): string[] {
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

export function backfillCodex(
  options: { root?: string; cwd?: string | null; since?: Date | null } = {},
): { events: SkillEvent[]; stats: CodexBackfillStats } {
  const root = options.root ?? rolloutRoot();
  const since = options.since ?? null;
  const stats: CodexBackfillStats = {
    filesScanned: 0,
    linesParsed: 0,
    parseFailures: 0,
    events: 0,
    bySkill: {},
    note: null,
  };

  if (!existsSync(root)) {
    stats.note =
      `no rollout directory at ${root}; this Codex build may store sessions elsewhere. ` +
      'Use the hook or beacon route for Codex coverage.';
    return { events: [], stats };
  }

  // On-disk skills supply the content hash and scope where still available; a
  // skill that has since been removed is still counted from its path.
  const onDisk = new Map(discoverSkills(AGENT, options.cwd ?? null).map((s) => [s.name, s]));
  const installId = agentInstallId(AGENT);
  const events: SkillEvent[] = [];

  for (const file of listRollouts(root)) {
    stats.filesScanned += 1;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const sessionId = /rollout-.*?-([0-9a-fA-F-]{36})\.jsonl$/.exec(file)?.[1] ?? null;
    // One activation per skill per session.
    const counted = new Set<string>();

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      // Cheap pre-filter: the overwhelming majority of records cannot match.
      if (!line.includes('SKILL.md')) {
        stats.linesParsed += 1;
        continue;
      }

      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line) as Record<string, unknown>;
      } catch {
        stats.parseFailures += 1;
        continue;
      }
      stats.linesParsed += 1;

      const call = record.payload as { type?: string; name?: string; arguments?: unknown } | undefined;
      if (call?.type !== 'function_call') continue;

      const args = typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments ?? '');
      const occurredAt = extractTimestamp(record) ?? new Date(0).toISOString();
      if (since && Date.parse(occurredAt) < since.getTime()) continue;

      SKILL_MD_READ.lastIndex = 0;
      for (const match of args.matchAll(SKILL_MD_READ)) {
        const name = match[2];
        if (!name || counted.has(name)) continue;
        counted.add(name);

        const skill = onDisk.get(name);
        events.push(
          buildEvent({
            eventId: newEventId(),
            tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
            principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
            agentInstallId: installId,
            occurredAt,
            agentKind: AGENT,
            agentVersion: null,
            skillId: null,
            skillVersionId: null,
            observedSkillName: name,
            observedContentHash: skill?.contentHash ?? null,
            installScope: skill?.scope ?? 'unknown',
            eventType: 'invoked',
            trigger: 'unknown',
            outcome: null,
            errorKind: null,
            durationMs: null,
            invocationId: sessionId ? `${sessionId}:${name}` : null,
            parentInvocationId: null,
            sessionId,
            turnId: null,
            isSubagent: false,
            inputTokens: null,
            outputTokens: null,
            cacheReadTokens: null,
            costUsd: null,
            projectKey: projectKey(options.cwd ?? null),
            argsHash: null,
            agentMeta: { detectionNote: 'skill_md_read', toolName: call.name ?? null },
            detectedBy: 'transcript',
            confidence: ACTIVATION_CONFIDENCE,
          }),
        );
        stats.bySkill[name] = (stats.bySkill[name] ?? 0) + 1;
      }
    }
  }

  stats.events = events.length;
  return { events, stats };
}

function extractTimestamp(record: Record<string, unknown>): string | null {
  for (const key of ['timestamp', 'ts', 'created_at', 'time']) {
    const value = record[key];
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
    if (typeof value === 'number') {
      // Rollouts have been seen with both second and millisecond epochs.
      const ms = value > 1e12 ? value : value * 1000;
      return new Date(ms).toISOString();
    }
  }
  return null;
}
