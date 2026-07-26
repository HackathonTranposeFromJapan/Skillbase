/**
 * Telemetry ingest.
 *
 * `skilldrop-collect flush` posts SkillEvent v1 batches here. Delivery is
 * at-least-once by design — the collector retries a whole batch when a flush
 * fails — so this endpoint must be idempotent. It is: `ingest_skill_events`
 * upserts on `(tenant_id, dedupe_key)` and re-sending a batch inserts nothing.
 */

import { NextResponse } from 'next/server';

import { bearerToken, hexclaveEnabled, resolveCaller } from '@/lib/backend/identity';
import { query } from '@/lib/db';
import { validateSkillEvent } from '@/lib/skillbase/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH = 5_000;

export async function POST(req: Request): Promise<NextResponse> {
  // Who the events belong to is decided by the token, never by the payload —
  // otherwise any caller could attribute activity to anyone.
  //
  // Rejecting anonymous callers outright is the right production posture but the
  // wrong default: it would mean a fresh clone collects nothing until someone
  // completes a browser login, and it silently breaks the collector, which keeps
  // its spool and retries. So anonymous events are accepted into the demo tenant
  // and only *attributed* when a token proves who sent them. Set
  // SKILLBASE_REQUIRE_AUTH=1 to enforce.
  const caller = await resolveCaller(bearerToken(req));
  const requireAuth = process.env.SKILLBASE_REQUIRE_AUTH === '1';
  if (requireAuth && hexclaveEnabled() && !caller.authenticated) {
    return NextResponse.json(
      { error: 'unauthorized — run `skillbase login` first' },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const events = (body as { events?: unknown })?.events;

  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'expected { events: SkillEvent[] }' }, { status: 400 });
  }
  if (events.length === 0) {
    return NextResponse.json({ received: 0, inserted: 0, rejected: 0 });
  }
  if (events.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `batch too large: ${events.length} > ${MAX_BATCH}` },
      { status: 413 },
    );
  }

  // Validated here as well as in the collector: this is a network boundary, and
  // the metadata-only guarantee is only worth something if it is enforced where
  // untrusted input arrives.
  const accepted: unknown[] = [];
  const rejected: string[] = [];
  for (const event of events) {
    const result = validateSkillEvent(event);
    if (result.ok) accepted.push(result.value);
    else rejected.push(result.errors[0] ?? 'invalid event');
  }

  if (accepted.length === 0) {
    return NextResponse.json(
      { received: events.length, inserted: 0, rejected: rejected.length, errors: rejected.slice(0, 5) },
      { status: 422 },
    );
  }

  // Stamp the verified identity onto every event, overriding whatever the
  // client sent. The device knows which machine it is; only the server knows
  // who the person is.
  const attributed = accepted.map((event) => ({
    ...(event as Record<string, unknown>),
    tenantId: caller.tenantId,
    ...(caller.principalId ? { principalId: caller.principalId } : {}),
  }));

  const rows = await query<{ inserted: number }>(
    'select ingest_skill_events($1::uuid, $2::jsonb) as inserted',
    [caller.tenantId, JSON.stringify(attributed)],
    caller.tenantId,
  );

  if (rows === null) {
    // The collector keeps the spool on a non-2xx and retries, so a database
    // outage delays telemetry rather than losing it.
    return NextResponse.json({ error: 'database unavailable' }, { status: 503 });
  }

  return NextResponse.json({
    received: events.length,
    inserted: rows[0]?.inserted ?? 0,
    rejected: rejected.length,
    attributedTo: caller.authenticated
      ? { user: caller.displayName, team: caller.teamName }
      : 'demo tenant (Hexclave not configured)',
    ...(rejected.length > 0 ? { errors: rejected.slice(0, 5) } : {}),
  });
}

export async function GET(req: Request): Promise<NextResponse> {
  // Health reports on the caller's own tenant, so a signed-in user sees their
  // team's counts rather than the demo tenant's.
  const caller = await resolveCaller(bearerToken(req));
  const rows = await query<{ events: string; skills: string; last: Date | null }>(
    `select count(*)::text as events,
            count(distinct observed_skill_name)::text as skills,
            max(occurred_at) as last
       from skill_event where tenant_id = $1`,
    [caller.tenantId],
    caller.tenantId,
  );

  if (rows === null) return NextResponse.json({ ready: false, reason: 'database unavailable' });

  return NextResponse.json({
    ready: true,
    events: Number(rows[0]?.events ?? 0),
    skills: Number(rows[0]?.skills ?? 0),
    lastEventAt: rows[0]?.last ? new Date(rows[0].last).toISOString() : null,
  });
}
