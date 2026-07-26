/**
 * Activity feed, backed by recorded telemetry.
 *
 * Merges two sources: events this server recorded during the session (a live
 * `skilldrop install`, which should appear instantly) and events collected from
 * real agent sessions. Live-first, because the demo's whole point is that an
 * action taken on stage shows up immediately, while the history behind it is
 * genuine rather than staged.
 */

import { DEMO_TENANT_ID, query } from '@/lib/db';
import { listEvents, type SkillEvent as DemoEvent } from '@/lib/events';

const RECENT_SQL = `
select
  e.id,
  e.observed_skill_name                     as slug,
  e.event_type                              as event_type,
  e.agent_kind                              as agent_kind,
  coalesce(p.display_name, p.department, e.agent_kind) as actor,
  coalesce(p.department, 'Unassigned')      as department,
  e.occurred_at                             as at
from skill_event e
left join principal p on p.id = e.principal_id
where e.tenant_id = $1
  and e.event_type in ('invoked','installed','updated','uninstalled')
order by e.occurred_at desc
limit $2
`;

interface RecentRow {
  id: string;
  slug: string;
  event_type: string;
  agent_kind: string;
  actor: string;
  department: string;
  at: Date;
}

const TYPE_MAP: Record<string, DemoEvent['type']> = {
  invoked: 'run',
  installed: 'install',
  updated: 'update',
  uninstalled: 'uninstall',
};

export async function getFeed(limit = 30): Promise<{ events: DemoEvent[]; source: 'db' | 'seed' }> {
  const live = listEvents(limit).filter((e) => e.live);
  const rows = await query<RecentRow>(RECENT_SQL, [DEMO_TENANT_ID, limit]);

  if (rows === null) return { events: listEvents(limit), source: 'seed' };

  const recorded: DemoEvent[] = rows.map((row) => ({
    // Negative ids keep these from colliding with the in-memory counter.
    id: -Number(row.id),
    type: TYPE_MAP[row.event_type] ?? 'run',
    slug: row.slug,
    actor: row.actor,
    department: row.department,
    at: new Date(row.at).toISOString(),
    live: false,
  }));

  if (recorded.length === 0) return { events: listEvents(limit), source: 'seed' };

  return { events: [...live, ...recorded].slice(0, limit), source: 'db' };
}
