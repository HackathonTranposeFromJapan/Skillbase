# skillbase

Skill usage telemetry for AI coding agents.

Records which [Agent Skills](https://agentskills.my/specification/) (`SKILL.md`)
are actually used, on Claude Code, Codex, Cursor, and any agent that can run a
shell command.

```bash
curl -fsSL https://raw.githubusercontent.com/HackathonTranposeFromJapan/Skillbase/main/install.sh | sh
```

Node 18+ is the only requirement. Detects the agents installed on the machine
and wires the hooks into each.

Installed from npm instead? `npx skillbase init` does the same thing.

## Why it is one file with no dependencies

This CLI runs as an agent hook on the critical path of every skill invocation,
and from inside `SKILL.md` via `npx`. Dependencies would be install latency on a
hot path and one more way for telemetry to break somebody's agent. The published
artifact is a single ~60 KB file that runs on plain Node 18+.

Every hook path exits 0 and prints `{"continue": true}` regardless of what went
wrong. A telemetry pipeline that blocks your work gets uninstalled within the
hour, and rightly so.

## Commands

| Command | Does |
|---|---|
| `init` | detect agents and wire up hooks |
| `backfill claude\|codex` | recover past usage from local transcripts — no instrumentation, works retroactively |
| `status` | what has been collected locally |
| `flush` | send queued events to `SKILLBASE_INGEST_URL` |
| `scan` | list installed skills per agent, with content hashes |
| `emit --skill <ref> --phase start\|end` | the beacon skills call to report themselves |
| `hook claude\|codex` | hook entry point; reads a payload on stdin |

## Privacy

Metadata only. Skill name, version, timing, outcome, and hashed project
identity. Prompts, skill arguments and tool output are never transmitted, and
events carrying them are rejected at the boundary rather than by convention.

Nothing leaves the machine until `SKILLBASE_INGEST_URL` is set.

| Variable | Purpose |
|---|---|
| `SKILLBASE_INGEST_URL` | where `flush` sends events |
| `SKILLBASE_TOKEN` | bearer token for that endpoint |
| `SKILLBASE_TENANT_ID` | tenant stamped onto every event |
| `SKILLBASE_HOME` | state directory (default `~/.skillbase`) |

## How detection works

- **Claude Code** runs skills through a first-class `Skill` tool, so a hook
  matched to it observes every invocation, with the tool id pairing start to end.
- **Codex** has no such tool — it activates a skill by reading `SKILL.md` with a
  shell command, and shell is the one tool its hooks fire for. Note that Codex
  *silently* skips hooks that have not been trusted; `init` explains the step.
- **Anything else** is covered by a beacon line injected into managed skills.

Full write-up:
[docs/detection.md](https://github.com/HackathonTranposeFromJapan/Skillbase/blob/main/docs/detection.md)

## Not affiliated with `skilldrop`

The npm package `skilldrop` is an unrelated product in the same space. This is
`skillbase`.

MIT
