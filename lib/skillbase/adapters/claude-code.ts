/**
 * Claude Code adapter.
 *
 * Claude Code exposes skill use directly: skills run through a first-class
 * `Skill` tool, so `PreToolUse`/`PostToolUse` with `matcher: "Skill"` observe
 * every model-initiated invocation, carrying `tool_use_id` to pair the two.
 *
 * The one gap is explicit `/skillname` invocation, which expands client-side
 * and is reported by `UserPromptExpansion` instead. That event is recorded as a
 * marker rather than an event of its own: if a `Skill` tool call follows, the
 * marker only upgrades its `trigger` to `explicit_command`; if none follows, the
 * marker is flushed as the invocation. Both paths produce exactly one event,
 * which is what makes the counts correct whichever way the runtime behaves.
 */

import { agentInstallId, buildEvent, newEventId, projectKey } from '../identity.ts';
import { drainPrefix, putPending, takePending } from '../pending.ts';
import { inferScope, resolveSkill } from '../scan.ts';
import type { EventType, SkillEvent, Trigger } from '../schema.ts';

const AGENT = 'claude_code' as const;

/** Hook payload as documented for Claude Code hook events. */
export interface ClaudeHookPayload {
  hook_event_name?: string;
  session_id?: string;
  prompt_id?: string;
  cwd?: string;
  permission_mode?: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: { skill?: string; args?: string; caller?: { type?: string } };
  tool_response?: unknown;
  tool_response_is_error?: boolean;
  tool_error?: string;
  command_name?: string;
  reason?: string;
}

const markerKey = (sessionId: string | null, skill: string): string =>
  `cc:expansion:${sessionId ?? '-'}:${skill}`;

const startKey = (toolUseId: string): string => `cc:start:${toolUseId}`;

export function adaptClaudeHook(
  payload: ClaudeHookPayload,
  now: Date = new Date(),
): SkillEvent[] {
  const event = payload.hook_event_name ?? '';

  if (event === 'UserPromptExpansion') return handleExpansion(payload);
  if (event === 'SessionEnd') return flushUnconsumedMarkers(payload, now);

  // Only the Skill tool is of interest; every other tool call is ignored so the
  // hook stays cheap enough to run on the hot path.
  if (payload.tool_name !== 'Skill') return [];

  switch (event) {
    case 'PreToolUse':
      return [buildInvoked(payload, now)];
    case 'PostToolUse':
      return [buildFinished(payload, now, 'completed')];
    case 'PostToolUseFailure':
      return [buildFinished(payload, now, 'failed')];
    default:
      return [];
  }
}

/**
 * A user-typed command. Recorded, not emitted: the matching `Skill` tool call
 * usually follows and would otherwise be counted a second time.
 */
function handleExpansion(payload: ClaudeHookPayload): SkillEvent[] {
  const skill = payload.command_name;
  if (!skill) return [];
  putPending(markerKey(payload.session_id ?? null, skill), {
    skill,
    sessionId: payload.session_id ?? null,
    cwd: payload.cwd ?? null,
    occurredAt: new Date().toISOString(),
  });
  return [];
}

function buildInvoked(payload: ClaudeHookPayload, now: Date): SkillEvent {
  const skillName = payload.tool_input?.skill ?? 'unknown';
  const sessionId = payload.session_id ?? null;
  const occurredAt = now.toISOString();

  // An expansion marker means the user typed the command; without one the model
  // selected the skill from its description alone.
  const explicit = takePending(markerKey(sessionId, skillName)) !== null;
  const trigger: Trigger = explicit
    ? 'explicit_command'
    : payload.agent_id
      ? 'subagent'
      : 'model_auto';

  if (payload.tool_use_id) {
    putPending(startKey(payload.tool_use_id), { startedAt: now.getTime(), trigger, skillName });
  }

  return skillEvent(payload, {
    eventType: 'invoked',
    skillName,
    trigger,
    occurredAt,
    outcome: null,
    errorKind: null,
    durationMs: null,
  });
}

function buildFinished(
  payload: ClaudeHookPayload,
  now: Date,
  eventType: Extract<EventType, 'completed' | 'failed'>,
): SkillEvent {
  const skillName = payload.tool_input?.skill ?? 'unknown';
  const started = payload.tool_use_id ? takePending(startKey(payload.tool_use_id)) : null;
  const startedAt = typeof started?.data.startedAt === 'number' ? started.data.startedAt : null;
  const trigger = typeof started?.data.trigger === 'string'
    ? (started.data.trigger as Trigger)
    : 'unknown';

  const isError = eventType === 'failed' || payload.tool_response_is_error === true;

  return skillEvent(payload, {
    eventType: isError ? 'failed' : 'completed',
    skillName,
    trigger,
    occurredAt: now.toISOString(),
    outcome: isError ? 'error' : 'success',
    // The error text itself is not carried; only that the class of failure occurred.
    errorKind: isError ? 'tool_error' : null,
    durationMs: startedAt === null ? null : Math.max(0, now.getTime() - startedAt),
  });
}

/**
 * Markers left behind at session end mean no `Skill` tool call ever followed the
 * user's command — so the expansion *was* the invocation, and is emitted now.
 */
function flushUnconsumedMarkers(payload: ClaudeHookPayload, now: Date): SkillEvent[] {
  const prefix = `cc:expansion:${payload.session_id ?? '-'}:`;
  return drainPrefix(prefix).map(({ entry }) => {
    const skillName = typeof entry.data.skill === 'string' ? entry.data.skill : 'unknown';
    const occurredAt = typeof entry.data.occurredAt === 'string'
      ? entry.data.occurredAt
      : now.toISOString();
    return skillEvent(
      { ...payload, cwd: (entry.data.cwd as string | undefined) ?? payload.cwd },
      {
        eventType: 'invoked',
        skillName,
        trigger: 'explicit_command',
        occurredAt,
        outcome: null,
        errorKind: null,
        durationMs: null,
      },
      // No tool call was seen, so there is no tool_use_id to correlate on.
      null,
    );
  });
}

function skillEvent(
  payload: ClaudeHookPayload,
  fields: {
    eventType: EventType;
    skillName: string;
    trigger: Trigger;
    occurredAt: string;
    outcome: SkillEvent['outcome'];
    errorKind: string | null;
    durationMs: number | null;
  },
  invocationIdOverride?: string | null,
): SkillEvent {
  const cwd = payload.cwd ?? null;
  const resolved = resolveSkill(AGENT, fields.skillName, cwd);

  return buildEvent({
    eventId: newEventId(),
    tenantId: process.env.SKILLBASE_TENANT_ID ?? null,
    principalId: process.env.SKILLBASE_PRINCIPAL_ID ?? null,
    agentInstallId: agentInstallId(AGENT),
    occurredAt: fields.occurredAt,
    agentKind: AGENT,
    agentVersion: process.env.CLAUDE_CODE_VERSION ?? null,
    skillId: null,
    skillVersionId: null,
    observedSkillName: fields.skillName,
    observedContentHash: resolved?.contentHash ?? null,
    installScope: resolved?.scope ?? inferScope(fields.skillName, null),
    eventType: fields.eventType,
    trigger: fields.trigger,
    outcome: fields.outcome,
    errorKind: fields.errorKind,
    durationMs: fields.durationMs,
    invocationId:
      invocationIdOverride === undefined ? (payload.tool_use_id ?? null) : invocationIdOverride,
    parentInvocationId: null,
    sessionId: payload.session_id ?? null,
    turnId: payload.prompt_id ?? null,
    isSubagent: Boolean(payload.agent_id),
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    costUsd: null,
    projectKey: projectKey(cwd),
    argsHash: null,
    agentMeta: {
      permissionMode: payload.permission_mode ?? null,
      agentType: payload.agent_type ?? null,
      skillVersion: resolved?.frontmatter.version ?? null,
    },
    detectedBy: 'hook',
  });
}
