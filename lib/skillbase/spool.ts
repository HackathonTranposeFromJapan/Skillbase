/**
 * Local durable spool.
 *
 * Every event is appended to a local file first and uploaded separately. A hook
 * runs on the agent's critical path, so it must never block on the network and
 * must never fail the tool call it is observing — a telemetry outage has to be
 * invisible to the person doing their work.
 */

import { appendFileSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { skillbaseHome } from './identity.ts';
import { validateSkillEvent, type SkillEvent } from './schema.ts';

export const SPOOL_FILE = 'spool.jsonl';

export function spoolPath(): string {
  return join(skillbaseHome(), SPOOL_FILE);
}

/**
 * Append events. Returns how many were written; validation failures are
 * reported rather than thrown so one malformed adapter output cannot take the
 * whole hook down.
 */
export function appendEvents(events: SkillEvent[]): { written: number; errors: string[] } {
  const errors: string[] = [];
  const lines: string[] = [];

  for (const event of events) {
    const result = validateSkillEvent(event);
    if (!result.ok) {
      errors.push(`${event.observedSkillName ?? 'unknown'}: ${result.errors.join('; ')}`);
      continue;
    }
    lines.push(JSON.stringify(result.value));
  }

  if (lines.length > 0) {
    try {
      mkdirSync(skillbaseHome(), { recursive: true });
      appendFileSync(spoolPath(), `${lines.join('\n')}\n`, 'utf8');
    } catch (error) {
      errors.push(`spool write failed: ${String(error)}`);
      return { written: 0, errors };
    }
  }
  return { written: lines.length, errors };
}

export function readSpool(): SkillEvent[] {
  if (!existsSync(spoolPath())) return [];
  const events: SkillEvent[] = [];
  for (const line of readFileSync(spoolPath(), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as SkillEvent);
    } catch {
      // A partially written final line is expected after a crash; skip it.
    }
  }
  return events;
}

export function clearSpool(): void {
  try {
    unlinkSync(spoolPath());
  } catch {
    // Already gone.
  }
}

export interface FlushResult {
  sent: number;
  remaining: number;
  error: string | null;
}

/**
 * Upload the spool in batches. On any failure the spool is left intact so the
 * next run retries — at-least-once delivery, with `dedupeKey` making the
 * duplicates harmless at ingest.
 */
export async function flushSpool(options: {
  endpoint?: string;
  token?: string;
  batchSize?: number;
} = {}): Promise<FlushResult> {
  const endpoint = options.endpoint ?? process.env.SKILLBASE_INGEST_URL;
  const token = options.token ?? process.env.SKILLBASE_TOKEN;
  const batchSize = options.batchSize ?? 500;

  const events = readSpool();
  if (events.length === 0) return { sent: 0, remaining: 0, error: null };
  if (!endpoint) {
    return { sent: 0, remaining: events.length, error: 'SKILLBASE_INGEST_URL is not set' };
  }

  let sent = 0;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ events: batch }),
      });
      if (!response.ok) {
        writeRemaining(events.slice(sent));
        return { sent, remaining: events.length - sent, error: `HTTP ${response.status}` };
      }
      sent += batch.length;
    } catch (error) {
      writeRemaining(events.slice(sent));
      return { sent, remaining: events.length - sent, error: String(error) };
    }
  }

  writeRemaining(events.slice(sent));
  return { sent, remaining: events.length - sent, error: null };
}

function writeRemaining(events: SkillEvent[]): void {
  const path = spoolPath();
  if (events.length === 0) {
    clearSpool();
    return;
  }
  // Rewrite via a temp file so a crash mid-flush cannot truncate unsent events.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');
  renameSync(tmp, path);
}
