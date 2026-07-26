-- Tenant isolation.
--
-- Skillbase holds a record of what every employee does with their AI agents, so
-- a cross-tenant leak is the worst failure this system has. Every table carries
-- `tenant_id` and every table is fenced, rather than relying on the application
-- to always add the right WHERE clause.

create or replace function current_tenant_id()
returns uuid
language plpgsql
stable
as $$
declare
  v_claim text;
begin
  -- Supabase JWT first, then a session GUC for server-side jobs and psql.
  begin
    v_claim := current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id';
  exception when others then
    v_claim := null;
  end;

  if v_claim is null or v_claim = '' then
    v_claim := current_setting('app.current_tenant_id', true);
  end if;

  if v_claim is null or v_claim = '' then
    return null;
  end if;

  return v_claim::uuid;
exception when others then
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'team', 'principal', 'agent_install', 'skill', 'skill_version',
    'skill_alias', 'skill_installation', 'skill_event'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    execute format(
      'create policy %I on %I for select using (tenant_id = current_tenant_id())',
      t || '_select', t
    );
    -- Writes go through the service role, which bypasses RLS; these policies
    -- keep a mistakenly-granted client from writing across tenants anyway.
    execute format(
      'create policy %I on %I for insert with check (tenant_id = current_tenant_id())',
      t || '_insert', t
    );
    execute format(
      'create policy %I on %I for update using (tenant_id = current_tenant_id())
         with check (tenant_id = current_tenant_id())',
      t || '_update', t
    );
  end loop;
end;
$$;

alter table tenant enable row level security;
alter table tenant force row level security;
create policy tenant_select on tenant for select using (id = current_tenant_id());

-- Ingest entry point. Takes a batch of SkillEvent v1 records exactly as the
-- collector spools them and applies at-least-once semantics: a retried flush
-- re-sends events already stored, and the dedupe key absorbs them.
create or replace function ingest_skill_events(p_tenant uuid, p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  insert into skill_event (
    schema_version, event_id, dedupe_key, merge_key, tenant_id, principal_id,
    agent_install_id, occurred_at, agent_kind, agent_version, observed_skill_name,
    observed_content_hash, install_scope, event_type, trigger, outcome, error_kind,
    duration_ms, invocation_id, parent_invocation_id, session_id, turn_id,
    is_subagent, input_tokens, output_tokens, cache_read_tokens, cost_usd,
    project_key, args_hash, agent_meta, detected_by, confidence
  )
  select
    coalesce((e ->> 'schemaVersion')::int, 1),
    (e ->> 'eventId')::uuid,
    e ->> 'dedupeKey',
    e ->> 'mergeKey',
    p_tenant,
    nullif(e ->> 'principalId', '')::uuid,
    (select ai.id from agent_install ai
      where ai.tenant_id = p_tenant and ai.client_id = e ->> 'agentInstallId'),
    (e ->> 'occurredAt')::timestamptz,
    e ->> 'agentKind',
    e ->> 'agentVersion',
    e ->> 'observedSkillName',
    e ->> 'observedContentHash',
    coalesce(e ->> 'installScope', 'unknown'),
    e ->> 'eventType',
    coalesce(e ->> 'trigger', 'unknown'),
    nullif(e ->> 'outcome', ''),
    nullif(e ->> 'errorKind', ''),
    (e ->> 'durationMs')::integer,
    e ->> 'invocationId',
    e ->> 'parentInvocationId',
    e ->> 'sessionId',
    e ->> 'turnId',
    coalesce((e ->> 'isSubagent')::boolean, false),
    (e ->> 'inputTokens')::integer,
    (e ->> 'outputTokens')::integer,
    (e ->> 'cacheReadTokens')::integer,
    (e ->> 'costUsd')::numeric,
    e ->> 'projectKey',
    e ->> 'argsHash',
    coalesce(e -> 'agentMeta', '{}'::jsonb),
    e ->> 'detectedBy',
    coalesce((e ->> 'confidence')::numeric, 1.0)
  from jsonb_array_elements(p_events) as e
  on conflict (tenant_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;

  perform resolve_skill_events(p_tenant);
  return v_inserted;
end;
$$;

revoke all on function ingest_skill_events(uuid, jsonb) from public;
