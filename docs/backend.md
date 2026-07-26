# Backend

Local Postgres, a telemetry ingest endpoint, and the queries that turn recorded
events into the numbers the dashboard shows.

## Quick start

```bash
bun run db:up        # start Postgres, work out how to reach it, write .env.local
bun run db:setup     # apply migrations, register the catalogue
bun run dev          # http://localhost:3100
```

Fill it with real usage from this machine's agents:

```bash
export SKILLBASE_INGEST_URL=http://localhost:3100/api/ingest
bun run collect backfill claude    # read ~/.claude/projects transcripts
bun run collect backfill codex     # read ~/.codex/sessions rollouts
bun run collect flush              # POST to the ingest endpoint
bun run db:adopt 5                 # register discovered skills with 5+ runs
bun run db:status
```

## Why `db:up` is not just `docker compose up`

This repo is developed inside a container with docker-outside-of-docker: the
Docker CLI talks to the *host* daemon, so a published port binds on the host and
`localhost:55432` from inside the dev container reaches nothing — the database
sits on a bridge network this container is not attached to.

`db:up` tries localhost first (the ordinary laptop case) and, failing that,
attaches the database container to a network this container is already on and
addresses it by container name, which Docker's embedded DNS resolves and which
survives restarts in a way an IP does not. The resolved URL is written to
`.env.local`.

If you already have a dev server running, restart it after `db:up` — Next.js
reads `.env.local` at startup.

## Degradation is a feature

Nothing in `lib/db.ts` throws. Every helper returns `null` when the database is
unreachable and callers fall back to `data/skills.json`. A dead database during
a judging session must not blank the screen. Measured at 6 ms to fall back from
a dead host.

The dashboard says which it is used — "measured from collected agent telemetry"
or "sample data" — and each skill carries a `measured` flag, so seeded figures
are never presented as observations.

## Row level security

The schema uses `FORCE ROW LEVEL SECURITY`, which applies to the table owner
too. Every query therefore runs in a transaction that sets
`app.current_tenant_id`; without it the policies match nothing and queries return
zero rows rather than an error. Tenant isolation is enforced by the database, not
by remembering to add a `WHERE` clause.

## Ingest

`POST /api/ingest` with `{ "events": SkillEvent[] }`.

Delivery is at-least-once — the collector keeps its spool on any non-2xx and
retries the whole batch — so the endpoint is idempotent: `ingest_skill_events`
upserts on `(tenant_id, dedupe_key)` and re-sending a batch inserts nothing. A
database outage returns 503 and the collector holds the events. Verified: a
flush against a stopped server retained all 3,304 events and delivered them on
the next attempt.

Events are validated again at this boundary. The metadata-only guarantee is only
worth something where untrusted input arrives, so an event carrying `prompt`,
`args`, `output` or `content` is rejected with 422.

`GET /api/ingest` reports readiness and stored event counts.

## Devices enrol implicitly

The collector generates a stable salted `agentInstallId` locally. The first
version of the ingest function looked it up and stored NULL when absent, so a
device never registered through the UI produced events attached to nothing —
every installs and active-users figure read zero beside thousands of runs
(`0005_auto_enroll.sql`). An event arriving from a device is itself the evidence
the device exists, so the install row is created on first sight. Who is behind it
stays unknown until claimed, which is what `principal_id` is for.

## What "installs" and "active users" mean here

Transcript backfill recovers usage but no install records and no person, so:

- **installs** = distinct agent installs that actually ran the skill
- **active users** = distinct people, or distinct devices when no person is known

`agent-reach` showing 2 installs is a real cross-agent result: the same skill on
both Claude Code and Codex.

## Discovered skills

Real telemetry is full of skills nobody published — 59 on the development
machine. `shadow_skill` surfaces them and the dashboard shows them as
"Discovered in use — not in the library".

`bun run db:adopt <min-runs>` registers them, after which every past event
resolves to the new entry retroactively. That is the product loop: usage is the
evidence a skill exists.

## Commands

| Command | Does |
|---|---|
| `db:up` | start Postgres, resolve reachability, write `.env.local` |
| `db:setup` | `migrate` + `seed` |
| `db:migrate` | apply pending migrations (tracked in `schema_migration`, one transaction each) |
| `db:seed` | register the catalogue from `data/skills.json` |
| `db:adopt [n]` | register discovered skills with at least `n` runs (default 5) |
| `db:status` | counts and top skills |
| `db:reset` | drop the schema and rebuild |
| `db:down` | stop the container |

Seeding writes descriptive data only. No usage is invented, so observed and
illustrative numbers stay distinguishable.
