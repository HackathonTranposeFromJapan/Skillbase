#!/usr/bin/env bun
/**
 * skilldrop — the install layer for Skillbase.
 *
 * Pulls a skill out of the company registry and drops it into the local agent's
 * skill directory, then reports the install back so the company can see adoption.
 *
 *   bun cli/skilldrop.ts install design-polish
 *   bun cli/skilldrop.ts list
 *   bun cli/skilldrop.ts uninstall design-polish
 */

import { mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const REGISTRY = process.env.SKILLBASE_URL ?? "http://localhost:3100";
const SKILL_DIR = resolve(process.env.SKILLBASE_TARGET ?? ".claude/skills");
const ACTOR = process.env.SKILLBASE_ACTOR ?? "you@";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

async function install(slug: string) {
  if (!slug) die("usage: skilldrop install <skill-name>");

  process.stdout.write(c.dim(`  fetching ${slug} from ${REGISTRY}…\n`));

  const res = await fetch(`${REGISTRY}/api/skills/${slug}`).catch(() => null);
  if (!res || !res.ok) {
    die(`skill "${slug}" not found in the company registry`);
    return;
  }
  const skill = await res.json();

  if (skill.requiredRole !== "employee") {
    process.stdout.write(
      c.dim(`  governance: requires ${c.bold(skill.requiredRole)} — approved for ${ACTOR}\n`),
    );
  }

  const dir = join(SKILL_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), skill.body, "utf8");

  // Report adoption back to the company registry.
  const reported = await fetch(`${REGISTRY}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "install", slug, actor: ACTOR }),
  })
    .then((r) => r.ok)
    .catch(() => false);

  process.stdout.write(
    `\n  ${c.green("✓")} installed ${c.bold(skill.name)} ${c.dim(`v${skill.version}`)}\n` +
      `    ${c.cyan(join(dir, "SKILL.md"))}\n` +
      `    ${c.dim(skill.tagline)}\n` +
      `    ${c.dim(reported ? "adoption reported to acme-corp" : "offline — install not reported")}\n\n` +
      `  Your agent can use this skill now.\n\n`,
  );
}

async function list() {
  const exists = await stat(SKILL_DIR).catch(() => null);
  if (!exists) {
    process.stdout.write(c.dim("  no skills installed\n"));
    return;
  }
  const entries = await readdir(SKILL_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 0) {
    process.stdout.write(c.dim("  no skills installed\n"));
    return;
  }
  process.stdout.write(`\n  ${c.bold("installed skills")} ${c.dim(`(${SKILL_DIR})`)}\n\n`);
  for (const d of dirs) process.stdout.write(`    ${c.green("●")} ${d.name}\n`);
  process.stdout.write("\n");
}

async function uninstall(slug: string) {
  if (!slug) die("usage: skilldrop uninstall <skill-name>");
  await rm(join(SKILL_DIR, slug), { recursive: true, force: true });
  process.stdout.write(`  ${c.green("✓")} removed ${slug}\n`);
}

function die(msg: string): never {
  process.stderr.write(`  ${c.red("✗")} ${msg}\n`);
  process.exit(1);
}

const [cmd, arg] = process.argv.slice(2);

switch (cmd) {
  case "install":
    await install(arg);
    break;
  case "list":
    await list();
    break;
  case "uninstall":
    await uninstall(arg);
    break;
  default:
    process.stdout.write(
      `\n  ${c.bold("skilldrop")} ${c.dim("— install layer for Skillbase")}\n\n` +
        `    skilldrop install <skill>\n` +
        `    skilldrop list\n` +
        `    skilldrop uninstall <skill>\n\n`,
    );
}
