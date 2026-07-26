#!/usr/bin/env bun
/**
 * Bundle the collector into a single Node-runnable file for npm.
 *
 * The published artifact is one dependency-free ~60 KB file that runs on plain
 * Node 18+. That matters more than it sounds: this CLI is invoked as an agent
 * hook on the critical path of every skill call, and from inside SKILL.md via
 * `npx`. Every dependency would be install latency on a hot path and one more
 * way for telemetry to break someone's agent.
 *
 * It also means the published package needs neither Bun nor the app repo.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dir, '..');
const ENTRY = join(REPO, 'cli', 'skilldrop-collect.ts');
const OUT_DIR = join(REPO, 'packages', 'cli', 'dist');
const OUT = join(OUT_DIR, 'skillbase.js');

mkdirSync(OUT_DIR, { recursive: true });

const result = await Bun.build({
  entrypoints: [ENTRY],
  target: 'node',
  format: 'esm',
  minify: false,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const artifact = result.outputs[0];
if (!artifact) {
  console.error('build produced no output');
  process.exit(1);
}

let code = await artifact.text();

// Bun emits its own shebang only when the entry has one; make it explicit and
// pointed at node, since the published binary must not require Bun.
code = code.replace(/^#!.*\n/, '');
code = `#!/usr/bin/env node\n${code}`;

writeFileSync(OUT, code, 'utf8');
chmodSync(OUT, 0o755);

const pkg = JSON.parse(readFileSync(join(REPO, 'packages', 'cli', 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};

const kb = (Buffer.byteLength(code) / 1024).toFixed(1);
console.log(`built ${pkg.name}@${pkg.version}`);
console.log(`  ${OUT}  ${kb} KB`);
