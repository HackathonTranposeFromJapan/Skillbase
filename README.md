# Skillbase

**Turn proven work into company capability.** Describe the outcome you want, install the workflow
a colleague already proved, and onboard new teammates from how your company actually works.

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
search by outcome  →  skilldrop install  →  your agent has the skill  →  adoption flows back
```

1. **Search by outcome, not by name.** *"I want a skill that makes product designs look cleaner
   and more consistent"* → ranked skills, each with a one-line explanation of why it fits **your**
   role and **your** words.
2. **Install into a real agent.** `skilldrop install design-polish` writes a real
   `SKILL.md` into `.claude/skills/` — the agent has the capability immediately.
3. **Measure what spreads.** Installs and runs report back. The dashboard shows adoption by
   department, what is growing, and — the useful half — **what people installed and then quietly
   abandoned**.
4. **Onboard from proven work.** Map single-owner skills, generate a role-specific first week,
   and verify readiness by completing a real task with the same permissions as the team.

## Measure your own agents (one line)

```bash
curl -fsSL https://raw.githubusercontent.com/HackathonTranposeFromJapan/Skillbase/main/install.sh | sh
```

Detects Claude Code, Codex and Cursor, wires the telemetry hooks into each, and
tells you what it found:

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

Only Node 18+ is required — no npm, no Bun, no clone. Once the package is
published, `npx skillbase init` will do the same thing.

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
skilldrop install design-polish
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
| Natural-language ranking (Claude, per query, with generated reasons) | The 12 skills in the catalog |
| `skilldrop install` writing an actual `SKILL.md` to disk | Historical install/run counts and adoption rates |
| Install events reported to the registry and rendered live | The 10 backdated activity events |
| Role-based install gating on restricted skills | — |

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

Skills carry a `requiredRole`. A designer searching for `contract-review` finds it — discovery is
not the thing you want to restrict — but install is blocked, and the detail page offers a request
path instead of the command. Enforcement lives at the registry, not in the client.

This is the natural home for a real identity provider; `requiredRole` is the seam.

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
cli/skilldrop.ts            install / list / uninstall + adoption reporting
```

No database and no auth — the event log is in memory, which is the right scope for a five-hour
build and an honest thing to say out loud.

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
