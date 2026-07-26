/**
 * Enrollment — wiring the collector into each agent's hook configuration.
 *
 * Both agents are configured by merging into JSON the user already owns, so
 * existing hooks are preserved and re-running enrollment is idempotent.
 *
 * Claude Code gets the precise wiring: `PreToolUse`/`PostToolUse` filtered to
 * the `Skill` tool, plus `UserPromptExpansion` for typed commands and
 * `SessionEnd` to flush. Codex gets `UserPromptSubmit` and a shell matcher,
 * which is all its hook surface can offer for skills — the beacon covers the
 * rest.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface EnrollOptions {
  /** Command the agent will run; defaults to the globally installed CLI. */
  command?: string;
  dryRun?: boolean;
}

export interface EnrollResult {
  agent: string;
  configPath: string;
  changed: boolean;
  note: string;
}

interface HookCommand {
  type: 'command';
  command: string;
  timeout?: number;
  statusMessage?: string;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

const DEFAULT_COMMAND = 'skilldrop';

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    // Never overwrite a config that failed to parse — that is the user's file.
    throw new Error(`${path} is not valid JSON; refusing to modify it`);
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Add a hook entry unless an identical command is already registered. */
function mergeHook(
  hooks: Record<string, unknown>,
  event: string,
  matcher: string | undefined,
  command: HookCommand,
): boolean {
  const existing = Array.isArray(hooks[event]) ? (hooks[event] as HookMatcher[]) : [];

  for (const entry of existing) {
    if (entry.matcher !== matcher) continue;
    if (entry.hooks?.some((h) => h.command === command.command)) return false;
    entry.hooks.push(command);
    hooks[event] = existing;
    return true;
  }

  existing.push(matcher === undefined ? { hooks: [command] } : { matcher, hooks: [command] });
  hooks[event] = existing;
  return true;
}

export function enrollClaudeCode(options: EnrollOptions = {}): EnrollResult {
  const cli = options.command ?? DEFAULT_COMMAND;
  const configPath = join(homedir(), '.claude', 'settings.json');
  const settings = readJson(configPath);
  const hooks = (settings.hooks as Record<string, unknown>) ?? {};

  const hookCommand = (args: string): HookCommand => ({
    type: 'command',
    command: `${cli} hook claude ${args}`,
    timeout: 5,
  });

  let changed = false;
  // Matched to the Skill tool so the hook stays off the path of every other call.
  changed = mergeHook(hooks, 'PreToolUse', 'Skill', hookCommand('--event PreToolUse')) || changed;
  changed = mergeHook(hooks, 'PostToolUse', 'Skill', hookCommand('--event PostToolUse')) || changed;
  changed =
    mergeHook(hooks, 'PostToolUseFailure', 'Skill', hookCommand('--event PostToolUseFailure')) ||
    changed;
  // Typed `/name` commands expand client-side and never reach PreToolUse.
  changed =
    mergeHook(hooks, 'UserPromptExpansion', undefined, hookCommand('--event UserPromptExpansion')) ||
    changed;
  changed =
    mergeHook(hooks, 'SessionEnd', undefined, hookCommand('--event SessionEnd')) || changed;

  settings.hooks = hooks;
  if (changed && !options.dryRun) writeJson(configPath, settings);

  return {
    agent: 'claude_code',
    configPath,
    changed,
    note: changed ? 'hooks added' : 'already enrolled',
  };
}

export function enrollCodex(options: EnrollOptions = {}): EnrollResult {
  const cli = options.command ?? DEFAULT_COMMAND;
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const configPath = join(codexHome, 'hooks.json');
  const config = readJson(configPath);
  const hooks = (config.hooks as Record<string, unknown>) ?? {};

  const hookCommand = (args: string): HookCommand => ({
    type: 'command',
    command: `${cli} hook codex ${args}`,
    timeout: 5,
  });

  let changed = false;
  changed =
    mergeHook(hooks, 'UserPromptSubmit', undefined, hookCommand('--event UserPromptSubmit')) ||
    changed;
  // Shell is the tool Codex hooks reliably see, which is what makes both the
  // skill-script signal and the beacon observable here.
  changed =
    mergeHook(hooks, 'PreToolUse', '^(Bash|shell)$', hookCommand('--event PreToolUse')) || changed;

  config.hooks = hooks;
  if (!config.description) {
    config.description = 'Skillbase / SkillDrop skill-usage telemetry';
  }
  if (changed && !options.dryRun) writeJson(configPath, config);

  return {
    agent: 'codex',
    configPath,
    changed,
    note: changed
      ? 'hooks added — enable `[features] hooks = true` and trust the hooks (see below)'
      : 'already enrolled',
  };
}

/**
 * Codex gates hooks behind a feature flag. Reported rather than edited:
 * config.toml is hand-maintained and rewriting TOML loses comments and ordering.
 *
 * The flag is `hooks`; `codex_hooks` is still accepted as a legacy alias, so
 * both are recognized here.
 */
export function codexHooksEnabled(): boolean {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const configPath = join(codexHome, 'config.toml');
  try {
    const toml = readFileSync(configPath, 'utf8');
    return /^\s*(codex_)?hooks\s*=\s*true/m.test(toml);
  } catch {
    return false;
  }
}

/**
 * Codex additionally requires the hooks to be *trusted*, separately from the
 * feature flag.
 *
 * This matters more than it sounds: an untrusted hook does not warn, error or
 * log — it is silently skipped, so enrolment looks like it worked and collects
 * nothing forever. Confirmed on a fresh CODEX_HOME: identical runs recorded zero
 * events without trust and fired correctly with
 * `--dangerously-bypass-hook-trust`.
 *
 * Interactive Codex prompts for trust on first run; automation must pass the
 * flag. There is no file to inspect for this, so the CLI always surfaces it as a
 * required step rather than pretending to detect it.
 */
export const CODEX_TRUST_NOTE =
  'Codex silently skips hooks that have not been trusted — no warning is printed.\n' +
  'Run `codex` interactively once and accept the hook trust prompt, or pass\n' +
  '`--dangerously-bypass-hook-trust` for non-interactive runs.';
