#!/usr/bin/env bun
/**
 * Database lifecycle: migrate, seed, status, reset.
 *
 *   bun scripts/db.ts migrate   apply pending migrations
 *   bun scripts/db.ts seed      register the catalogue skills
 *   bun scripts/db.ts setup     migrate + seed
 *   bun scripts/db.ts status    what is in there
 *   bun scripts/db.ts reset     drop everything and rebuild
 *
 * Migrations are tracked in `schema_migration` and applied inside a transaction
 * each, so a half-applied file cannot leave the schema in an unknown state.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

import skillsData from '../data/skills.json' with { type: 'json' };
import { DEMO_TENANT_ID } from '../lib/tenant';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'supabase', 'migrations');
const DEFAULT_URL = 'postgres://skillbase:skillbase@localhost:55432/skillbase';

interface SeedSkill {
  slug: string;
  name: string;
  description: string;
  department: string;
  tags: string[];
  official: boolean;
  version: string;
  author: string;
}

const SKILLS = skillsData as unknown as SeedSkill[];

/**
 * Read `DATABASE_URL` from `.env.local` when it is not already in the
 * environment. Next.js loads that file itself; a plain `bun` script does not.
 */
function connectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envFile = join(import.meta.dir, '..', '.env.local');
  try {
    const match = /^DATABASE_URL=(.*)$/m.exec(readFileSync(envFile, 'utf8'));
    const url = match?.[1]?.trim();
    if (url) return url;
  } catch {
    // No .env.local: fall through to the default.
  }
  return DEFAULT_URL;
}

async function connect(): Promise<Client> {
  const client = new Client({ connectionString: connectionString(), connectionTimeoutMillis: 5_000 });
  await client.connect();
  return client;
}

async function migrate(client: Client): Promise<void> {
  await client.query(`
    create table if not exists schema_migration (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await client.query<{ name: string }>('select name from schema_migration')).rows.map((r) => r.name),
  );

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migration (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`  applied ${file}`);
      count += 1;
    } catch (error) {
      await client.query('rollback');
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    }
  }

  console.log(count === 0 ? '  schema already up to date' : `  ${count} migration(s) applied`);
}

/**
 * Register the catalogue.
 *
 * Only descriptive data is written — no usage is invented. Skills start with no
 * events, and the dashboard falls back to the seed figures for anything the
 * telemetry has not measured, which keeps observed and illustrative numbers
 * distinguishable.
 */
async function seed(client: Client): Promise<void> {
  await client.query(
    `insert into tenant (id, slug, name) values ($1, 'demo', 'Skillbase Demo')
     on conflict (id) do nothing`,
    [DEMO_TENANT_ID],
  );

  const departments = [...new Set(SKILLS.map((s) => s.department))];
  for (const department of departments) {
    await client.query(
      `insert into team (tenant_id, slug, name) values ($1, $2, $3)
       on conflict (tenant_id, slug) do nothing`,
      [DEMO_TENANT_ID, department.toLowerCase().replace(/\s+/g, '-'), department],
    );
  }

  for (const skill of SKILLS) {
    const team = await client.query<{ id: string }>(
      'select id from team where tenant_id = $1 and slug = $2',
      [DEMO_TENANT_ID, skill.department.toLowerCase().replace(/\s+/g, '-')],
    );

    const inserted = await client.query<{ id: string }>(
      `insert into skill (tenant_id, slug, display_name, description, owner_team_id, visibility, tags)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (tenant_id, slug) do update
         set display_name = excluded.display_name,
             description  = excluded.description,
             visibility   = excluded.visibility,
             tags         = excluded.tags
       returning id`,
      [
        DEMO_TENANT_ID,
        skill.slug,
        skill.name,
        skill.description,
        team.rows[0]?.id ?? null,
        skill.official ? 'official' : 'company',
        skill.tags,
      ],
    );

    const skillId = inserted.rows[0]?.id;
    if (!skillId) continue;

    // A version row keyed by a placeholder hash: the catalogue has no SKILL.md
    // to hash yet, and `skilldrop-collect scan` fills in the real one.
    await client.query(
      `insert into skill_version (tenant_id, skill_id, semver, content_hash, frontmatter)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, skill_id, content_hash) do nothing`,
      [
        DEMO_TENANT_ID,
        skillId,
        skill.version,
        `seed:${skill.slug}:${skill.version}`,
        JSON.stringify({ name: skill.slug, description: skill.description, version: skill.version, authors: [skill.author] }),
      ],
    );
  }

  // Bind any telemetry that arrived before its skill was registered.
  const resolved = await client.query<{ resolve_skill_events: number }>(
    'select resolve_skill_events($1::uuid)',
    [DEMO_TENANT_ID],
  );

  console.log(`  ${SKILLS.length} skills registered, ${departments.length} teams`);
  console.log(`  ${resolved.rows[0]?.resolve_skill_events ?? 0} pending event(s) bound to a skill`);
}

/**
 * Register skills that telemetry found but nobody published.
 *
 * This is the product action behind the `shadow_skill` view: usage is evidence
 * that a skill exists, so adopting it turns an observation into a catalogue
 * entry and every past event resolves to it retroactively.
 */
async function adopt(client: Client, minRuns: number): Promise<void> {
  const shadow = await client.query<{ name: string; agent_kind: string; invocations: string }>(
    `select observed_skill_name as name, agent_kind, invocations::text
       from shadow_skill
      where tenant_id = $1 and invocations >= $2
      order by invocations desc`,
    [DEMO_TENANT_ID, minRuns],
  );

  if (shadow.rows.length === 0) {
    console.log(`  nothing with at least ${minRuns} runs to adopt`);
    return;
  }

  await client.query(
    `insert into team (tenant_id, slug, name) values ($1, 'discovered', 'Discovered')
     on conflict (tenant_id, slug) do nothing`,
    [DEMO_TENANT_ID],
  );
  const team = await client.query<{ id: string }>(
    "select id from team where tenant_id = $1 and slug = 'discovered'",
    [DEMO_TENANT_ID],
  );

  for (const row of shadow.rows) {
    await client.query(
      `insert into skill (tenant_id, slug, display_name, description, owner_team_id, visibility, tags)
       values ($1, $2, $3, $4, $5, 'experimental', $6)
       on conflict (tenant_id, slug) do nothing`,
      [
        DEMO_TENANT_ID,
        row.name,
        row.name,
        `Discovered from ${row.agent_kind} telemetry — used ${row.invocations} times before anyone published it.`,
        team.rows[0]?.id ?? null,
        [row.agent_kind, 'discovered'],
      ],
    );
  }

  const resolved = await client.query<{ resolve_skill_events: number }>(
    'select resolve_skill_events($1::uuid)',
    [DEMO_TENANT_ID],
  );

  console.log(`  ${shadow.rows.length} discovered skill(s) registered`);
  console.log(`  ${resolved.rows[0]?.resolve_skill_events ?? 0} event(s) bound to them`);
}

async function status(client: Client): Promise<void> {
  const q = async (sql: string): Promise<string> => {
    try {
      const r = await client.query(sql, [DEMO_TENANT_ID]);
      return String(r.rows[0]?.count ?? r.rows[0]?.value ?? '0');
    } catch {
      return 'n/a';
    }
  };

  console.log(`  skills registered : ${await q('select count(*) from skill where tenant_id = $1')}`);
  console.log(`  events stored     : ${await q('select count(*) from skill_event where tenant_id = $1')}`);
  console.log(`  resolved to skill : ${await q('select count(*) from skill_event where tenant_id = $1 and skill_id is not null')}`);
  console.log(`  shadow skills     : ${await q('select count(*) from shadow_skill where tenant_id = $1')}`);

  const top = await client.query<{ observed_skill_name: string; runs: string }>(
    `select observed_skill_name, count(*)::text as runs
       from skill_invocation where tenant_id = $1
      group by 1 order by count(*) desc limit 5`,
    [DEMO_TENANT_ID],
  ).catch(() => ({ rows: [] as Array<{ observed_skill_name: string; runs: string }> }));

  if (top.rows.length > 0) {
    console.log('  top skills        :');
    for (const row of top.rows) console.log(`    ${row.runs.padStart(6)}  ${row.observed_skill_name}`);
  }
}

async function reset(client: Client): Promise<void> {
  await client.query('drop schema public cascade; create schema public;');
  console.log('  schema dropped');
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'setup';
  let client: Client;

  try {
    client = await connect();
  } catch (error) {
    console.error(`cannot reach Postgres at ${connectionString()}`);
    console.error(`  ${(error as Error).message}`);
    console.error('\nStart it with:  docker compose up -d db');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'migrate':
        await migrate(client);
        break;
      case 'seed':
        await seed(client);
        break;
      case 'setup':
        await migrate(client);
        await seed(client);
        break;
      case 'adopt':
        await adopt(client, Number(process.argv[3] ?? 5));
        break;
      case 'status':
        await status(client);
        break;
      case 'reset':
        await reset(client);
        await migrate(client);
        await seed(client);
        break;
      default:
        console.error(`unknown command: ${command}`);
        console.error('expected one of: migrate, seed, setup, adopt, status, reset');
        process.exit(1);
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void main();
