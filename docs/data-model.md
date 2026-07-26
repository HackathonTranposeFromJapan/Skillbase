# Skillbase Data Model

The data foundation for skill usage across any AI agent.

Everything Skillbase promises — installs, active users, department adoption,
retention, version usage, trending, productivity signals — is a projection of a
single event stream: *who used which skill, when, on which agent, and how did it
go*. This document defines that stream and the identity layer it hangs off.

Reference implementation: `lib/skillbase/schema.ts` (the contract),
`supabase/migrations/` (the store).

---

## 1. The problem the identity layer solves

Agent Skills is an open standard, published December 2025 and read by Claude
Code, Codex, Cursor, Gemini CLI, OpenCode, Goose, Hermes Agent and 30+ other
clients. A skill is a directory containing `SKILL.md` with YAML frontmatter:
`name` and `description` required; `version`, `authors`, `tags`, `platforms`,
`license`, `repository`, `docs` optional.

**The standard defines no skill id, no namespace, and no provenance.** A skill
is identified by its directory name. On one laptop that is fine. Across a
company it breaks immediately:

- two departments both write a `review` skill — same name, different thing
- a skill is edited in place with no version bump, so "which version ran" is unanswerable
- `version:` is optional, and in practice almost always absent (of the 32 skills
  found across three agents on the development machine, **zero** declared one)

Skillbase supplies the missing layer:

| Concern | Standard | Skillbase |
|---|---|---|
| Identifier | directory name | `team/skill-name` canonical slug |
| Version | optional `version:` field | SHA-256 content hash of the normalized `SKILL.md` |
| Provenance | none | publisher, source repo, install source |
| Name collisions | undefined | `skill_alias` resolution table |

The content hash is the load-bearing piece: it is what ties a file observed on
someone's laptop to a registry entry, and it works even when the author never
touched the `version` field.

---

## 2. Entities

### Identity

**`skill`** — the registry entry.
`id`, `tenant_id`, `slug` (`team/skill-name`), `display_name`, `description`,
`owner_team_id`, `visibility`, `tags[]`.

`visibility` implements the README's governance levels:
`company` | `department` | `manager_approved` | `experimental` | `official`.

**`skill_version`** — a specific published state.
`skill_id`, `semver`, **`content_hash`**, `frontmatter` (jsonb, the spec's fields
passed through verbatim), `source_repo`, `published_at`, `published_by`.

**`skill_alias`** — observed name → canonical skill.
`observed_name`, `agent_kind`, `path_glob`, `skill_id`, `match_method`
(`hash` | `path` | `name` | `beacon` | `manual`), `confidence`.

Without this table, cross-department name collisions corrupt every metric.

### Actors

**`principal`** — an employee. `email_hash`, `department`, `role`, `seniority`.
Email is hashed: the analytics need a stable person, not an address.

**`agent_install`** — one person on one agent on one machine.
`principal_id`, `agent_kind`, `agent_version`, `machine_id_hash`, `client_id`.

This is the unit events attach to, not the person. A developer running Claude
Code on a laptop and Codex on a workstation adopts skills independently on each,
and per-agent adoption is only measurable if they are separate rows.

`agent_kind` is deliberately free text, not an enum — new agents adopt SKILL.md
faster than we can ship migrations, and an unknown agent must never block ingest.

**`skill_installation`** — what is installed where.
`agent_install_id`, `skill_version_id`, `scope`, `path_hash`, `installed_at`,
`removed_at`, `install_source`.

Kept separate from usage on purpose: *installed and never run* is one of the
more useful things a company can learn about its skills.

### The event

**`skill_event`** — append-only, one table for every agent.

| Group | Fields |
|---|---|
| Record identity | `event_id`, `dedupe_key`, `merge_key`, `schema_version` |
| Ownership | `tenant_id`, `principal_id`, `agent_install_id` |
| Time | `occurred_at` (device), `received_at` (server) |
| Agent | `agent_kind`, `agent_version` |
| Skill | `skill_id`, `skill_version_id`, `observed_skill_name`, `observed_content_hash`, `install_scope` |
| What | `event_type`, `trigger`, `outcome`, `error_kind`, `duration_ms` |
| Correlation | `invocation_id`, `parent_invocation_id`, `session_id`, `turn_id`, `is_subagent` |
| Cost | `input_tokens`, `output_tokens`, `cache_read_tokens`, `cost_usd` |
| Context | `project_key` (hashed), `args_hash`, `agent_meta` (jsonb) |
| Observation | `detected_by`, `confidence` |

`event_type`: `invoked` | `completed` | `failed` | `installed` | `updated` |
`uninstalled` | `listed` | `blocked`

---

## 3. Four decisions that carry the design

### 3.1 One table, adapters at the edge

Not one table per agent. The collector normalizes Claude Code hooks, Codex
hooks, beacons, transcripts and OTel into one shape; anything genuinely
agent-specific goes to `agent_meta`. **Supporting a new agent is an adapter, not
a migration.** That is what makes "works with any agent" a property of the
system rather than a promise.

### 3.2 `trigger` is the product differentiator

`explicit_command` | `model_auto` | `subagent` | `scheduled` | `unknown`

Whether a person typed `/foo` or the agent picked the skill from its description
alone are completely different facts. The auto-selection rate is a direct
measure of **how well a skill describes itself** — which is exactly what the
recommendation layer needs, and what tells a skill author their `description` is
not earning discovery. No other metric in the system answers that.

### 3.3 Multi-route observation needs two keys, not one

The same run can be seen by a hook, a beacon and a transcript. Two distinct
problems, two distinct keys:

- **`dedupe_key`** = hash(source, install, session, invocation, type) —
  idempotency *within* one route. A retried flush or a re-run backfill collapses.
  Enforced by a unique index; delivery is at-least-once, so this is enforced
  rather than hoped for.
- **`merge_key`** = hash(install, session, skill, type, 120s bucket) —
  correlation *across* routes. A beacon cannot see the agent's `tool_use_id`, so
  time bucketing is the only thing that can tie its report to the hook's.

`skill_invocation` then picks a winning **source** per merge group, not a winning
row. This distinction is not academic: collapsing to one row per merge key also
swallows genuine repeat use, and against real transcripts it silently lost 9 of
370 `worktree` runs before the view was corrected.

Keeping both observations rather than discarding the loser is what makes
`beacon_compliance` computable — see §4.

### 3.4 Unresolved events are never dropped

`skill_id` stays null until the resolver binds it, and the event is stored
regardless. A skill somebody uses that nobody registered is not missing data —
it is **the answer to the README's first problem**, "employees do not know which
internal skills already exist". Exposed as the `shadow_skill` view.

### 3.5 Metadata only

Prompts, skill arguments and tool output are never transmitted. `args_hash`
exists for opt-in argument analysis; the raw text does not leave the device.
`project_key` and `machine_id_hash` are salted with a device-local secret, so
they are stable identifiers that cannot be reversed or joined across tenants.

This is enforced at the boundary, not by convention: `validateSkillEvent()`
rejects any event carrying an `args`, `prompt`, `output` or `content` field, so
an adapter mistake fails loudly instead of quietly filling the warehouse with
customer data.

---

## 4. Derived views

| View | Answers |
|---|---|
| `skill_invocation` | one row per run: duration, outcome, cost |
| `mv_skill_daily` | invocations, unique users, success rate, p50/p95 duration, auto-trigger share, by day × department × agent |
| `skill_retention` | install-week cohorts → active at 7d / 30d ("installed but never used") |
| `skill_trending` | last 7d vs the preceding 28d daily average |
| `shadow_skill` | used but unregistered |
| `beacon_compliance` | measured beacon hit rate per agent |

`beacon_compliance` deserves note. The beacon depends on a model following an
instruction, so its hit rate is an empirical quantity, not an assumption. The
view compares merge keys seen by a direct route against those the beacon also
reported. If the number is poor on Codex, that is visible in the product rather
than discovered later as missing data.

---

## 5. Verified end to end

Against real agent data on the development machine, with a throwaway Postgres 17
instance for the store:

| Check | Result |
|---|---|
| Claude Code transcripts parsed | 8,362 files, 1,602,950 records, **0 parse failures** |
| Skill invocations recovered | **1,648 across 57 skills** |
| Parser vs independent `grep` | exact match (370 `worktree`, 366 `backend-test-reports`, 311 `handoff`, …) |
| Codex rollouts parsed | 1,840 files; 8 activations, matching an independently written counting script exactly |
| Migrations | all four apply cleanly to a fresh database |
| Events ingested | 3,284 of 3,296 — 12 collapsed as genuine duplicates¹ |
| Re-ingesting the same batch | **0 inserted** (idempotent) |
| `skill_invocation` vs raw counts | exact match, after the source-ranking fix |
| Rollups | `mv_skill_daily`, `skill_trending`, `shadow_skill` all populate |
| Unit tests | 39 passing |
| Hook failure modes | malformed JSON, empty input and an unwritable state directory all return `{"continue":true}`, exit 0 |

¹ Identical `tool_use_id` and timestamp appearing in several transcript files —
resumed and forked sessions carry history forward. A naive count reported
`deep-research` seven times. The dedupe key removes them.

---

## 6. Open questions

Recorded rather than assumed:

1. **Explicit vs auto on Claude Code.** All 1,648 historical invocations carry
   `caller.type: "direct"`, which does not separate the two. The design routes
   this through `UserPromptExpansion`, and the adapter handles both outcomes
   correctly, but which one the runtime actually produces is unconfirmed.
   Historical backfill therefore reports `trigger: unknown` rather than guessing.
2. **Whether Codex always loads skills via a shell read.** All 9 activations
   observed across 1,840 rollout files used `exec_command` to read `SKILL.md`,
   which is what makes hook detection possible there. A build that inlined the
   file instead would be invisible to that route; the beacon is the hedge.
3. **Beacon compliance rate.** Unmeasured until the beacon ships on real skills.
   `beacon_compliance` exists to measure it.
