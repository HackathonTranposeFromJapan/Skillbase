/**
 * Identity, hashing and event construction.
 *
 * The Agent Skills standard defines no skill id, namespace, version pinning or
 * provenance — a skill is identified by its directory name. Skillbase supplies
 * that layer: a canonical `team/skill-name` slug plus a content hash of the
 * SKILL.md, which is what lets an observed name on one laptop be matched to a
 * registry entry.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname, platform } from 'node:os';
import { join } from 'node:path';

import {
  SCHEMA_VERSION,
  SOURCE_CONFIDENCE,
  type SkillEvent,
  type SkillEventInput,
} from './schema.ts';

/** Window used to correlate observations of one run that carry no shared id. */
export const MERGE_BUCKET_MS = 120_000;

export const sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

/** Truncated digest — enough to be collision-free in practice, short in logs. */
export const shortHash = (input: string): string => sha256(input).slice(0, 32);

export function skillbaseHome(): string {
  return process.env.SKILLBASE_HOME ?? join(homedir(), '.skillbase');
}

function ensureHome(): string {
  const dir = skillbaseHome();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

interface DeviceIdentity {
  machineIdHash: string;
  /** Local secret; salts every hash so device data is not cross-org linkable. */
  salt: string;
  agentInstallIds: Record<string, string>;
}

/**
 * Device identity is created once and reused. The salt never leaves the device,
 * so `projectKey` and `machineIdHash` cannot be reversed or joined across
 * tenants by anyone holding the warehouse.
 */
export function loadDeviceIdentity(): DeviceIdentity {
  const dir = ensureHome();
  const file = join(dir, 'device.json');
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DeviceIdentity>;
      if (parsed.salt && parsed.machineIdHash) {
        return {
          salt: parsed.salt,
          machineIdHash: parsed.machineIdHash,
          agentInstallIds: parsed.agentInstallIds ?? {},
        };
      }
    } catch {
      // Corrupt identity file: fall through and regenerate rather than fail the hook.
    }
  }
  const salt = randomUUID();
  const identity: DeviceIdentity = {
    salt,
    machineIdHash: shortHash(`${salt}:${hostname()}:${platform()}`),
    agentInstallIds: {},
  };
  writeFileSync(file, JSON.stringify(identity, null, 2), 'utf8');
  return identity;
}

/**
 * One person routinely runs several agents on several machines; each pairing is
 * its own install so per-agent adoption is measurable.
 */
export function agentInstallId(agentKind: string): string {
  const identity = loadDeviceIdentity();
  const existing = identity.agentInstallIds[agentKind];
  if (existing) return existing;

  const id = shortHash(`${identity.salt}:${identity.machineIdHash}:${agentKind}`);
  identity.agentInstallIds[agentKind] = id;
  writeFileSync(join(ensureHome(), 'device.json'), JSON.stringify(identity, null, 2), 'utf8');
  return id;
}

/** Hashed repo identity — the analytics need "same project", not the path. */
export function projectKey(cwd: string | null | undefined): string | null {
  if (!cwd) return null;
  return shortHash(`${loadDeviceIdentity().salt}:project:${cwd}`);
}

/**
 * Content identity of a skill. Frontmatter and body are hashed after
 * normalizing line endings and trailing whitespace so that a checkout on
 * Windows hashes the same as one on Linux.
 */
export function skillContentHash(skillMarkdown: string): string {
  const normalized = skillMarkdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
  return sha256(normalized);
}

export function hashSkillFile(path: string): string | null {
  try {
    return skillContentHash(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Idempotency key: the same observation resent (hook retry, backfill re-run)
 * collapses to one row. Scoped to the source, so a hook and a transcript
 * observation of one run remain two rows — deliberately, since comparing them
 * is how beacon compliance gets measured.
 */
export function buildDedupeKey(e: {
  detectedBy: string;
  agentInstallId: string;
  sessionId: string | null;
  invocationId: string | null;
  observedSkillName: string;
  eventType: string;
  occurredAt: string;
}): string {
  const invocation = e.invocationId ?? `t:${bucket(e.occurredAt)}`;
  return shortHash(
    [e.detectedBy, e.agentInstallId, e.sessionId ?? '-', invocation, e.observedSkillName, e.eventType].join('|'),
  );
}

/**
 * Correlation key across sources. Bucketed by time because the beacon has no
 * access to the agent's `tool_use_id`, so a beacon and a hook observing the
 * same run can only be tied together by (install, session, skill, phase, ~when).
 */
export function buildMergeKey(e: {
  agentInstallId: string;
  sessionId: string | null;
  observedSkillName: string;
  eventType: string;
  occurredAt: string;
}): string {
  return shortHash(
    [e.agentInstallId, e.sessionId ?? '-', e.observedSkillName, e.eventType, bucket(e.occurredAt)].join('|'),
  );
}

function bucket(occurredAt: string): number {
  const ms = Date.parse(occurredAt);
  return Math.floor((Number.isNaN(ms) ? 0 : ms) / MERGE_BUCKET_MS);
}

/** Finalize an adapter's output into a complete, self-describing event. */
export function buildEvent(input: SkillEventInput): SkillEvent {
  return {
    ...input,
    schemaVersion: SCHEMA_VERSION,
    dedupeKey: buildDedupeKey(input),
    mergeKey: buildMergeKey(input),
    confidence: input.confidence ?? SOURCE_CONFIDENCE[input.detectedBy],
    receivedAt: null,
  };
}

export const newEventId = (): string => randomUUID();
