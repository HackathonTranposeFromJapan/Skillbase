/**
 * Beacon adapter — the only route that works on every agent.
 *
 * Hooks, transcripts and OTel are all agent-specific, and on Codex none of them
 * can observe a skill activating. What every agent does have in common is the
 * skill body itself: whatever runs the skill has read those instructions and
 * will act on them. So SkillDrop injects a self-report line into each managed
 * SKILL.md, and the skill announces its own use:
 *
 *   npx -y skilldrop emit --skill acme/prod-db@1.4.0 --run <uuid> --phase start
 *
 * That is one shell command, which Claude Code, Codex, Cursor, Hermes, Goose and
 * anything else with a shell can run. The trade is compliance: a model can skip
 * an instruction, so this route is trusted below direct observation and its
 * real-world hit rate is measured by comparing it against transcript ground
 * truth rather than assumed.
 */

import { agentInstallId, buildEvent, newEventId, projectKey, sha256 } from '../identity.ts';
import { putPending, takePending } from '../pending.ts';
import { resolveSkill } from '../scan.ts';
import { AGENT_KINDS, type AgentKind, type SkillEvent, type Trigger } from '../schema.ts';

export interface BeaconInput {
  /** `team/name@version`, `team/name`, or a bare directory name. */
  skill: string;
  /**
   * Optional id tying `start` to `end`. Left out by default: making the model
   * carry a UUID across two commands is exactly the kind of instruction it
   * drops, so `start` mints the id and `end` looks it up locally instead.
   */
  run?: string | null;
  phase: 'start' | 'end';
  agent?: string | null;
  session?: string | null;
  cwd?: string | null;
  outcome?: 'success' | 'error' | 'aborted' | null;
  trigger?: Trigger | null;
  /** Only when the org opted into argument collection; hashed, never stored raw. */
  args?: string | null;
}

export interface ParsedSkillRef {
  /** Canonical `team/name` when namespaced, else the bare name. */
  skillId: string | null;
  name: string;
  version: string | null;
}

/** Split `team/name@1.2.0` into its parts. */
export function parseSkillRef(ref: string): ParsedSkillRef {
  const at = ref.lastIndexOf('@');
  const hasVersion = at > 0;
  const withoutVersion = hasVersion ? ref.slice(0, at) : ref;
  const version = hasVersion ? ref.slice(at + 1) : null;
  const namespaced = withoutVersion.includes('/');
  const name = withoutVersion.split('/').pop() ?? withoutVersion;

  return {
    skillId: namespaced ? withoutVersion : null,
    name,
    version: version && version.length > 0 ? version : null,
  };
}

/**
 * The agent is identified by whichever agent-specific variable is present in the
 * skill's shell environment, since the beacon has no other way to know its host.
 */
export function detectAgentKind(explicit?: string | null): AgentKind {
  if (explicit && (AGENT_KINDS as readonly string[]).includes(explicit)) return explicit as AgentKind;

  const env = process.env;
  if (env.CLAUDE_CODE_SESSION_ID ?? env.CLAUDECODE ?? env.CLAUDE_CODE_VERSION) return 'claude_code';
  if (env.CODEX_SESSION_ID ?? env.CODEX_SANDBOX ?? env.CODEX_HOME) return 'codex';
  if (env.CURSOR_SESSION_ID ?? env.CURSOR_AGENT) return 'cursor';
  if (env.GEMINI_CLI_SESSION ?? env.GEMINI_SESSION_ID) return 'gemini_cli';
  if (env.HERMES_SESSION_ID ?? env.HERMES_AGENT) return 'hermes';
  return 'other';
}

const runKey = (sessionId: string | null, skillName: string): string =>
  `beacon:run:${sessionId ?? '-'}:${skillName}`;

export function adaptBeacon(input: BeaconInput, now: Date = new Date()): SkillEvent {
  const ref = parseSkillRef(input.skill);
  const agentKind = detectAgentKind(input.agent);
  const cwd = input.cwd ?? process.cwd();
  const resolved = resolveSkill(agentKind, ref.name, cwd);

  const sessionId =
    input.session ??
    process.env.CLAUDE_CODE_SESSION_ID ??
    process.env.CODEX_SESSION_ID ??
    null;

  // `start` mints and parks a run id; `end` reclaims it. The skill author — and
  // the model — only ever type the skill name.
  const key = runKey(sessionId, ref.name);
  let runId = input.run ?? null;
  let durationMs: number | null = null;

  if (input.phase === 'start') {
    runId = runId ?? newEventId();
    putPending(key, { startedAt: now.getTime(), runId });
  } else {
    const started = takePending(key);
    if (typeof started?.data.startedAt === 'number') {
      durationMs = Math.max(0, now.getTime() - started.data.startedAt);
    }
    if (!runId && typeof started?.data.runId === 'string') runId = started.data.runId;
  }

  const isEnd = input.phase === 'end';
  const outcome = isEnd ? (input.outcome ?? 'success') : null;

  return buildEvent({
    eventId: newEventId(),
    tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
    principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
    agentInstallId: agentInstallId(agentKind),
    occurredAt: now.toISOString(),
    agentKind,
    agentVersion: null,
    // The beacon carries the registry id the skill was published under — the one
    // route that knows its own canonical identity without any resolution step.
    skillId: ref.skillId,
    skillVersionId: null,
    observedSkillName: ref.name,
    observedContentHash: resolved?.contentHash ?? null,
    installScope: resolved?.scope ?? 'unknown',
    eventType: isEnd ? (outcome === 'success' ? 'completed' : 'failed') : 'invoked',
    trigger: input.trigger ?? 'unknown',
    outcome,
    errorKind: outcome === 'error' ? 'skill_reported_error' : null,
    durationMs,
    invocationId: runId,
    parentInvocationId: null,
    sessionId,
    turnId: null,
    isSubagent: false,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    costUsd: null,
    projectKey: projectKey(cwd),
    argsHash: input.args ? sha256(input.args) : null,
    agentMeta: {
      declaredVersion: ref.version,
      resolvedVersion: resolved?.frontmatter.version ?? null,
    },
    detectedBy: 'beacon',
  });
}

export const BEACON_MARKER = '<!-- skilldrop:beacon -->';

/**
 * The block SkillDrop injects into a managed SKILL.md.
 *
 * Kept to two copy-exact commands with no variables to thread, because every
 * bit of ceremony here is a chance for the model to skip the step and lose the
 * event. The `end` line is marked optional on purpose: losing a duration is
 * cheap, losing the invocation count is not.
 */
export function beaconSnippet(skillRef: string): string {
  return [
    BEACON_MARKER,
    '## Telemetry (managed by SkillDrop — do not edit)',
    '',
    'Run this first, before any other step in this skill:',
    '',
    '```bash',
    `npx -y skilldrop emit --skill ${skillRef} --phase start`,
    '```',
    '',
    'Optionally, once the skill is finished:',
    '',
    '```bash',
    `npx -y skilldrop emit --skill ${skillRef} --phase end`,
    '```',
    '',
    'This records only the skill name, version and timing. No prompt, argument or',
    'output content is transmitted.',
    BEACON_MARKER,
    '',
  ].join('\n');
}
