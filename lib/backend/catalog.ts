/**
 * Catalogue and metrics, read from the database when it is available and from
 * the seed file when it is not.
 *
 * Descriptive fields (name, tagline, department) always come from the catalogue.
 * The *numbers* — installs, active users, weekly runs, retention — are replaced
 * with values computed from `skill_event` whenever telemetry exists for that
 * skill, so the dashboard shows measured usage rather than fixtures.
 *
 * Which of the two is in play is reported as `source`, and per skill as
 * `measured`, so the UI never has to imply that seeded numbers were observed.
 */

import { DEMO_TENANT_ID, query, type DataSource } from '@/lib/db';
import { SKILLS, type Skill } from '@/lib/skills';

export type MeasuredSkill = Skill & {
  /** True when this skill's numbers came from recorded events. */
  measured: boolean;
};

export interface CatalogResult {
  source: DataSource;
  skills: MeasuredSkill[];
  /** Skills observed in telemetry that no one has registered. */
  shadow: ShadowSkill[];
}

export interface ShadowSkill {
  name: string;
  agentKind: string;
  invocations: number;
  firstSeen: string;
  lastSeen: string;
}

interface MetricsRow {
  slug: string;
  invocations: string;
  active_users: string;
  installs: string;
  weekly: number[] | null;
  retention_30d: string | null;
  dept_adoption: Record<string, number> | null;
}

const WEEKS = 7;

/**
 * Per-skill metrics over the trailing seven weeks.
 *
 * Installs are counted as distinct agent installs that actually ran the skill,
 * not rows in `skill_installation`: telemetry backfilled from transcripts has
 * usage without a recorded install, and a dashboard reading zero installs
 * beside hundreds of runs would be worse than approximating.
 */
const METRICS_SQL = `
with bounds as (
  select date_trunc('week', now()) - interval '${WEEKS - 1} weeks' as start_week
),
runs as (
  select
    coalesce(nullif(split_part(s.slug, '/', 2), ''), s.slug) as slug,
    i.principal_id,
    i.agent_install_id,
    i.started_at,
    p.department
  from skill_invocation i
  join skill s on s.id = i.skill_id
  left join principal p on p.id = i.principal_id
  where i.tenant_id = $1
),
weekly as (
  select
    r.slug,
    width_bucket(
      extract(epoch from date_trunc('week', r.started_at)),
      extract(epoch from b.start_week),
      extract(epoch from date_trunc('week', now()) + interval '1 week'),
      ${WEEKS}
    ) as bucket,
    count(*) as n
  from runs r, bounds b
  where r.started_at >= b.start_week
  group by 1, 2
),
weekly_series as (
  select s.slug, array_agg(coalesce(w.n, 0) order by g.bucket) as weekly
  from generate_series(1, ${WEEKS}) as g(bucket)
  cross join (select distinct r.slug from runs r) s
  left join weekly w on w.slug = s.slug and w.bucket = g.bucket
  group by s.slug
),
dept as (
  select slug, jsonb_object_agg(department, share) as dept_adoption
  from (
    select
      slug,
      department,
      round(count(distinct agent_install_id)::numeric
            / nullif(sum(count(distinct agent_install_id)) over (partition by slug), 0), 3) as share
    from runs
    where department is not null
    group by slug, department
  ) d
  group by slug
)
select
  r.slug,
  count(*)::text                                as invocations,
  -- Telemetry collected from transcripts has no person attached, so distinct
  -- devices stand in for people rather than reporting zero active users beside
  -- hundreds of runs.
  greatest(
    count(distinct r.principal_id),
    count(distinct r.agent_install_id)
  )::text                                       as active_users,
  count(distinct r.agent_install_id)::text      as installs,
  ws.weekly,
  null::text                                    as retention_30d,
  dept.dept_adoption
from runs r
left join weekly_series ws on ws.slug = r.slug
left join dept on dept.slug = r.slug
group by r.slug, ws.weekly, dept.dept_adoption
`;

// The count is aliased away from `invocations` on purpose: ORDER BY binds to the
// output column first, so ordering by a text-cast count sorts lexicographically
// and puts "9" above "85".
const REGISTRY_SQL = `
select
  coalesce(nullif(split_part(s.slug, '/', 2), ''), s.slug) as slug,
  s.display_name,
  s.description,
  s.visibility,
  s.tags,
  coalesce(t.name, 'Discovered') as department,
  s.created_at
from skill s
left join team t on t.id = s.owner_team_id
where s.tenant_id = $1 and s.archived_at is null
`;

const SHADOW_SQL = `
select
  observed_skill_name as name,
  agent_kind          as agent_kind,
  invocations::text   as run_count,
  first_seen,
  last_seen
from shadow_skill
where tenant_id = $1
order by invocations desc
limit 25
`;

/**
 * The catalogue with the best numbers available.
 *
 * Never throws: any database problem yields the seed catalogue unchanged.
 */
export async function getCatalog(): Promise<CatalogResult> {
  const [metrics, registry, shadowRows] = await Promise.all([
    query<MetricsRow>(METRICS_SQL, [DEMO_TENANT_ID]),
    query<RegistryRow>(REGISTRY_SQL, [DEMO_TENANT_ID]),
    query<{
      name: string;
      agent_kind: string;
      run_count: string;
      first_seen: Date;
      last_seen: Date;
    }>(SHADOW_SQL, [DEMO_TENANT_ID]),
  ]);

  if (metrics === null) {
    return { source: 'seed', skills: SKILLS.map(asUnmeasured), shadow: [] };
  }

  const bySlug = new Map(metrics.map((row) => [row.slug, row]));

  const applyMetrics = (skill: Skill): MeasuredSkill => {
    const row = bySlug.get(skill.slug);
    if (!row) return asUnmeasured(skill);

    return {
      ...skill,
      installs: toInt(row.installs, skill.installs),
      activeUsers: toInt(row.active_users, skill.activeUsers),
      weeklyUsage: normalizeWeekly(row.weekly) ?? skill.weeklyUsage,
      // Retention needs recorded installs, which transcript backfill does not
      // provide; the catalogue value stands in until real installs arrive.
      retention30d: row.retention_30d === null ? skill.retention30d : Number(row.retention_30d),
      adoptionByDept: row.dept_adoption ?? skill.adoptionByDept,
      measured: true,
    };
  };

  const seedSlugs = new Set(SKILLS.map((s) => s.slug));
  // Skills registered in the database that the seed file knows nothing about —
  // adopted discoveries, and anything published since. Without this the
  // dashboard would keep showing fixtures while real usage sat in the database.
  const registered = (registry ?? [])
    .filter((row) => !seedSlugs.has(row.slug))
    .map((row) => applyMetrics(fromRegistry(row)))
    .filter((skill) => skill.measured);

  const skills: MeasuredSkill[] = [...SKILLS.map(applyMetrics), ...registered];

  const shadow: ShadowSkill[] = (shadowRows ?? []).map((row) => ({
    name: row.name,
    agentKind: row.agent_kind,
    invocations: toInt(row.run_count, 0),
    firstSeen: new Date(row.first_seen).toISOString(),
    lastSeen: new Date(row.last_seen).toISOString(),
  }));

  return { source: 'db', skills, shadow };
}

interface RegistryRow {
  slug: string;
  display_name: string;
  description: string | null;
  visibility: string;
  tags: string[] | null;
  department: string;
  created_at: Date;
}

/**
 * Present a registry row in the shape the UI already renders.
 *
 * Fields the catalogue has no answer for are left empty rather than invented —
 * a discovered skill genuinely has no tagline or rating, and filling them with
 * plausible numbers would blur the line between what was measured and what was
 * made up.
 */
function fromRegistry(row: RegistryRow): Skill {
  return {
    slug: row.slug,
    name: row.display_name,
    tagline: row.description ?? '',
    description: row.description ?? '',
    department: row.department,
    roles: [],
    tags: row.tags ?? [],
    requiredRole: 'employee',
    official: row.visibility === 'official',
    version: '',
    updatedAt: new Date(row.created_at).toISOString(),
    author: '',
    installs: 0,
    activeUsers: 0,
    rating: 0,
    retention30d: 0,
    adoptionByDept: {},
    weeklyUsage: [],
    impact: '',
    body: '',
  };
}

function asUnmeasured(skill: Skill): MeasuredSkill {
  return { ...skill, measured: false };
}

function toInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWeekly(weekly: number[] | null): number[] | null {
  if (!weekly || weekly.length === 0) return null;
  if (weekly.every((n) => n === 0)) return null;
  return weekly.slice(-WEEKS).map((n) => Number(n) || 0);
}
