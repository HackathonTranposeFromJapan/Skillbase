/**
 * Database access for the Skillbase backend.
 *
 * The whole surface is built so that a missing or broken database degrades to
 * the seed catalogue instead of breaking the app. That is a demo requirement
 * first — a dead database during a judging session must not blank the screen —
 * but it is also how the product should behave: analytics are an enhancement
 * over the catalogue, not a prerequisite for reading it.
 *
 * Consequently nothing here throws. Every helper returns `null` on failure and
 * the caller falls back.
 */

import { Pool, type QueryResultRow } from 'pg';

import { DEMO_TENANT_ID } from './tenant';

export { DEMO_TENANT_ID };

const CONNECT_TIMEOUT_MS = 2_000;
const QUERY_TIMEOUT_MS = 5_000;

declare global {
  // Next.js dev reloads modules; without this the pool is recreated per reload
  // until Postgres refuses new connections.
  // eslint-disable-next-line no-var
  var __skillbasePool: Pool | null | undefined;
}

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL ?? null;
}

export function getPool(): Pool | null {
  if (globalThis.__skillbasePool !== undefined) return globalThis.__skillbasePool;

  const url = databaseUrl();
  if (!url) {
    globalThis.__skillbasePool = null;
    return null;
  }

  const pool = new Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
  });
  // An idle client erroring out must not take the process down.
  pool.on('error', () => {});

  globalThis.__skillbasePool = pool;
  return pool;
}

/**
 * Run a query, returning `null` rather than throwing when the database is
 * unreachable or the statement fails. Callers treat `null` as "fall back".
 *
 * Every statement runs in a transaction that sets `app.current_tenant_id`,
 * because the schema uses FORCE ROW LEVEL SECURITY — which applies to the table
 * owner too. Without the setting the policies match nothing and every query
 * quietly returns zero rows, so this is what makes reads work at all, and it
 * means tenant isolation is enforced by the database rather than by remembering
 * to add a WHERE clause.
 */
export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  tenantId: string = DEMO_TENANT_ID,
): Promise<T[] | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local statement_timeout = ${QUERY_TIMEOUT_MS}`);
      await client.query('select set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const result = await client.query<T>(sql, params);
      await client.query('commit');
      return result.rows;
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (process.env.SKILLBASE_DEBUG) {
      console.error('[skillbase:db]', (error as Error).message);
    }
    return null;
  }
}

/** True when the schema is present and reachable. */
export async function isDatabaseReady(): Promise<boolean> {
  const rows = await query<{ ok: boolean }>(
    "select to_regclass('public.skill_event') is not null as ok",
  );
  return rows?.[0]?.ok === true;
}

/** Where a response's numbers came from, so the UI can say so honestly. */
export type DataSource = 'db' | 'seed';
