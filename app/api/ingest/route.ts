/**
 * Telemetry ingest.
 *
 * `skilldrop-collect flush` posts SkillEvent v1 batches here. Delivery is
 * at-least-once by design — the collector retries a whole batch when a flush
 * fails — so this endpoint must be idempotent. It is: `ingest_skill_events`
 * upserts on `(tenant_id, dedupe_key)` and re-sending a batch inserts nothing.
 */

import { NextResponse } from 'next/server';

import { DEMO_TENANT_ID, query } from '@/lib/db';
import { validateSkillEvent } from '@/lib/skillbase/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH = 5_000;

export async function POST(req: Request): Promise<NextResponse> {
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

  const rows = await query<{ inserted: number }>(
    'select ingest_skill_events($1::uuid, $2::jsonb) as inserted',
    [DEMO_TENANT_ID, JSON.stringify(accepted)],
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
    ...(rejected.length > 0 ? { errors: rejected.slice(0, 5) } : {}),
  });
}

export async function GET(): Promise<NextResponse> {
  const rows = await query<{ events: string; skills: string; last: Date | null }>(
    `select count(*)::text as events,
            count(distinct observed_skill_name)::text as skills,
            max(occurred_at) as last
       from skill_event where tenant_id = $1`,
    [DEMO_TENANT_ID],
  );

  if (rows === null) return NextResponse.json({ ready: false, reason: 'database unavailable' });

  return NextResponse.json({
    ready: true,
    events: Number(rows[0]?.events ?? 0),
    skills: Number(rows[0]?.skills ?? 0),
    lastEventAt: rows[0]?.last ? new Date(rows[0].last).toISOString() : null,
  });
}
