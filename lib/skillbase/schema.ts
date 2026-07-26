/**
 * SkillEvent v1 — the single agent-agnostic contract for skill-usage telemetry.
 *
 * Every detection route (Claude Code hooks, Codex hooks, the SKILL.md beacon,
 * transcript backfill, OTel) normalizes into this shape. Supporting a new agent
 * means adding an adapter, never changing this schema.
 *
 * Privacy: metadata only. Prompts, skill arguments and tool output are never
 * carried here — only `argsHash` when an org explicitly opts in.
 */

export const SCHEMA_VERSION = 1;

/** Agents that read the Agent Skills (SKILL.md) open standard. */
export const AGENT_KINDS = [
  'claude_code',
  'codex',
  'cursor',
  'gemini_cli',
  'hermes',
  'opencode',
  'goose',
  'other',
] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const EVENT_TYPES = [
  'invoked',
  'completed',
  'failed',
  'installed',
  'updated',
  'uninstalled',
  'listed',
  'blocked',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * How the skill came to be used. `model_auto` vs `explicit_command` is the
 * signal that tells whether a skill's `description` actually earns its own
 * discovery, which is what the recommendation layer is built on.
 */
export const TRIGGERS = [
  'explicit_command',
  'model_auto',
  'subagent',
  'scheduled',
  'unknown',
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const OUTCOMES = ['success', 'error', 'aborted'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const DETECTION_SOURCES = ['hook', 'beacon', 'transcript', 'otel', 'api'] as const;
export type DetectedBy = (typeof DETECTION_SOURCES)[number];

export const INSTALL_SCOPES = ['user', 'project', 'admin', 'plugin', 'unknown'] as const;
export type InstallScope = (typeof INSTALL_SCOPES)[number];

/**
 * Trust we place in each route, used when several routes observe the same run.
 * Hooks and transcripts are direct observations of the agent's own record;
 * the beacon depends on the model actually following the SKILL.md instruction,
 * so it is deliberately ranked below them.
 */
export const SOURCE_CONFIDENCE: Record<DetectedBy, number> = {
  api: 1,
  hook: 1,
  transcript: 0.99,
  otel: 0.95,
  beacon: 0.8,
};

export interface SkillEvent {
  schemaVersion: number;

  // --- identity of this record ---
  /** Client-generated UUID. */
  eventId: string;
  /** Idempotency within one source: re-sending the same observation is a no-op. */
  dedupeKey: string;
  /** Cross-source correlation: the same run seen by hook + beacon shares this. */
  mergeKey: string;

  // --- who ---
  tenantId: string | null;
  principalId: string | null;
  agentInstallId: string;

  // --- when ---
  /** Device clock, ISO-8601. */
  occurredAt: string;
  /** Server clock, filled at ingest. */
  receivedAt?: string | null;

  // --- which agent ---
  agentKind: AgentKind;
  agentVersion: string | null;

  // --- which skill ---
  /** Canonical Skillbase id (`team/skill-name`), null until the resolver binds it. */
  skillId: string | null;
  skillVersionId: string | null;
  /** Raw name as the agent reported it. Never dropped — unresolved names are how shadow skills get discovered. */
  observedSkillName: string;
  /** SHA-256 of the normalized SKILL.md on disk; the join key to `skill_version`. */
  observedContentHash: string | null;
  /** Where the skill was loaded from. */
  installScope: InstallScope;

  // --- what happened ---
  eventType: EventType;
  trigger: Trigger;
  outcome: Outcome | null;
  errorKind: string | null;
  durationMs: number | null;

  // --- correlation ---
  /** Stable per skill run. Claude Code/Codex `tool_use_id`, or the beacon's `--run`. */
  invocationId: string | null;
  parentInvocationId: string | null;
  sessionId: string | null;
  turnId: string | null;
  isSubagent: boolean;

  // --- cost ---
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  costUsd: number | null;

  // --- context (hashed; no paths or branch names leave the device) ---
  projectKey: string | null;
  /** Present only when the org opts into argument collection. */
  argsHash: string | null;
  /** Agent-specific extras that have no canonical home. */
  agentMeta: Record<string, unknown>;

  // --- provenance of the observation itself ---
  detectedBy: DetectedBy;
  confidence: number;
}

/** Fields an adapter must supply; everything else is defaulted. */
export type SkillEventInput = Omit<
  SkillEvent,
  'schemaVersion' | 'dedupeKey' | 'mergeKey' | 'confidence' | 'receivedAt'
> & { confidence?: number };

const isString = (v: unknown): v is string => typeof v === 'string';
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isOneOf<T extends readonly string[]>(v: unknown, allowed: T): v is T[number] {
  return isString(v) && (allowed as readonly string[]).includes(v);
}

export type ValidationResult =
  | { ok: true; value: SkillEvent }
  | { ok: false; errors: string[] };

/**
 * Runtime validation. Hand-rolled rather than schema-library based so the CLI
 * stays dependency-free — it runs on every hook invocation and via `npx`, where
 * cold-start cost and install failures are user-visible.
 */
export function validateSkillEvent(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { ok: false, errors: ['event must be an object'] };
  }
  const e = input as Record<string, unknown>;

  const req = (field: string, ok: boolean, expected: string): void => {
    if (!ok) errors.push(`${field}: expected ${expected}, got ${JSON.stringify(e[field])}`);
  };

  req('schemaVersion', isFiniteNumber(e.schemaVersion), 'number');
  req('eventId', isString(e.eventId) && e.eventId.length > 0, 'non-empty string');
  req('dedupeKey', isString(e.dedupeKey) && e.dedupeKey.length > 0, 'non-empty string');
  req('mergeKey', isString(e.mergeKey) && e.mergeKey.length > 0, 'non-empty string');
  req('agentInstallId', isString(e.agentInstallId) && e.agentInstallId.length > 0, 'non-empty string');
  req('occurredAt', isString(e.occurredAt) && !Number.isNaN(Date.parse(e.occurredAt)), 'ISO-8601 timestamp');
  req('agentKind', isOneOf(e.agentKind, AGENT_KINDS), `one of ${AGENT_KINDS.join('|')}`);
  req('observedSkillName', isString(e.observedSkillName) && e.observedSkillName.length > 0, 'non-empty string');
  req('eventType', isOneOf(e.eventType, EVENT_TYPES), `one of ${EVENT_TYPES.join('|')}`);
  req('trigger', isOneOf(e.trigger, TRIGGERS), `one of ${TRIGGERS.join('|')}`);
  req('installScope', isOneOf(e.installScope, INSTALL_SCOPES), `one of ${INSTALL_SCOPES.join('|')}`);
  req('detectedBy', isOneOf(e.detectedBy, DETECTION_SOURCES), `one of ${DETECTION_SOURCES.join('|')}`);
  req('isSubagent', typeof e.isSubagent === 'boolean', 'boolean');
  req(
    'confidence',
    isFiniteNumber(e.confidence) && e.confidence >= 0 && e.confidence <= 1,
    'number in [0,1]',
  );
  req(
    'agentMeta',
    typeof e.agentMeta === 'object' && e.agentMeta !== null && !Array.isArray(e.agentMeta),
    'object',
  );

  if (e.outcome !== null && e.outcome !== undefined && !isOneOf(e.outcome, OUTCOMES)) {
    errors.push(`outcome: expected null or one of ${OUTCOMES.join('|')}`);
  }

  const nullableStrings = [
    'tenantId', 'principalId', 'agentVersion', 'skillId', 'skillVersionId',
    'observedContentHash', 'errorKind', 'invocationId', 'parentInvocationId',
    'sessionId', 'turnId', 'projectKey', 'argsHash',
  ] as const;
  for (const f of nullableStrings) {
    const v = e[f];
    if (v !== null && v !== undefined && !isString(v)) errors.push(`${f}: expected string or null`);
  }

  const nullableNumbers = [
    'durationMs', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'costUsd',
  ] as const;
  for (const f of nullableNumbers) {
    const v = e[f];
    if (v !== null && v !== undefined && !isFiniteNumber(v)) errors.push(`${f}: expected number or null`);
  }

  // A metadata-only pipeline must never carry free text. Catch adapter mistakes
  // at the boundary rather than discovering raw prompts in the warehouse later.
  for (const banned of ['args', 'prompt', 'output', 'toolResponse', 'content']) {
    if (banned in e) errors.push(`${banned}: forbidden field (metadata-only telemetry)`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as SkillEvent };
}
