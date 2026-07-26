/**
 * Installing skills from the company registry.
 *
 * Ported into the published binary from `cli/skilldrop.ts` so that one command
 * both installs skills and measures them. Keeping them apart meant the UI told
 * people to run `skilldrop install`, and `skilldrop` on npm is an unrelated
 * product in this same space — copying that command runs a stranger's CLI.
 *
 * Dependency-free like the rest of this binary, and it writes to whichever
 * agent directory the caller points at, defaulting to Claude Code's.
 */

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { beaconSnippet } from './adapters/beacon.ts';

export interface RegistrySkill {
  slug: string;
  name: string;
  version?: string;
  tagline?: string;
  requiredRole?: string;
  body: string;
}

export function registryUrl(): string {
  return (process.env.SKILLBASE_URL ?? 'http://localhost:3100').replace(/\/$/, '');
}

export function skillDir(): string {
  return resolve(process.env.SKILLBASE_TARGET ?? '.claude/skills');
}

export interface InstallResult {
  ok: boolean;
  message: string;
  path?: string;
  skill?: RegistrySkill;
}

export async function installSkill(
  slug: string,
  options: { beacon?: boolean } = {},
): Promise<InstallResult> {
  if (!slug) return { ok: false, message: 'usage: skillbase install <skill-name>' };

  let skill: RegistrySkill;
  try {
    const res = await fetch(`${registryUrl()}/api/skills/${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, message: `skill "${slug}" not found in the registry at ${registryUrl()}` };
    }
    skill = (await res.json()) as RegistrySkill;
  } catch {
    return { ok: false, message: `cannot reach the registry at ${registryUrl()}` };
  }

  if (!skill.body) return { ok: false, message: `"${slug}" has no SKILL.md body to install` };

  const dir = join(skillDir(), slug);
  const file = join(dir, 'SKILL.md');
  try {
    mkdirSync(dir, { recursive: true });
    // The beacon is what makes this skill report itself on agents whose hooks
    // cannot see skill activation at all.
    const body = options.beacon ? `${skill.body.trimEnd()}\n\n${beaconSnippet(skill.slug)}` : skill.body;
    writeFileSync(file, body, 'utf8');
  } catch (error) {
    return { ok: false, message: `could not write ${file}: ${String(error)}` };
  }

  // Adoption is reported best-effort: a registry that is down must not make the
  // install itself fail, since the file is already on disk and usable.
  await fetch(`${registryUrl()}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'install', slug, actor: process.env.SKILLBASE_ACTOR ?? 'you@' }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);

  return { ok: true, message: `installed ${skill.name}`, path: file, skill };
}

export function listInstalled(): string[] {
  try {
    statSync(skillDir());
  } catch {
    return [];
  }
  try {
    return readdirSync(skillDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function uninstallSkill(slug: string): boolean {
  if (!slug) return false;
  try {
    rmSync(join(skillDir(), slug), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
