#!/usr/bin/env bun
/**
 * End-to-end verification against real agents.
 *
 *   bun scripts/e2e-agents.ts [--keep]
 *
 * Installs a throwaway skill, launches real `claude` and `codex` processes,
 * makes each one use it, and asserts that the collector recorded the
 * invocation. Everything runs against isolated config — `claude --settings` and
 * an isolated `CODEX_HOME` — so the developer's own agent setup is never
 * touched.
 *
 * This is the test that distinguishes "the adapter parses a payload I wrote
 * myself" from "a real agent invoking a real skill produces a real event". Both
 * agents' payload shapes were originally inferred from documentation, and one of
 * them was wrong in a way only a live run could show (see the Codex hook-trust
 * note below).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO = join(import.meta.dir, '..');
const ROOT = '/tmp/skillbase-e2e';
const SPOOL = join(ROOT, 'spool');
const COLLECT = join(REPO, 'cli', 'skilldrop-collect.ts');
const SKILL = 'skillbase-e2e';

const SKILL_MD = `---
name: ${SKILL}
description: Report the Skillbase end-to-end telemetry probe. Use when the user asks to run the skillbase e2e probe.
version: 1.0.0
---

# Skillbase E2E probe

A no-op skill used to verify that skill usage is detected.

When invoked, reply with exactly: \`E2E-PROBE-OK\` and nothing else.
`;

interface Recorded {
  agentKind: string;
  eventType: string;
  observedSkillName: string;
  trigger: string;
  installScope: string;
  detectedBy: string;
  confidence: number;
  observedContentHash: string | null;
  durationMs: number | null;
  agentMeta: Record<string, unknown>;
}

function sh(cmd: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    encoding: 'utf8',
    timeout: 300_000,
    input: '',
  });
}

function readSpool(): Recorded[] {
  const file = join(SPOOL, 'spool.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Recorded);
}

function writeSkill(dir: string): void {
  mkdirSync(join(dir, SKILL), { recursive: true });
  writeFileSync(join(dir, SKILL, 'SKILL.md'), SKILL_MD, 'utf8');
}

function hookCmd(agent: 'claude' | 'codex', event: string): string {
  // SKILLBASE_HOME is baked in rather than inherited: the hook is a separate
  // process and must not depend on how the agent was launched.
  return `SKILLBASE_HOME=${SPOOL} bun ${COLLECT} hook ${agent} --event ${event}`;
}

function setupClaude(): string {
  const dir = join(ROOT, 'cc');
  writeSkill(join(dir, '.claude', 'skills'));
  const settings = {
    hooks: {
      PreToolUse: [{ matcher: 'Skill', hooks: [{ type: 'command', command: hookCmd('claude', 'PreToolUse'), timeout: 10 }] }],
      PostToolUse: [{ matcher: 'Skill', hooks: [{ type: 'command', command: hookCmd('claude', 'PostToolUse'), timeout: 10 }] }],
      UserPromptExpansion: [{ hooks: [{ type: 'command', command: hookCmd('claude', 'UserPromptExpansion'), timeout: 10 }] }],
    },
  };
  writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
  return dir;
}

function setupCodex(): { project: string; codexHome: string } {
  const project = join(ROOT, 'cx');
  writeSkill(join(project, '.agents', 'skills'));
  // Codex refuses to run outside a trusted or version-controlled directory.
  sh('git', ['init', '-q'], { cwd: project });

  // Not under /tmp: Codex warns when CODEX_HOME lives there.
  const codexHome = join(homedir(), '.cache', 'skillbase-e2e-codex');
  rmSync(codexHome, { recursive: true, force: true });
  mkdirSync(codexHome, { recursive: true });

  const auth = join(homedir(), '.codex', 'auth.json');
  if (existsSync(auth)) writeFileSync(join(codexHome, 'auth.json'), readFileSync(auth, 'utf8'), 'utf8');

  writeFileSync(
    join(codexHome, 'config.toml'),
    [
      'model = "gpt-5.6-sol"',
      'model_reasoning_effort = "low"',
      'sandbox_mode = "danger-full-access"',
      'approval_policy = "never"',
      '',
      '[features]',
      // Named `hooks`; `codex_hooks` is accepted as a legacy alias.
      'hooks = true',
      '',
      `[projects."${project}"]`,
      'trust_level = "trusted"',
      '',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    join(codexHome, 'hooks.json'),
    JSON.stringify(
      { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: hookCmd('codex', 'PreToolUse'), timeout: 15 }] }] } },
      null,
      2,
    ),
    'utf8',
  );

  return { project, codexHome };
}

function report(label: string, ok: boolean, detail: string): boolean {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function main(): Promise<void> {
  const keep = process.argv.includes('--keep');
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(SPOOL, { recursive: true });

  console.log('Skillbase agent E2E\n');

  const results: boolean[] = [];

  // --- Claude Code -------------------------------------------------------
  console.log('claude code');
  const ccDir = setupClaude();
  const cc = sh(
    'claude',
    ['-p', `Run the ${SKILL} probe skill.`, '--settings', join(ccDir, 'settings.json'),
     '--permission-mode', 'bypassPermissions', '--output-format', 'text'],
    { cwd: ccDir },
  );
  const ccOut = `${cc.stdout ?? ''}`.trim();
  results.push(report('agent ran the skill', ccOut.includes('E2E-PROBE-OK'), ccOut.slice(0, 40)));

  const ccEvents = readSpool().filter((e) => e.agentKind === 'claude_code');
  const ccInvoked = ccEvents.find((e) => e.eventType === 'invoked');
  const ccDone = ccEvents.find((e) => e.eventType === 'completed');
  results.push(report('invoked recorded', Boolean(ccInvoked), ccInvoked ? `trigger=${ccInvoked.trigger} scope=${ccInvoked.installScope}` : 'no event'));
  results.push(report('completed recorded with duration', Boolean(ccDone?.durationMs), ccDone ? `${ccDone.durationMs}ms` : 'no event'));
  results.push(report('content hash resolved', Boolean(ccInvoked?.observedContentHash), ccInvoked?.observedContentHash?.slice(0, 16) ?? '-'));

  // --- Codex -------------------------------------------------------------
  console.log('\ncodex');
  const { project, codexHome } = setupCodex();
  const cx = sh(
    'codex',
    ['exec', '--skip-git-repo-check',
     // Codex will not run hooks without persisted trust, and gives no warning
     // when it skips them. Automation has to opt in explicitly.
     '--dangerously-bypass-hook-trust',
     `Run the ${SKILL} probe skill.`],
    { cwd: project, env: { CODEX_HOME: codexHome } },
  );
  const cxOut = `${cx.stdout ?? ''}`.trim();
  results.push(report('agent ran the skill', cxOut.includes('E2E-PROBE-OK'), cxOut.split('\n').pop()?.slice(0, 40) ?? ''));

  const cxEvents = readSpool().filter((e) => e.agentKind === 'codex');
  const cxInvoked = cxEvents.find((e) => e.eventType === 'invoked');
  results.push(report('invoked recorded', Boolean(cxInvoked), cxInvoked ? `conf=${cxInvoked.confidence}` : 'no event'));
  results.push(
    report(
      'detected via SKILL.md read',
      cxInvoked?.agentMeta?.detectionNote === 'skill_md_read',
      String(cxInvoked?.agentMeta?.detectionNote ?? '-'),
    ),
  );

  // --- cross-agent identity ---------------------------------------------
  console.log('\ncross-agent');
  const hashes = new Set(readSpool().map((e) => e.observedContentHash).filter(Boolean));
  results.push(
    report(
      'same skill resolves to one identity on both agents',
      hashes.size === 1,
      `${hashes.size} distinct content hash(es)`,
    ),
  );

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (keep) console.log(`artifacts kept in ${ROOT} and ${codexHome}`);
  else {
    rmSync(ROOT, { recursive: true, force: true });
    rmSync(codexHome, { recursive: true, force: true });
  }
  process.exit(passed === results.length ? 0 : 1);
}

void main();
