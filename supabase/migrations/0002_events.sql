-- The event store: one append-only fact table for every agent.
--
-- Deliberately not one table per agent. The collector normalizes Claude Code
-- hooks, Codex hooks, beacons, transcripts and OTel into a single shape, and
-- anything genuinely agent-specific goes to `agent_meta`. Supporting a new
-- agent is then an adapter, not a migration.

create table skill_event (
  id                    bigint generated always as identity primary key,
  schema_version        int not null default 1,

  -- Client-generated, so a device can construct events offline.
  event_id              uuid not null,
  -- Idempotency within one source: replays and hook retries collapse here.
  dedupe_key            text not null,
  -- Cross-source correlation: the same run seen by a hook and by a beacon
  -- shares this, which is what lets the resolver pick the best observation
  -- instead of counting the run twice.
  merge_key             text not null,

  tenant_id             uuid not null references tenant(id) on delete cascade,
  principal_id          uuid references principal(id) on delete set null,
  agent_install_id      uuid references agent_install(id) on delete set null,

  occurred_at           timestamptz not null,
  received_at           timestamptz not null default now(),

  agent_kind            text not null,
  agent_version         text,

  -- Null until the resolver binds it. Events are never rejected for being
  -- unresolvable: a skill nobody registered is exactly what the company most
  -- needs to find out about.
  skill_id              uuid references skill(id) on delete set null,
  skill_version_id      uuid references skill_version(id) on delete set null,
  observed_skill_name   text not null,
  observed_content_hash text,
  install_scope         text not null default 'unknown'
                        check (install_scope in ('user','project','admin','plugin','unknown')),

  event_type            text not null
                        check (event_type in ('invoked','completed','failed','installed',
                                              'updated','uninstalled','listed','blocked')),
  -- Whether the person asked for the skill by name or the agent chose it from
  -- the description alone. The auto-selection rate is a direct measure of how
  -- well a skill describes itself, which is what the recommender is built on.
  trigger               text not null default 'unknown'
                        check (trigger in ('explicit_command','model_auto','subagent','scheduled','unknown')),
  outcome               text check (outcome in ('success','error','aborted')),
  error_kind            text,
  duration_ms           integer check (duration_ms >= 0),

  invocation_id         text,
  parent_invocation_id  text,
  session_id            text,
  turn_id               text,
  is_subagent           boolean not null default false,

  input_tokens          integer,
  output_tokens         integer,
  cache_read_tokens     integer,
  cost_usd              numeric(12,6),

  -- Hashed on the device; no path, branch name or repo URL is transmitted.
  project_key           text,
  args_hash             text,
  agent_meta            jsonb not null default '{}'::jsonb,

  detected_by           text not null check (detected_by in ('hook','beacon','transcript','otel','api')),
  confidence            numeric(3,2) not null default 1.0 check (confidence between 0 and 1)
);

-- At-least-once delivery makes duplicates routine, so idempotency is enforced
-- rather than hoped for: the collector retries a failed flush wholesale.
create unique index skill_event_dedupe_uidx on skill_event (tenant_id, dedupe_key);

-- Left unpartitioned on purpose. Partitioning by month would force
-- `occurred_at` into every unique index, which would let a backfill re-run in a
-- later month re-insert events it already sent. Correct de-duplication is worth
-- more here than partition pruning; revisit when volume actually demands it,
-- and add `occurred_at` to the key knowingly at that point.
create index skill_event_occurred_idx on skill_event (tenant_id, occurred_at desc);
create index skill_event_skill_idx on skill_event (tenant_id, skill_id, occurred_at desc);
create index skill_event_merge_idx on skill_event (tenant_id, merge_key);
create index skill_event_unresolved_idx on skill_event (tenant_id, observed_skill_name)
  where skill_id is null;

-- Bind observed events to registry entries: content hash first (exact), then a
-- curated alias, then a plain name match within the tenant. Re-runnable, and
-- only ever fills in nulls.
create or replace function resolve_skill_events(p_tenant uuid, p_limit int default 50000)
returns integer
language plpgsql
as $$
declare
  v_resolved integer := 0;
  v_count integer;
begin
  with candidate as (
    select e.id, sv.skill_id, sv.id as skill_version_id
    from skill_event e
    join skill_version sv
      on sv.tenant_id = e.tenant_id
     and sv.content_hash = e.observed_content_hash
    where e.tenant_id = p_tenant
      and e.skill_id is null
      and e.observed_content_hash is not null
    limit p_limit
  )
  update skill_event e
     set skill_id = c.skill_id,
         skill_version_id = c.skill_version_id
    from candidate c
   where e.id = c.id;
  get diagnostics v_count = row_count;
  v_resolved := v_resolved + v_count;

  update skill_event e
     set skill_id = a.skill_id
    from skill_alias a
   where e.tenant_id = p_tenant
     and e.skill_id is null
     and a.tenant_id = e.tenant_id
     and a.observed_name = e.observed_skill_name
     and (a.agent_kind is null or a.agent_kind = e.agent_kind);
  get diagnostics v_count = row_count;
  v_resolved := v_resolved + v_count;

  update skill_event e
     set skill_id = s.id
    from skill s
   where e.tenant_id = p_tenant
     and e.skill_id is null
     and s.tenant_id = e.tenant_id
     and split_part(s.slug, '/', 2) = e.observed_skill_name;
  get diagnostics v_count = row_count;
  v_resolved := v_resolved + v_count;

  return v_resolved;
end;
$$;

-- Skills people actually use that nobody registered. A gap in the data and a
-- product feature at the same time — this is the "nobody knows what already
-- exists" problem, answered with evidence.
create or replace view shadow_skill as
select
  tenant_id,
  observed_skill_name,
  agent_kind,
  count(*) filter (where event_type = 'invoked') as invocations,
  count(distinct agent_install_id)               as installs_seen,
  min(occurred_at)                               as first_seen,
  max(occurred_at)                               as last_seen
from skill_event
where skill_id is null
group by tenant_id, observed_skill_name, agent_kind;
