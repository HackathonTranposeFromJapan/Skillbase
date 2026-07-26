/**
 * Short-lived local state shared between hook invocations.
 *
 * Hooks are separate processes, so anything that spans two events — pairing a
 * `PreToolUse` with its `PostToolUse` to get a duration, or remembering that the
 * user typed `/foo` before the agent acted on it — has to be parked on disk.
 *
 * Entries expire; this is a correlation buffer, not a database.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { skillbaseHome } from './identity.ts';

const TTL_MS = 30 * 60 * 1000;

export interface PendingEntry {
  ts: number;
  data: Record<string, unknown>;
}

type Store = Record<string, PendingEntry>;

function storePath(): string {
  return join(skillbaseHome(), 'pending.json');
}

function readStore(): Store {
  try {
    const raw = readFileSync(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as Store;
    const now = Date.now();
    const fresh: Store = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.ts === 'number' && now - entry.ts < TTL_MS) fresh[key] = entry;
    }
    return fresh;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true });
  // Write-then-rename: two agents can run hooks concurrently, and a torn file
  // would silently break correlation for every later event.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store), 'utf8');
  renameSync(tmp, path);
}

export function putPending(key: string, data: Record<string, unknown>): void {
  const store = readStore();
  store[key] = { ts: Date.now(), data };
  writeStore(store);
}

/** Read and remove in one step — a marker must only be consumed once. */
export function takePending(key: string): PendingEntry | null {
  const store = readStore();
  const entry = store[key];
  if (!entry) return null;
  delete store[key];
  writeStore(store);
  return entry;
}

export function peekPending(key: string): PendingEntry | null {
  return readStore()[key] ?? null;
}

/** Remove and return every entry whose key starts with `prefix`. */
export function drainPrefix(prefix: string): Array<{ key: string; entry: PendingEntry }> {
  const store = readStore();
  const drained: Array<{ key: string; entry: PendingEntry }> = [];
  for (const [key, entry] of Object.entries(store)) {
    if (key.startsWith(prefix)) {
      drained.push({ key, entry });
      delete store[key];
    }
  }
  if (drained.length > 0) writeStore(store);
  return drained;
}

export function pendingStoreExists(): boolean {
  return existsSync(storePath());
}
