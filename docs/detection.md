# Detecting Skill Usage Across Agents

How Skillbase knows a skill was used, on each agent, and what each route is
worth. Findings are marked as **verified** (reproduced on a real machine),
**documented** (from official docs, not yet reproduced) or **unconfirmed**.

---

## The headline finding

Claude Code and Codex expose skill usage in completely different ways, and the
Codex mechanism is not documented anywhere — it was found by reading real
session files.

**Claude Code** runs skills through a first-class `Skill` tool, so a hook matched
to that tool sees every invocation directly.

**Codex** has no `Skill` tool. It activates a skill by progressive disclosure,
with no skill hook event and no `$`-mention event, and its `PreToolUse` fires
only for the shell tool — which makes it look like hook-based detection is
impossible here.

It is not. Inspecting 1,840 real rollout files showed what activation actually
is:

```json
{"type":"function_call","name":"exec_command",
 "arguments":{"cmd":"sed -n '1,240p' /home/node/.agents/skills/agent-reach/SKILL.md"}}
```

**Codex loads a skill by reading the file with a shell command — and shell is
precisely the one tool its hook does fire for.** So Codex skill usage *is*
detectable through hooks, the skill name comes straight out of the path, and no
beacon is required for the two major agents.

The beacon still matters, but for its real purpose: agents where nothing can be
assumed — Hermes Agent, Goose, and whatever ships next.

---

## Route comparison

| Route | Claude Code | Codex | Cursor | Any other | Confidence | Needs install |
|---|---|---|---|---|---|---|
| Native hook | ✅ `Skill` tool | ✅ **SKILL.md read via shell** | ⚠️ no skill event | ❌ | 1.00 / 0.95 | yes |
| Beacon in `SKILL.md` | ✅ | ✅ | ✅ | ✅ | 0.80 | skill only |
| Transcript / rollout mining | ✅ exact, retroactive | ✅ exact, retroactive | ⚠️ untested | ❌ | 0.99 / 0.95 | **no** |
| OpenTelemetry | ✅ `skill.name` built in | ⚠️ no skill attribute | ❌ | ❌ | 0.95 | org-wide config |

---

## Claude Code — three working routes

### Hooks (primary, verified)

30 hook events exist. The relevant ones:

| Event | Use |
|---|---|
| `PreToolUse` matcher `Skill` | invocation, with `tool_input.skill` |
| `PostToolUse` / `PostToolUseFailure` matcher `Skill` | outcome, paired by `tool_use_id` |
| `UserPromptExpansion` | typed `/name` commands, via `command_name` |
| `SessionEnd` | flush |

Payload: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `permission_mode`,
`tool_name`, `tool_input`, `tool_use_id`, `tool_response`,
`tool_response_is_error`, plus `agent_id`/`agent_type` for subagents.

**The gap:** a user typing `/skillname` expands client-side and is reported by
`UserPromptExpansion`, which per the docs bypasses `PreToolUse`. The adapter
handles this without double-counting or dropping events: the expansion writes a
marker instead of emitting; a following `Skill` call consumes the marker and only
upgrades its `trigger` to `explicit_command`; a marker still unconsumed at
`SessionEnd` is flushed as the invocation. **Exactly one event either way**,
whichever behaviour the runtime actually has — which is why the unconfirmed
detail below does not put the counts at risk.

Verified locally:

```
PreToolUse  (Skill: handoff)         → invoked   trigger=model_auto       hash=b2aa0a51…
PostToolUse (Skill: handoff)         → completed outcome=success          duration=33ms
UserPromptExpansion + PreToolUse     → invoked   trigger=explicit_command (1 event, not 2)
PreToolUse  (Bash)                   → ignored
```

### Transcript mining (verified, no install required)

`~/.claude/projects/**/*.jsonl`. Per invocation this yields:

- `tool_use` with `name: "Skill"`, `input.skill`, `input.args`, `caller.type`
- `tool_result` with `toolUseResult: {success, commandName}` → outcome
- the following message: `Base directory for this skill: <path>` → install scope
  and the on-disk `SKILL.md` to hash
- `sessionId`, `promptId`, `cwd`, `gitBranch`, `version`, `model`, `isSidechain`,
  token usage

**This is the fastest path to a credible dashboard.** On the development machine
it recovered **1,648 invocations across 57 skills from 8,362 transcript files
(1.6M records) with zero parse failures**, on a machine that had never been
instrumented — a month of adoption history available before anyone installs
anything.

It is also the ground truth the beacon's compliance rate is measured against.

### OpenTelemetry (documented, best for org-wide rollout)

`CLAUDE_CODE_ENABLE_TELEMETRY=1` plus OTLP exporter settings.

- `claude_code.cost.usage` and `claude_code.token.usage` carry a **`skill.name`**
  attribute — per-skill cost is available with no custom code
- `claude_code.tool_decision` (`tool_name`, `decision`, `source`, `tool_use_id`),
  `claude_code.tool_result` (`success`, `duration_ms`, `error_type`),
  `claude_code.user_prompt` (`command_name`)
- all events correlate on `prompt.id`
- **managed settings can force this org-wide, and users cannot override it** —
  the right answer for enterprise deployment

---

## Codex — the shell read is the activation

Codex has hooks: `~/.codex/hooks.json` or `[hooks]` in `config.toml`, with
`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
`PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStart`,
`SubagentStop`, `Stop`. The payload is nearly identical to Claude Code's.

Three constraints look fatal at first:

1. **No `Skill` tool.** Skills load by progressive disclosure. *(documented)*
2. **No skill or `$`-mention hook event.** Absent from the official hooks
   documentation. *(documented)*
3. **`PreToolUse` fires only for the shell tool** — `apply_patch`, file reads and
   MCP calls do not trigger it. The engine is also opt-in behind
   `[features] codex_hooks = true` and marked under development. *(documented —
   GitHub issue openai/codex#16732 and secondary sources; not reproduced here)*

Constraint 3 turns out to be the way in. **Codex reads `SKILL.md` through the
shell**, so the activation lands in exactly the tool hooks observe. *(verified —
9 reads across 1,840 rollout files, tool name `exec_command`)*

Skills live at `~/.agents/skills/`, `<repo>/.agents/skills/`, `/etc/codex/skills`
— verified present on the development machine.

### Signals, in order of trust

| Signal | Mechanism | Confidence |
|---|---|---|
| **SKILL.md read** | shell command reading `<codex-skills-dir>/<name>/SKILL.md` | **0.95** |
| Skill script execution | shell command running a file inside a skill directory | 0.90 |
| `$mention` | `UserPromptSubmit` prompt scan | 0.85 |
| Beacon | skill self-reports via shell | 0.80 |

Verified locally:

```
Bash: sed -n '1,240p' ~/.agents/skills/agent-reach/SKILL.md → invoked conf=0.95  ← the activation
Bash: ~/.agents/skills/find-skills/scripts/run.sh           → invoked conf=0.90
$mention "use $agent-reach …"                               → invoked conf=0.85  (prompt text not retained)
Bash: npx skilldrop emit …                                  → ignored (no double count)
```

### Precision: which reads count

Only reads under a directory Codex actually discovers skills in
(`.agents/skills`, `.codex/skills`, `/etc/codex/skills`) are counted. Two
narrowing decisions, both forced by measurement rather than taste:

| Rule | Rejected alternative | Measured on 1,840 rollouts |
|---|---|---|
| Require a Codex skills root | any parent directory named `skills` | 242 hits / 51 skills → **8 hits / 2 skills** |
| Match the SKILL.md read | fingerprint the skill's body text | 52 sessions → 7 for the same skill |
| — | match the skill's directory path | **1,840 of 1,840 files** (the catalog listing) |

The rejected variants all measured *availability*, not use. Progressive
disclosure shows every skill's name, description and path at session start, so
anything matching those matches every session. And `.claude/skills/` reads are
overwhelmingly somebody *editing* a skill — reading a skill you are writing is
not using it.

The cost is recall: an org pointing Codex at a non-standard skills directory
would be missed, and is covered by the beacon instead.

### Rollout mining

`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` **exists as documented**, 1,840
files on the development machine. The backfill applies the same SKILL.md-read
rule to `function_call` records, and its output matches an independently written
counting script exactly (`agent-reach` 7, `find-skills` 1).

---

## The beacon — coverage beyond the two majors

With the shell-read finding, Claude Code and Codex are both covered by hooks, so
the beacon is no longer load-bearing for them. It remains the answer for
everything else — Hermes Agent, Goose, OpenCode, and any agent that ships next —
and as a fallback where a hook cannot be installed or a skills directory is
non-standard.

SkillDrop injects into each managed `SKILL.md`:

```markdown
## Telemetry (managed by SkillDrop — do not edit)

Run this first, before any other step in this skill:

    npx -y skilldrop emit --skill acme/prod-db@1.4.0 --phase start
```

**Why this works everywhere:** hooks, transcripts and OTel all depend on knowing
the host. What every agent shares is that it reads the skill body and acts on it,
so one shell command is the lowest common denominator across any agent with a
shell.

Design details that exist to protect the hit rate:

- **No variables to thread.** `start` mints a run id and parks it locally;
  `end` reclaims it. An earlier draft asked the model to carry a UUID between two
  commands — exactly the kind of instruction models drop. Verified: two separate
  processes, correct 7,000 ms duration, no id passed.
- **`end` is explicitly optional.** Losing a duration is cheap; losing the
  invocation count is not.
- **Agent auto-detected** from environment variables, so the skill body stays
  identical on every platform.

**The honest weakness:** a model can skip an instruction, so compliance is below
100%. This route is therefore ranked below direct observation, and the rate is
*measured* by the `beacon_compliance` view rather than assumed — comparing runs
seen directly against those the beacon also reported.

---

## Recommended rollout

1. **Day 0 — backfill.** `skilldrop-collect backfill claude` and `backfill codex`.
   No installation, months of history, a dashboard with real numbers immediately.
2. **Day 1 — hooks.** `skilldrop-collect enroll` wires both majors: Claude Code
   on the `Skill` tool, Codex on the shell read.
3. **Day 1 — beacon.** Injected into SkillDrop-managed skills. Extends coverage
   to every other agent and to non-standard installs.
4. **Enterprise — OTel.** Managed settings, org-wide, non-overridable, and adds
   per-skill cost on Claude Code.

---

## Live end-to-end verification

`bun scripts/e2e-agents.ts` installs a throwaway skill, launches **real `claude`
and `codex` processes** against isolated config, makes each use the skill, and
asserts the collector recorded it. 8/8 checks pass from a clean state.

| Check | Result |
|---|---|
| Claude Code ran the skill | `E2E-PROBE-OK` |
| `invoked` recorded | `trigger=model_auto`, `scope=project`, real `tool_use_id` |
| `completed` recorded | paired by `tool_use_id`, duration ~70 ms |
| Codex ran the skill | `E2E-PROBE-OK` |
| `invoked` recorded | `confidence=0.95`, `detectionNote=skill_md_read` |
| Cross-agent identity | one content hash `3f26ac0c…` across both agents |

The Codex activation in that run was, verbatim from its own rollout:

```json
{"type":"function_call","name":"exec_command",
 "arguments":{"cmd":"sed -n '1,240p' …/.agents/skills/skillbase-e2e/SKILL.md"}}
```

which is exactly the mechanism inferred from historical rollouts. Codex
normalizes it to `tool_name: "Bash"` with `tool_input.command` in the hook
payload, matching what the adapter expected.

Ingest was verified in the same run: all three events reached Postgres through
`POST /api/ingest` with their trigger, scope, confidence and content hash intact.

### Codex silently skips untrusted hooks

The most important thing the live run found, because nothing reports it.

Codex requires hooks to be **trusted**, separately from the `[features] hooks`
flag. An untrusted hook produces no warning, no error and no log line — it is
simply not run. Enrolment therefore *looks* successful and collects nothing,
indefinitely.

Measured on two fresh `CODEX_HOME`s, identical but for one flag:

| Run | Hooks fired |
|---|---|
| fresh home, no bypass | **0 bytes — nothing** |
| fresh home, `--dangerously-bypass-hook-trust` | 453 bytes — fired |

Interactive Codex prompts for trust on first run; automation must pass the flag.
`skilldrop-collect enroll` now always prints this, because there is no file to
check to detect it.

Also corrected by the live run: the feature flag is `hooks`. `codex_hooks` still
works as a legacy alias, and both `~/.codex/hooks.json` and an inline
`[[hooks.PreToolUse]]` table in `config.toml` are loaded.

## Still unconfirmed

1. **Explicit vs auto on Claude Code.** The E2E covers the `model_auto` path and
   confirms it is reported correctly. All 1,648 historical invocations show
   `caller.type: "direct"`, which does not separate the two cases, and whether
   `UserPromptExpansion` fires alongside `PreToolUse` for a typed `/command` is
   still untested. The marker design is correct under either outcome.
2. **Whether Codex always reads SKILL.md via shell.** Every activation observed —
   9 historical plus the live probe — used `exec_command`, but a build that
   inlined the file instead would be invisible to this route. The beacon is the
   hedge.
3. **Cursor, Gemini CLI, Hermes.** Cursor has hooks (`beforeShellExecution`,
   `sessionStart`, …) and a skills directory that were verified present; neither
   its hook payloads nor Hermes' surface were investigated. Both are expected to
   be covered by the beacon, which is untested on them.
