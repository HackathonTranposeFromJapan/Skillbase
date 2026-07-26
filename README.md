# Skillbase

**Turn proven work into company capability.** Describe the outcome you want, install the workflow
a colleague already proved, and onboard new teammates from how your company actually works.

```bash
curl -fsSL https://raw.githubusercontent.com/HackathonTranposeFromJapan/Skillbase/main/install.sh | sh
```

Measures which AI-agent skills your team actually uses — across Claude Code, Codex and Cursor.
Node 18+ only; no npm, no clone. It can read usage you already have, so there is nothing to wait
for. [How it works →](#measure-your-own-agents)

Built at **c0mpiled-13: Startup School Hackathon II** (Transpose Platform, SF — July 25, 2026).
YC RFS tracks: *Company Brain* / *The AI Operating System for Companies*.

---

## The problem

Every company adopting AI agents is quietly accumulating skills — prompts, workflows, MCP tools,
review checklists. They live in Notion pages, Slack threads, and one senior engineer's dotfiles.

The result:

- Nobody knows which internal skills already exist, so five teams write the same one.
- The person who wrote the good version has no way to distribute it.
- Managers cannot tell which workflows are actually being used, so nobody can improve them.
- A new hire's agent starts at zero on day one, while the company knows a great deal.
- When the only person who knows a critical workflow is away, the company's operating system
  quietly goes offline.

Companies solved this for code with npm, and for containers with a registry.
**Agent skills have no registry.**

## What Skillbase does

```
search by outcome  →  skillbase install  →  your agent has the skill  →  adoption flows back
```

1. **Search by outcome, not by name.** *"I want a skill that makes product designs look cleaner
   and more consistent"* → ranked skills, each with a one-line explanation of why it fits **your**
   role and **your** words.
2. **Install into a real agent.** `skillbase install design-polish` writes a real
   `SKILL.md` into `.claude/skills/` — the agent has the capability immediately.
3. **Measure what spreads.** Installs and runs report back. The dashboard shows adoption by
   department, what is growing, and — the useful half — **what people installed and then quietly
   abandoned**.
4. **Onboard from proven work.** Map single-owner skills, generate a role-specific first week,
   and verify readiness by completing a real task with the same permissions as the team.

## Measure your own agents

The one-liner at the top detects Claude Code, Codex and Cursor, wires the
telemetry hooks into each, and tells you what it found:

```
  found claude_code  10 skill(s)
  found codex        2 skill(s)
  found cursor       20 skill(s)
```

Then, to see usage you already have rather than waiting for new activity:

```bash
skillbase backfill claude   # reads local transcripts; no instrumentation needed
skillbase status
```

Only Node 18+ is required — no npm, no Bun, no clone.

Prefer `npx`? This runs the same binary straight from the release, also without
publishing anything (~2s):

```bash
npx -y https://github.com/HackathonTranposeFromJapan/Skillbase/releases/download/v0.1.0/skillbase-0.1.0.tgz init
```

Once the package is published to npm this becomes `npx skillbase init`.

Events queue locally and nothing is transmitted until `SKILLBASE_INGEST_URL` is
set. The published CLI is a single dependency-free file on Node 18+, because it
runs as an agent hook on the critical path of every skill call.

> **Note on the name.** `skilldrop` on npm is an unrelated product in this same
> space. Skillbase publishes as `skillbase`; `npx skilldrop` is somebody else's
> CLI.

## Try the app

```bash
bun install
bun link                   # puts the local install CLI on your PATH
bun dev                    # http://localhost:3100

# in another terminal, from any project directory:
skillbase install design-polish
cat .claude/skills/design-polish/SKILL.md
```

Then open `/dashboard` — your install appears in the activity feed, tagged `this session`.

Open `/onboarding` for the interactive continuity scenario: put Maya on PTO, generate Alex's
first week from her proven workflows, and complete his first real task behind a manager approval
gate.

## What is real vs. seeded

We think this distinction matters more than a bigger number on a slide.

| Real | Seeded |
|---|---|
| **Skill-usage telemetry from real agents** — Claude Code and Codex hooks, verified end to end (`bun run e2e`, 8/8) | The 12 skills in the catalog |
| **Discovered in use** — 59 skills found in real transcripts that nobody had registered | `rating` and `impact` (no measurement path exists for either) |
| Installs, active users, weekly runs, department split — computed from recorded events | `retention30d` (needs install records that transcripts do not carry) |
| Natural-language ranking (Claude, per query, with generated reasons) | The onboarding scenario at `/onboarding` — scripted end to end |
| `skillbase install` writing an actual `SKILL.md` to disk | Historical install counts for the seeded catalog |
| Hexclave auth: CLI login, ingest attribution, RBAC on `skill.visibility` | — |

Every event produced during a session is tagged **`this session`** in the UI, and the dashboard
states in plain text how many of the visible events are real. Nothing on screen claims to be
production telemetry.

## Ranking

`lib/rank.ts` runs a two-stage rank:

1. **Lexical prefilter** — weighted term matching over tags, name, tagline, description,
   department, and role, plus a mild popularity prior. Deterministic, always available.
2. **Model rerank** — the top candidates go to Claude, which reorders them and writes a
   role-aware, query-specific reason for each.

The model path degrades to the lexical ordering on any failure — no key, no network, bad JSON,
timeout. The UI shows which engine answered (`claude-cli` / `claude-api` / `lexical`), so the
fallback is visible rather than silent.

It uses `ANTHROPIC_API_KEY` when set, and otherwise shells out to a local `claude` CLI session.

## Governance

Skills carry a `visibility` tier — company, department, manager-approved, experimental, official —
enforced server-side against Hexclave team permissions (`skills_read` / `skills_manager` /
`skills_admin`). A client-side check is a UX affordance, not access control.

Signed out is deliberately not the same as denied: with no session the app is a public demo and
shows the ordinary catalog, rather than an empty page.

## Layout

```
data/skills.json            12 seeded skills — catalog, metrics, and the SKILL.md body each one ships
lib/rank.ts                 lexical prefilter + model rerank + fallback
lib/events.ts               in-memory install/run event log
lib/skills.ts               catalog access, role gating
app/components/SearchClient.tsx   search + ranked results
app/dashboard/page.tsx      adoption, growth, abandonment
app/onboarding/page.tsx     knowledge continuity + role-specific onboarding demo
app/skill/[slug]/page.tsx   detail + the exact file that gets installed
cli/skilldrop-collect.ts    the published CLI: init, install, login, hooks, backfill, flush
lib/skillbase/              agent-agnostic telemetry — schema, adapters, backfill, beacon
lib/backend/                catalogue, metrics, feed, Hexclave identity, RBAC
supabase/migrations/        identity, events, rollups, RLS
scripts/e2e-agents.ts       end-to-end test against real claude and codex processes
```

Postgres backs the analytics and Hexclave backs identity, but both degrade: with
no database the app runs on the seed catalog, and with no Hexclave session it
runs as a public demo. The dashboard states which it is showing rather than
implying seeded numbers were measured.

## Where this goes

The hackathon build covers discovery, installation, governance, and adoption analytics for skills
that already exist. The interesting version is the next one:

- **Skills that write themselves** — compile a Slack thread or a merged PR review into a
  candidate skill, and route it for approval.
- **Impact, not just adoption** — pair install events with outcome data (review round-trips,
  time-to-merge) to say which workflows actually made people faster.
- **Cross-agent** — Claude Code, Cursor, Codex, and internal agents install from the same registry.

## License

MIT
