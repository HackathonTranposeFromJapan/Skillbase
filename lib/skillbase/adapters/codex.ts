/**
 * Codex adapter.
 *
 * Codex has no `Skill` tool. Skills load by progressive disclosure, and there is
 * no hook event for skill invocation or for `$` mentions, which makes it look at
 * first like hooks cannot see skill use here at all.
 *
 * They can. Inspecting 1,840 real rollout files showed how activation actually
 * happens: Codex reads the file with a **shell command** —
 *
 *   exec_command  sed -n '1,240p' /home/node/.agents/skills/agent-reach/SKILL.md
 *
 * and shell is precisely the one tool `PreToolUse` does fire for. So the
 * activation is observable after all, and the skill name is right there in the
 * path. That read is the Codex equivalent of Claude Code's `Skill` tool call.
 *
 * Four signals, in descending order of trust:
 *
 *   1. a shell command reading `<skills-dir>/<name>/SKILL.md` — the activation
 *   2. a shell command running a script inside a skill directory
 *   3. a `$mention` in `UserPromptSubmit` — intent, not proof of use
 *   4. the beacon (its own adapter) — the fallback that needs no host support
 *
 * Beacon commands are deliberately ignored here so a beacon that also passes
 * through the shell hook is not counted twice.
 */

import { agentInstallId, buildEvent, newEventId, projectKey } from '../identity.ts';
import { peekPending, putPending, takePending } from '../pending.ts';
import { discoverSkills, type DiscoveredSkill } from '../scan.ts';
import type { SkillEvent, Trigger } from '../schema.ts';

const AGENT = 'codex' as const;

/** Reading the skill body IS the activation — as direct as Codex gets. */
const ACTIVATION_CONFIDENCE = 0.95;
/** A `$mention` says the user asked for a skill, not that the model used it. */
const MENTION_CONFIDENCE = 0.85;
/** Running a file from inside a skill directory is near-certain use. */
const SCRIPT_CONFIDENCE = 0.9;

/**
 * A read of a SKILL.md from a directory Codex actually discovers skills in.
 *
 * Restricted to `.agents/skills`, `.codex/skills` and `/etc/codex/skills` on
 * purpose. Matching any parent directory named `skills` looked more general and
 * was measurably worse: across 1,840 rollouts it returned 242 hits over 51
 * skills, most of them `.claude/skills/` files being read while somebody
 * *edited* a skill. Reading a skill you are writing is not using it. Codex does
 * not discover those paths, so requiring one of its own roots is what separates
 * activation from authoring.
 *
 * The trade is recall: an org pointing Codex at a non-standard directory would
 * be missed here, and covered by the beacon instead.
 */
export const SKILL_MD_READ =
  /((?:[^\s'"|;&]*\/(?:\.agents|\.codex)|\/etc\/codex)\/skills)\/([A-Za-z0-9._-]+)\/SKILL\.md/g;

export interface CodexHookPayload {
  hook_event_name?: string;
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  permission_mode?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: { command?: string | string[]; [key: string]: unknown };
  tool_response?: unknown;
  prompt?: string;
  user_prompt?: string;
}

export function adaptCodexHook(payload: CodexHookPayload, now: Date = new Date()): SkillEvent[] {
  const event = payload.hook_event_name ?? '';
  const skills = discoverSkills(AGENT, payload.cwd ?? null);

  // A `$mention` can only be matched against skills that exist, but a SKILL.md
  // read identifies itself from the path, so shell is handled either way.
  if (event === 'UserPromptSubmit') {
    return skills.length === 0 ? [] : handleMentions(payload, skills, now);
  }
  if (event === 'PreToolUse' || event === 'PostToolUse') return handleShell(payload, skills, now, event);
  return [];
}

function handleMentions(
  payload: CodexHookPayload,
  skills: DiscoveredSkill[],
  now: Date,
): SkillEvent[] {
  const prompt = payload.prompt ?? payload.user_prompt ?? '';
  if (!prompt) return [];

  // Only skill names are extracted; the prompt text itself is never retained.
  const mentioned = new Set<string>();
  for (const match of prompt.matchAll(/\$([A-Za-z0-9][A-Za-z0-9._-]*)/g)) {
    const name = match[1];
    if (name) mentioned.add(name);
  }
  if (mentioned.size === 0) return [];

  return skills
    .filter((s) => mentioned.has(s.name))
    .map((skill) => {
      // Remembered so a later script execution from the same skill is understood
      // as the same, already-counted invocation.
      putPending(`cx:mention:${payload.session_id ?? '-'}:${skill.name}`, { ts: now.getTime() });
      return codexEvent(payload, skill, {
        occurredAt: now.toISOString(),
        trigger: 'explicit_command',
        confidence: MENTION_CONFIDENCE,
        detectionNote: 'dollar_mention',
      });
    });
}

function handleShell(
  payload: CodexHookPayload,
  skills: DiscoveredSkill[],
  now: Date,
  event: string,
): SkillEvent[] {
  const command = normalizeCommand(payload.tool_input?.command);
  if (!command) return [];

  // The beacon reports itself with better data; counting it here too would double.
  if (/skilldrop\s+emit/.test(command)) return [];

  if (event !== 'PreToolUse') return [];

  // Reading the skill body is the activation itself, so it is checked first and
  // trusted most. The name comes straight out of the path, which means a skill
  // that is no longer on disk is still identified correctly.
  const activated = readActivationName(command);
  if (activated) {
    const skill = skills.find((s) => s.name === activated);
    return emitOnce(payload, activated, skill, now, {
      confidence: ACTIVATION_CONFIDENCE,
      detectionNote: 'skill_md_read',
    });
  }

  const owning = skills.find((skill) => command.includes(skill.path));
  if (!owning) return [];

  return emitOnce(payload, owning.name, owning, now, {
    confidence: SCRIPT_CONFIDENCE,
    detectionNote: 'skill_script_execution',
  });
}

function readActivationName(command: string): string | null {
  SKILL_MD_READ.lastIndex = 0;
  return SKILL_MD_READ.exec(command)?.[2] ?? null;
}

/**
 * One invocation per skill per session. A skill that reads its own reference
 * files and runs three scripts is one use, not four.
 */
function emitOnce(
  payload: CodexHookPayload,
  skillName: string,
  skill: DiscoveredSkill | undefined,
  now: Date,
  fields: { confidence: number; detectionNote: string },
): SkillEvent[] {
  const session = payload.session_id ?? '-';
  const seenKey = `cx:seen:${session}:${skillName}`;
  if (peekPending(seenKey) !== null) return [];
  putPending(seenKey, { ts: now.getTime() });

  // An explicit mention already counted this skill for this session.
  const mentioned = takePending(`cx:mention:${session}:${skillName}`) !== null;
  if (mentioned) return [];

  return [
    codexEvent(payload, skill ?? syntheticSkill(skillName), {
      occurredAt: now.toISOString(),
      trigger: 'unknown',
      confidence: fields.confidence,
      detectionNote: fields.detectionNote,
    }),
  ];
}

/** Stand-in for a skill observed in a path but no longer present on disk. */
function syntheticSkill(name: string): DiscoveredSkill {
  return {
    name,
    path: '',
    skillMdPath: '',
    scope: 'unknown',
    contentHash: '',
    frontmatter: {},
  };
}

function normalizeCommand(command: string | string[] | undefined): string | null {
  if (typeof command === 'string') return command;
  if (Array.isArray(command)) return command.join(' ');
  return null;
}

function codexEvent(
  payload: CodexHookPayload,
  skill: DiscoveredSkill,
  fields: {
    occurredAt: string;
    trigger: Trigger;
    confidence: number;
    detectionNote: string;
  },
): SkillEvent {
  return buildEvent({
    eventId: newEventId(),
    tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
    principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
    agentInstallId: agentInstallId(AGENT),
    occurredAt: fields.occurredAt,
    agentKind: AGENT,
    agentVersion: null,
    skillId: null,
    skillVersionId: null,
    observedSkillName: skill.name,
    observedContentHash: skill.contentHash === '' ? null : skill.contentHash,
    installScope: skill.scope,
    eventType: 'invoked',
    trigger: fields.trigger,
    outcome: null,
    errorKind: null,
    durationMs: null,
    // Codex gives no per-skill id, so the turn is the finest correlation available.
    invocationId: payload.turn_id ?? payload.tool_use_id ?? null,
    parentInvocationId: null,
    sessionId: payload.session_id ?? null,
    turnId: payload.turn_id ?? null,
    isSubagent: false,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    costUsd: null,
    projectKey: projectKey(payload.cwd ?? null),
    argsHash: null,
    agentMeta: {
      detectionNote: fields.detectionNote,
      permissionMode: payload.permission_mode ?? null,
      skillVersion: skill.frontmatter.version ?? null,
    },
    detectedBy: 'hook',
    confidence: fields.confidence,
  });
}
