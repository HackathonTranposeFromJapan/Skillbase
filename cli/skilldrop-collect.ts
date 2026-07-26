#!/usr/bin/env bun
/**
 * skilldrop-collect — the telemetry half of SkillDrop.
 *
 * `cli/skilldrop.ts` installs skills; this collects what happens to them
 * afterwards. Kept as a separate entry point for now so the two can be merged
 * into one `skilldrop` binary without either side blocking the other.
 *
 * It runs in three very different contexts, which shapes how it fails:
 *
 *   - as an agent hook, on the critical path of a tool call
 *   - as a beacon, invoked from inside a skill via `npx`
 *   - as an operator command (enroll, scan, backfill, flush)
 *
 * In the first two it must never break the agent. Every hook path therefore
 * exits 0 and prints `{"continue": true}` no matter what went wrong: a
 * telemetry pipeline that blocks someone's work gets uninstalled within the
 * hour, and rightly so.
 */

import { adaptBeacon, beaconSnippet, detectAgentKind } from '../lib/skillbase/adapters/beacon.ts';
import { adaptClaudeHook, type ClaudeHookPayload } from '../lib/skillbase/adapters/claude-code.ts';
import { adaptCodexHook, type CodexHookPayload } from '../lib/skillbase/adapters/codex.ts';
import { backfillClaudeCode } from '../lib/skillbase/backfill/claude-code.ts';
import { backfillCodex } from '../lib/skillbase/backfill/codex.ts';
import { codexHooksEnabled, enrollClaudeCode, enrollCodex } from '../lib/skillbase/enroll.ts';
import { agentInstallId, skillbaseHome } from '../lib/skillbase/identity.ts';
import { discoverSkills } from '../lib/skillbase/scan.ts';
import { AGENT_KINDS, type AgentKind, type SkillEvent } from '../lib/skillbase/schema.ts';
import { appendEvents, flushSpool, readSpool, spoolPath } from '../lib/skillbase/spool.ts';

const USAGE = `skilldrop-collect — skill-usage telemetry for AI agents

Usage:
  skilldrop-collect hook claude --event <name>   Read a Claude Code hook payload on stdin
  skilldrop-collect hook codex  --event <name>   Read a Codex hook payload on stdin
  skilldrop-collect emit --skill <ref> [--phase start|end] [--outcome success|error]
  skilldrop-collect enroll [--dry-run] [--command <path>]
  skilldrop-collect scan [--agent <kind>] [--json]
  skilldrop-collect backfill <claude|codex> [--dry-run] [--since <ISO date>] [--json]
  skilldrop-collect flush
  skilldrop-collect status
  skilldrop-collect beacon-snippet --skill <ref>

Environment:
  SKILLBASE_INGEST_URL    Ingest endpoint used by flush
  SKILLBASE_TOKEN         Bearer token for the ingest endpoint
  SKILLBASE_TENANT_ID     Tenant stamped onto every event
  SKILLBASE_PRINCIPAL_ID  Employee identity stamped onto every event
  SKILLBASE_HOME          Override the state directory (default ~/.skillbase)
`;

interface Args {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

const str = (flags: Args['flags'], key: string): string | null =>
  typeof flags[key] === 'string' ? (flags[key] as string) : null;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/** Hooks always succeed from the agent's point of view. */
function hookOk(): never {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

async function runHook(agent: 'claude' | 'codex', args: Args): Promise<never> {
  try {
    const raw = await readStdin();
    const payload = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};

    // Passed as a flag because one hook entry may serve several events; the
    // payload's own field wins when present.
    const eventName = str(args.flags, 'event');
    if (eventName && !payload.hook_event_name) payload.hook_event_name = eventName;

    const events: SkillEvent[] =
      agent === 'claude'
        ? adaptClaudeHook(payload as ClaudeHookPayload)
        : adaptCodexHook(payload as CodexHookPayload);

    if (events.length > 0) appendEvents(events);
  } catch {
    // Swallowed deliberately: see the file header.
  }
  hookOk();
}

function runEmit(args: Args): void {
  const skill = str(args.flags, 'skill');
  if (!skill) {
    // Even misuse of the beacon must not fail the skill that called it.
    process.stderr.write('emit: --skill is required\n');
    process.exit(0);
  }

  const phase = str(args.flags, 'phase') === 'end' ? 'end' : 'start';
  const outcomeFlag = str(args.flags, 'outcome');
  const outcome =
    outcomeFlag === 'error' || outcomeFlag === 'aborted' || outcomeFlag === 'success'
      ? outcomeFlag
      : null;

  try {
    const event = adaptBeacon({
      skill,
      phase,
      outcome,
      run: str(args.flags, 'run'),
      agent: str(args.flags, 'agent'),
      session: str(args.flags, 'session'),
      cwd: str(args.flags, 'cwd'),
      args: str(args.flags, 'args'),
    });
    const { written, errors } = appendEvents([event]);
    if (args.flags.verbose) {
      process.stdout.write(
        `recorded ${written} event(s) for ${skill} (${phase})` +
          `${errors.length > 0 ? ` — errors: ${errors.join('; ')}` : ''}\n`,
      );
    }
  } catch (error) {
    if (args.flags.verbose) process.stderr.write(`emit failed: ${String(error)}\n`);
  }
  process.exit(0);
}

function runEnroll(args: Args): void {
  const options = {
    command: str(args.flags, 'command') ?? undefined,
    dryRun: Boolean(args.flags['dry-run']),
  };

  for (const result of [enrollClaudeCode(options), enrollCodex(options)]) {
    process.stdout.write(`${result.agent.padEnd(12)} ${result.configPath}\n`);
    process.stdout.write(
      `${''.padEnd(12)} ${result.changed ? 'updated' : 'unchanged'} — ${result.note}\n`,
    );
  }

  if (!codexHooksEnabled()) {
    process.stdout.write(
      '\nCodex hooks are gated behind a feature flag. Add to ~/.codex/config.toml:\n' +
        '  [features]\n  codex_hooks = true\n' +
        'Until then, Codex coverage comes from the beacon route only.\n',
    );
  }
  if (options.dryRun) process.stdout.write('\n(dry run — nothing written)\n');
}

function runScan(args: Args): void {
  const requested = str(args.flags, 'agent');
  const agents: AgentKind[] = requested
    ? [requested as AgentKind]
    : ['claude_code', 'codex', 'cursor'];

  const report = agents.map((agent) => ({
    agent,
    installId: agentInstallId(agent),
    skills: discoverSkills(agent, process.cwd()).map((s) => ({
      name: s.name,
      scope: s.scope,
      version: typeof s.frontmatter.version === 'string' ? s.frontmatter.version : null,
      contentHash: s.contentHash.slice(0, 16),
      path: s.path,
    })),
  }));

  if (args.flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  for (const entry of report) {
    process.stdout.write(`\n${entry.agent} (${entry.skills.length} skills)\n`);
    for (const skill of entry.skills) {
      const version = skill.version ? `v${skill.version}` : '-';
      process.stdout.write(
        `  ${skill.name.padEnd(28)} ${skill.scope.padEnd(8)} ${version.padEnd(10)} ${skill.contentHash}\n`,
      );
    }
  }
}

function runBackfill(args: Args): void {
  const target = args.positional[1];
  if (target !== 'claude' && target !== 'codex') {
    process.stderr.write('backfill: expected `claude` or `codex`\n');
    process.exit(1);
  }

  const sinceFlag = str(args.flags, 'since');
  const since = sinceFlag ? new Date(sinceFlag) : null;
  if (since && Number.isNaN(since.getTime())) {
    process.stderr.write(`backfill: --since is not a valid date: ${sinceFlag}\n`);
    process.exit(1);
  }

  const { events, stats } =
    target === 'claude'
      ? backfillClaudeCode({ since })
      : backfillCodex({ since, cwd: process.cwd() });

  if (args.flags.json) {
    process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
  } else {
    process.stdout.write(
      `scanned ${stats.filesScanned} files, ${stats.linesParsed} records ` +
        `(${stats.parseFailures} unparseable)\n`,
    );
    process.stdout.write(
      `${stats.events} events across ${Object.keys(stats.bySkill).length} skills\n`,
    );
    if ('note' in stats && stats.note) process.stdout.write(`note: ${stats.note}\n`);

    const ranked = Object.entries(stats.bySkill).sort((a, b) => b[1] - a[1]);
    for (const [skill, count] of ranked.slice(0, 20)) {
      process.stdout.write(`  ${String(count).padStart(6)}  ${skill}\n`);
    }
    if (ranked.length > 20) process.stdout.write(`  ... and ${ranked.length - 20} more\n`);
  }

  if (args.flags['dry-run']) {
    // Keep --json machine-readable: a trailing human note breaks every parser.
    if (!args.flags.json) process.stdout.write('\n(dry run — nothing written to the spool)\n');
    return;
  }

  const { written, errors } = appendEvents(events);
  if (!args.flags.json) {
    process.stdout.write(`\nwrote ${written} events to ${spoolPath()}\n`);
    if (errors.length > 0) process.stdout.write(`${errors.length} rejected, first: ${errors[0]}\n`);
  }
}

async function runFlush(): Promise<void> {
  const result = await flushSpool();
  if (result.error) {
    process.stdout.write(
      `sent ${result.sent}, ${result.remaining} still queued — ${result.error}\n`,
    );
    process.exit(result.sent > 0 ? 0 : 1);
  }
  process.stdout.write(`sent ${result.sent} events\n`);
}

function runStatus(): void {
  const events = readSpool();
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const event of events) {
    byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
    bySource[event.detectedBy] = (bySource[event.detectedBy] ?? 0) + 1;
  }

  process.stdout.write(`state dir:           ${skillbaseHome()}\n`);
  process.stdout.write(`spool:               ${spoolPath()}\n`);
  process.stdout.write(`queued:              ${events.length} events\n`);
  process.stdout.write(`by type:             ${JSON.stringify(byType)}\n`);
  process.stdout.write(`by source:           ${JSON.stringify(bySource)}\n`);
  process.stdout.write(`ingest URL:          ${process.env.SKILLBASE_INGEST_URL ?? '(unset)'}\n`);
  process.stdout.write(`detected agent:      ${detectAgentKind()}\n`);
  process.stdout.write(`codex hooks enabled: ${codexHooksEnabled()}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];

  switch (command) {
    case 'hook': {
      const agent = args.positional[1];
      if (agent !== 'claude' && agent !== 'codex') hookOk();
      await runHook(agent, args);
      return;
    }
    case 'emit':
      return runEmit(args);
    case 'enroll':
      return runEnroll(args);
    case 'scan':
      return runScan(args);
    case 'backfill':
      return runBackfill(args);
    case 'flush':
      return runFlush();
    case 'status':
      return runStatus();
    case 'beacon-snippet': {
      const skill = str(args.flags, 'skill');
      if (!skill) {
        process.stderr.write('beacon-snippet: --skill is required\n');
        process.exit(1);
      }
      process.stdout.write(beaconSnippet(skill));
      return;
    }
    case 'agents':
      process.stdout.write(`${AGENT_KINDS.join('\n')}\n`);
      return;
    default:
      process.stdout.write(USAGE);
      process.exit(command === undefined || command === 'help' ? 0 : 1);
  }
}

void main();
