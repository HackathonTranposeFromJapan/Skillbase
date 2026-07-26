-- Derived views: the numbers the product actually shows.
--
-- Everything the README promises — installs, active users, department adoption,
-- retention, version usage, trending — is a projection of `skill_event`. None
-- of it is stored separately, so there is nothing to keep in sync.

-- A run, reassembled from its start and end events.
--
-- Several routes may observe one run, so within a merge group only the most
-- trusted route is kept — a beacon report is dropped when a hook already saw
-- the same run.
--
-- Crucially this picks a winning *source*, not a winning *row*. Collapsing to
-- one row per merge key would also swallow genuine repeat use: running the same
-- skill twice inside one session and one time bucket is common, and against
-- real transcripts it silently lost 9 of 370 `worktree` runs. Rows from the
-- winning source are all kept, and their distinct invocation ids keep them
-- apart.
create or replace view skill_invocation as
with source_rank as (
  select
    e.tenant_id,
    e.merge_key,
    e.detected_by,
    row_number() over (
      partition by e.tenant_id, e.merge_key
      order by max(e.confidence) desc, min(e.occurred_at) asc, e.detected_by asc
    ) as source_rank
  from skill_event e
  where e.event_type in ('invoked','completed','failed')
  group by e.tenant_id, e.merge_key, e.detected_by
),
best as (
  select e.*
  from skill_event e
  join source_rank sr
    on sr.tenant_id = e.tenant_id
   and sr.merge_key = e.merge_key
   and sr.detected_by = e.detected_by
  where e.event_type in ('invoked','completed','failed')
    and sr.source_rank = 1
),
started as (
  select * from best where event_type = 'invoked'
),
finished as (
  select * from best where event_type in ('completed','failed')
)
select
  s.tenant_id,
  s.principal_id,
  s.agent_install_id,
  s.agent_kind,
  s.skill_id,
  s.skill_version_id,
  s.observed_skill_name,
  s.session_id,
  s.invocation_id,
  s.trigger,
  s.is_subagent,
  s.project_key,
  s.detected_by,
  s.confidence,
  s.occurred_at as started_at,
  f.occurred_at as ended_at,
  coalesce(f.outcome, case when f.id is null then null else 'success' end) as outcome,
  f.error_kind,
  -- Prefer the duration the collector measured; fall back to the gap between
  -- the two events when only one side reported it.
  coalesce(
    f.duration_ms,
    case when f.occurred_at is not null
         then (extract(epoch from (f.occurred_at - s.occurred_at)) * 1000)::integer
    end
  ) as duration_ms,
  coalesce(s.input_tokens, 0) + coalesce(f.input_tokens, 0)   as input_tokens,
  coalesce(s.output_tokens, 0) + coalesce(f.output_tokens, 0) as output_tokens,
  coalesce(s.cost_usd, 0) + coalesce(f.cost_usd, 0)           as cost_usd
from started s
left join finished f
  on f.tenant_id = s.tenant_id
 and f.session_id is not distinct from s.session_id
 and f.observed_skill_name = s.observed_skill_name
 and coalesce(f.invocation_id, '') = coalesce(s.invocation_id, '')
 and f.occurred_at >= s.occurred_at;

-- Daily rollup, sliced the way the dashboard reads it.
create materialized view mv_skill_daily as
select
  i.tenant_id,
  i.skill_id,
  i.observed_skill_name,
  i.agent_kind,
  p.department,
  date_trunc('day', i.started_at)::date as day,
  count(*)                                                          as invocations,
  count(distinct i.principal_id)                                    as unique_users,
  count(distinct i.agent_install_id)                                as unique_installs,
  count(*) filter (where i.outcome = 'success')                     as successes,
  count(*) filter (where i.outcome in ('error','aborted'))          as failures,
  -- The share the agent chose on its own: a description-quality score.
  count(*) filter (where i.trigger = 'model_auto')                  as auto_triggered,
  count(*) filter (where i.trigger = 'explicit_command')            as explicitly_invoked,
  percentile_cont(0.5) within group (order by i.duration_ms)        as p50_duration_ms,
  percentile_cont(0.95) within group (order by i.duration_ms)       as p95_duration_ms,
  sum(i.cost_usd)                                                   as cost_usd
from skill_invocation i
left join principal p on p.id = i.principal_id
group by 1, 2, 3, 4, 5, 6;

create unique index mv_skill_daily_uidx
  on mv_skill_daily (tenant_id, day, observed_skill_name, agent_kind, coalesce(department, ''));

-- Did installing it change anything? Cohorts by install week, measured against
-- whether the install went on to actually use the skill.
create or replace view skill_retention as
with cohort as (
  select
    si.tenant_id,
    si.skill_id,
    si.agent_install_id,
    date_trunc('week', si.installed_at)::date as install_week,
    si.installed_at
  from skill_installation si
  where si.skill_id is not null
)
select
  c.tenant_id,
  c.skill_id,
  c.install_week,
  count(*) as installs,
  count(*) filter (
    where exists (
      select 1 from skill_invocation i
      where i.tenant_id = c.tenant_id
        and i.skill_id = c.skill_id
        and i.agent_install_id = c.agent_install_id
        and i.started_at between c.installed_at and c.installed_at + interval '7 days'
    )
  ) as active_7d,
  count(*) filter (
    where exists (
      select 1 from skill_invocation i
      where i.tenant_id = c.tenant_id
        and i.skill_id = c.skill_id
        and i.agent_install_id = c.agent_install_id
        and i.started_at between c.installed_at + interval '23 days'
                             and c.installed_at + interval '30 days'
    )
  ) as active_30d
from cohort c
group by 1, 2, 3;

-- Trending: recent rate against the preceding month's daily average.
create or replace view skill_trending as
with windows as (
  select
    tenant_id,
    skill_id,
    observed_skill_name,
    sum(invocations) filter (where day >= current_date - 7)  as last_7d,
    sum(invocations) filter (where day >= current_date - 28) as last_28d
  from mv_skill_daily
  group by 1, 2, 3
)
select
  tenant_id,
  skill_id,
  observed_skill_name,
  coalesce(last_7d, 0)  as last_7d,
  coalesce(last_28d, 0) as last_28d,
  case
    when coalesce(last_28d, 0) = 0 then null
    else round((coalesce(last_7d, 0)::numeric / (last_28d::numeric / 4)), 2)
  end as trend_ratio
from windows;

-- How often the beacon actually fires, measured rather than assumed.
--
-- The beacon depends on a model following an instruction in SKILL.md, so its
-- hit rate is an empirical number. Comparing merge keys seen by a direct
-- observation against those the beacon also reported gives it — and tells us
-- whether the Codex story holds up.
create or replace view beacon_compliance as
with observed as (
  select tenant_id, agent_kind, merge_key,
         bool_or(detected_by in ('hook','transcript','otel')) as seen_directly,
         bool_or(detected_by = 'beacon')                      as seen_by_beacon
  from skill_event
  where event_type = 'invoked'
  group by 1, 2, 3
)
select
  tenant_id,
  agent_kind,
  count(*) filter (where seen_directly)                      as directly_observed,
  count(*) filter (where seen_directly and seen_by_beacon)   as also_beaconed,
  round(
    count(*) filter (where seen_directly and seen_by_beacon)::numeric
      / nullif(count(*) filter (where seen_directly), 0), 3
  ) as beacon_hit_rate
from observed
group by 1, 2;

create or replace function refresh_skill_rollups()
returns void
language sql
as $$
  refresh materialized view concurrently mv_skill_daily;
$$;
