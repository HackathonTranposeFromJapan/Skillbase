# Demo runbook

## Recommended story: continuity → onboarding → first real task

This is the product story. The CLI install below is the technical proof if a judge wants to go
deeper.

Open `http://localhost:3100/onboarding`.

### The 75 seconds

**1 — The hook (10s).**

> "Every company has a Maya. When Maya goes on vacation, the operating system goes offline."

Click **Set Maya to PTO**. Point at the three business-critical skills that turn red.

**2 — The new hire (15s).**

> "Alex starts Monday. A generic handbook cannot teach him the work Maya actually does."

Point at Alex's 31% readiness, then click **Generate onboarding from Maya's skills**.

**3 — Proven work becomes onboarding (20s).**

> "Skillbase builds Alex's first week from workflows this team has already proved—not from what
> people claim they know on a profile."

Point at the source under each assigned skill: successful runs, the support workflow, and the
finance-approved playbook.

**4 — Verify with work, not a quiz (20s).**

Click **Run Alex's first real task**. Let the first three steps advance, then pause at the approval
gate.

> "Alex can prepare the refund, but the company's permissions still apply."

Click **Omar approves $129 refund**.

**5 — Close (10s).**

Point at `First real task completed`, Alex's increased readiness, and the verified backup on the
capability map.

> "Skillbase turns individual know-how into company capability. New hires don't start from zero,
> and the company doesn't stop when one person is away."

### The one-line positioning

> **Glean helps people find information. Skillbase tells the company what it can actually do,
> who it depends on, and how that capability spreads.**

---

## Before you present

```bash
# terminal A — the registry
cd Skillbase && bun dev                     # http://localhost:3100

# terminal B — a clean project directory, large font, cwd visible
cd ~/demo && rm -rf .claude
```

Browser: three tabs, all pre-loaded.

1. `http://localhost:3100/onboarding`
2. `http://localhost:3100`
3. `http://localhost:3100/dashboard`

Warm the model path once before you go on stage — the first `claude` call is the slow one:

```bash
curl -s -X POST localhost:3100/api/search -H 'content-type: application/json' \
  -d '{"query":"design consistency","role":"designer"}' > /dev/null
```

Ranking takes ~6s. Do not stand in silence — that is the sentence where you say what the
company problem is.

---

## The 90 seconds

**1 — The gap (10s).** Terminal B, no skills installed.

> "Every company adopting agents has this directory. Mine is empty. Somewhere in my company,
> a designer already wrote the checklist that should be in it — I have no way to find it."

**2 — Search by outcome (20s).** Tab 1. Type, or click the first example:

> *I want a skill that makes product designs look cleaner and more consistent*

While it ranks (~6s):

> "I'm not searching by skill name. Nobody knows the name. I'm describing the outcome —
> and it ranks against my role."

Point at the reason line under the top result. It is written per query, not stored.
Then point at result #5:

> "It even tells me why the fifth one is *less* relevant. That's the ranking being honest."

**3 — Install for real (25s).** Terminal B:

```bash
skillbase install design-polish
cat .claude/skills/design-polish/SKILL.md
```

> "That is a real file, on disk, in my agent's skill directory. My agent has this capability now —
> and it's not a generic prompt, it's *our* spacing scale and *our* type ramp."

**4 — The agent is now smarter (20s).** Run the same UI task you ran before the install.
Point at the output referencing the company's 4pt scale and the 5-state rule.

> "Same agent. Same task. The difference is a skill a colleague already proved."

**5 — What the company sees (15s).** Tab 2, dashboard.

> "My install just landed — tagged `this session`. Everything else is seeded demo data, and we
> label it. At company scale this is the first honest answer to *which AI workflows actually
> spread* — including this one" *(point at Installed-then-abandoned)* — "which people install
> and quietly stop using."

**Close:**

> "npm for your company's agent skills. Discovery, distribution, governance, and the adoption
> data nobody has today."

---

## If something breaks

| Failure | What to do |
|---|---|
| Ranking is slow or hangs | It falls back to lexical automatically and the badge shows `lexical`. Say: "the model path timed out, the deterministic ranker took over — that fallback is deliberate." It is a better answer than a stall. |
| `skilldrop` not found | `bun link` from the repo, or run `bun cli/skilldrop.ts install design-polish` |
| Registry not reachable | Restart `bun dev`; the CLI prints `offline — install not reported` and still writes the file |
| Port 3000 taken | Already on **3100** |
| Live Claude Code run is risky | Skip step 4 and `cat` the SKILL.md instead — the file on disk is the proof |
| Every page suddenly 500s | You ran `bun run build` while `bun dev` was live — they share `.next`. `rm -rf .next && bun dev` |

**Spare beat if you have 15s left:** re-run the same query with the role chip switched from
`designer` to `frontend-engineer`. The reasons rewrite themselves — *"You're a frontend engineer —
this cuts your design review round-trips."* Same catalog, different person.

Fastest reset between run-throughs:

```bash
rm -rf ~/demo/.claude          # seeded events persist; live ones clear on server restart
```

---

## Judge questions, and the honest answers

**"Are those numbers real?"**
No — the catalog and the historical metrics are seeded, and we label that in the UI and the
README. The install you just watched is real and tagged `this session`. We would rather show one
real event than twelve fake ones.

**"Isn't this just a prompt marketplace?"**
A marketplace is public and optimizes for downloads. This is private and optimizes for whether
the workflow *worked here*. The retention column is the product — it is the only place that tells
you a skill is being abandoned.

**"Why would a company adopt this over a Notion page?"**
A Notion page cannot install itself into an agent, and it cannot tell you nobody uses it.

**"What stops someone installing the legal skill?"**
Try it — search as a `designer` for contract review. You find it, because hiding it helps nobody,
but install is gated at the registry. `requiredRole` is where a real IdP plugs in.

**"What's the wedge?"**
Companies already running agents at 50+ seats, where skill sprawl is already painful and someone
has been made responsible for it.

**"What would you build next?"**
Skills that write themselves — compile a merged PR review or a Slack thread into a candidate
skill and route it for approval. Publishing is the step that stays manual today.
