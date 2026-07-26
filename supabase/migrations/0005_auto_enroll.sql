-- Implicit device enrolment on first event.
--
-- The collector generates a stable, salted `agentInstallId` locally and stamps
-- it on every event. The first version of `ingest_skill_events` looked that up
-- in `agent_install` and stored NULL when it was absent, which meant a device
-- that had never been registered through the UI produced events attached to
-- nothing — and every "installs" and "unique users" figure read zero while
-- thousands of runs sat in the table.
--
-- Registering the install on first sight is both the fix and the correct
-- behaviour: an event arriving from a device *is* the evidence that the device
-- exists. The person behind it stays unknown until someone claims it, which is
-- what `principal_id` is for.

create or replace function ingest_skill_events(p_tenant uuid, p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  -- One row per (client_id, agent_kind) seen in this batch.
  insert into agent_install (tenant_id, agent_kind, agent_version, machine_id_hash, client_id, last_seen_at)
  select
    p_tenant,
    coalesce(e ->> 'agentKind', 'other'),
    max(e ->> 'agentVersion'),
    coalesce(e ->> 'agentInstallId', 'unknown'),
    coalesce(e ->> 'agentInstallId', 'unknown'),
    max((e ->> 'occurredAt')::timestamptz)
  from jsonb_array_elements(p_events) as e
  where e ->> 'agentInstallId' is not null
  group by e ->> 'agentKind', e ->> 'agentInstallId'
  on conflict (tenant_id, client_id) do update
    set last_seen_at = greatest(agent_install.last_seen_at, excluded.last_seen_at),
        agent_version = coalesce(excluded.agent_version, agent_install.agent_version);

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
    ai.id,
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
  left join agent_install ai
    on ai.tenant_id = p_tenant
   and ai.client_id = e ->> 'agentInstallId'
  on conflict (tenant_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;

  perform resolve_skill_events(p_tenant);
  return v_inserted;
end;
$$;

revoke all on function ingest_skill_events(uuid, jsonb) from public;

-- No attempt is made to repair events stored before this migration. Ingest is
-- idempotent on `dedupe_key`, so re-flushing a spool will not re-attach them,
-- and guessing an install from `agent_kind` alone would mis-attribute events on
-- any machine running the same agent twice. Rebuild with `bun run db:reset`
-- and re-flush instead.
