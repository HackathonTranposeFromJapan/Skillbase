/**
 * Skill update feed — what was published or changed recently.
 *
 * The README promises this ("The Design QA skill was updated yesterday"), and
 * the data was already there: `skill_version` records every published state
 * with its content hash, so a second row for a skill is, by definition, an
 * update rather than a new skill.
 *
 * Built on our own rows rather than Hexclave webhooks. Hexclave's webhooks
 * report *user and team* changes — useful for keeping `principal` in sync, and
 * a natural next step — but a skill being republished is our domain event, and
 * an inbound webhook cannot reach a laptop on localhost anyway.
 *
 * Read-only and served separately from the dashboard so rendering it is the
 * frontend's choice.
 */

import { NextResponse } from 'next/server';

import { bearerToken, resolveCaller } from '@/lib/backend/identity';
import { canSee, getViewer } from '@/lib/backend/visibility';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPDATES_SQL = `
select
  coalesce(nullif(split_part(s.slug, '/', 2), ''), s.slug) as slug,
  s.display_name,
  s.visibility,
  coalesce(t.name, 'Discovered')                           as team,
  sv.semver,
  sv.published_at,
  -- The first version of a skill is a publish; any later one is an update.
  (count(*) over (partition by sv.skill_id)) > 1           as has_history,
  row_number() over (partition by sv.skill_id order by sv.published_at) as version_number
from skill_version sv
join skill s on s.id = sv.skill_id
left join team t on t.id = s.owner_team_id
where sv.tenant_id = $1 and s.archived_at is null
order by sv.published_at desc
limit 50
`;

interface Row {
  slug: string;
  display_name: string;
  visibility: string;
  team: string;
  semver: string | null;
  published_at: Date;
  has_history: boolean;
  version_number: string;
}

export async function GET(req: Request): Promise<NextResponse> {
  const caller = await resolveCaller(bearerToken(req));
  const rows = await query<Row>(UPDATES_SQL, [caller.tenantId], caller.tenantId);

  if (rows === null) {
    return NextResponse.json({ updates: [], source: 'unavailable' });
  }

  // Same governance as the catalogue: an update to a skill you may not see is
  // not something you should learn about from the feed.
  const viewer = await getViewer();

  const updates = rows
    .filter((row) => canSee(viewer, row.visibility))
    .map((row) => ({
      slug: row.slug,
      name: row.display_name,
      team: row.team,
      version: row.semver,
      visibility: row.visibility,
      type: Number(row.version_number) > 1 ? 'updated' : 'published',
      at: new Date(row.published_at).toISOString(),
    }));

  return NextResponse.json({ updates, source: 'db', accessEnforced: viewer.enforced });
}
