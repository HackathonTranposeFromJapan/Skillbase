-- Skillbase identity layer.
--
-- The Agent Skills standard identifies a skill by its directory name and
-- defines no namespace, no version pinning and no provenance. That is workable
-- for one laptop and breaks immediately across a company: two departments write
-- a `review` skill, a skill is edited in place with no version bump, and the
-- same name means different things on different machines.
--
-- These tables supply the missing layer — a canonical slug, a content hash per
-- version, and an alias table that maps whatever name an agent reported back to
-- the registry entry it belongs to.

create extension if not exists "pgcrypto";

create table tenant (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table team (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenant(id) on delete cascade,
  slug        text not null,
  name        text not null,
  unique (tenant_id, slug)
);

-- An employee. Email is stored hashed: the analytics need a stable person, not
-- an address, and this keeps the event store free of direct identifiers.
create table principal (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenant(id) on delete cascade,
  email_hash   text not null,
  display_name text,
  department   text,
  role         text,
  seniority    text,
  created_at   timestamptz not null default now(),
  unique (tenant_id, email_hash)
);

create index principal_department_idx on principal (tenant_id, department);

-- One person routinely runs several agents across several machines, and each
-- pairing adopts skills independently. Per-agent adoption is only measurable if
-- the install — not the person — is the unit events attach to.
create table agent_install (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenant(id) on delete cascade,
  principal_id    uuid references principal(id) on delete set null,
  -- Free text rather than an enum: new agents adopt SKILL.md faster than we
  -- can ship migrations, and an unknown agent must never block ingest.
  agent_kind      text not null,
  agent_version   text,
  machine_id_hash text not null,
  client_id       text not null,
  enrolled_at     timestamptz not null default now(),
  last_seen_at    timestamptz,
  unique (tenant_id, client_id)
);

create index agent_install_principal_idx on agent_install (tenant_id, principal_id);

create table skill (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  -- The canonical identifier Skillbase defines, as `team/skill-name`.
  slug          text not null,
  display_name  text not null,
  description   text,
  owner_team_id uuid references team(id) on delete set null,
  visibility    text not null default 'company'
                check (visibility in ('company','department','manager_approved','experimental','official')),
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (tenant_id, slug)
);

create index skill_tags_idx on skill using gin (tags);

create table skill_version (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  skill_id      uuid not null references skill(id) on delete cascade,
  semver        text,
  -- SHA-256 of the normalized SKILL.md. This is the join key that ties a file
  -- observed on someone's laptop to a registry entry, and the only reliable
  -- version signal given that `version:` in frontmatter is optional and, in
  -- practice, almost always absent.
  content_hash  text not null,
  frontmatter   jsonb not null default '{}'::jsonb,
  source_repo   text,
  published_at  timestamptz not null default now(),
  published_by  uuid references principal(id) on delete set null,
  unique (tenant_id, skill_id, content_hash)
);

create index skill_version_hash_idx on skill_version (tenant_id, content_hash);

-- Resolution table: observed name -> canonical skill.
--
-- Needed because the identifier the agent reports is a directory name, which
-- collides across teams and drifts from the registry slug. Populated by the
-- resolver and by admins reconciling shadow skills.
create table skill_alias (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenant(id) on delete cascade,
  skill_id      uuid not null references skill(id) on delete cascade,
  agent_kind    text,
  observed_name text not null,
  path_glob     text,
  match_method  text not null check (match_method in ('hash','path','name','beacon','manual')),
  confidence    numeric(3,2) not null default 1.0 check (confidence between 0 and 1),
  created_at    timestamptz not null default now(),
  unique (tenant_id, observed_name, agent_kind)
);

-- What is installed where. Distinct from usage on purpose: "installed and never
-- run" is one of the more useful things a company can learn about its skills.
create table skill_installation (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenant(id) on delete cascade,
  agent_install_id uuid not null references agent_install(id) on delete cascade,
  skill_id         uuid references skill(id) on delete set null,
  skill_version_id uuid references skill_version(id) on delete set null,
  observed_name    text not null,
  content_hash     text,
  scope            text not null default 'unknown'
                   check (scope in ('user','project','admin','plugin','unknown')),
  path_hash        text,
  install_source   text not null default 'manual' check (install_source in ('skilldrop','manual')),
  installed_at     timestamptz not null default now(),
  removed_at       timestamptz,
  unique (tenant_id, agent_install_id, observed_name, scope)
);

create index skill_installation_skill_idx on skill_installation (tenant_id, skill_id)
  where removed_at is null;
