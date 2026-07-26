/**
 * Discovery of skills on disk, across every agent's conventions.
 *
 * All of these agents read the same SKILL.md format but look in different
 * places, so the search paths are the only agent-specific part. Resolving an
 * observed skill name to a file gives two things the telemetry needs and the
 * standard does not provide: the install scope, and a content hash that pins
 * the exact version that ran.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { skillContentHash } from './identity.ts';
import type { AgentKind, InstallScope } from './schema.ts';

export interface SkillSearchPath {
  dir: string;
  scope: InstallScope;
}

export interface DiscoveredSkill {
  /** Directory name — the de-facto identifier under the Agent Skills standard. */
  name: string;
  path: string;
  skillMdPath: string;
  scope: InstallScope;
  contentHash: string;
  frontmatter: SkillFrontmatter;
}

/** Frontmatter fields defined by the Agent Skills specification. */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  authors?: string[];
  tags?: string[];
  platforms?: string[];
  license?: string;
  repository?: string;
  docs?: string;
  [key: string]: unknown;
}

/**
 * Where each agent looks for skills. Verified on a machine running all three:
 * Claude Code under `.claude/skills`, Codex under the vendor-neutral
 * `.agents/skills`, Cursor under `.cursor/skills-cursor`.
 */
export function searchPaths(agentKind: AgentKind, cwd?: string | null): SkillSearchPath[] {
  const home = homedir();
  const paths: SkillSearchPath[] = [];

  switch (agentKind) {
    case 'claude_code':
      paths.push({ dir: join(home, '.claude', 'skills'), scope: 'user' });
      if (cwd) paths.push({ dir: join(cwd, '.claude', 'skills'), scope: 'project' });
      break;
    case 'codex':
      paths.push({ dir: join(home, '.agents', 'skills'), scope: 'user' });
      paths.push({ dir: join(home, '.codex', 'skills'), scope: 'user' });
      if (cwd) {
        paths.push({ dir: join(cwd, '.agents', 'skills'), scope: 'project' });
        paths.push({ dir: join(cwd, '.codex', 'skills'), scope: 'project' });
      }
      paths.push({ dir: '/etc/codex/skills', scope: 'admin' });
      break;
    case 'cursor':
      paths.push({ dir: join(home, '.cursor', 'skills-cursor'), scope: 'user' });
      paths.push({ dir: join(home, '.cursor', 'skills'), scope: 'user' });
      if (cwd) paths.push({ dir: join(cwd, '.cursor', 'skills'), scope: 'project' });
      break;
    default:
      // Unknown agents still follow the standard's neutral location.
      paths.push({ dir: join(home, '.agents', 'skills'), scope: 'user' });
      if (cwd) paths.push({ dir: join(cwd, '.agents', 'skills'), scope: 'project' });
      break;
  }
  return paths;
}

/** Minimal YAML frontmatter reader — enough for the flat scalar/list schema skills use. */
export function parseFrontmatter(markdown: string): SkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match?.[1]) return {};

  const out: SkillFrontmatter = {};
  let currentKey: string | null = null;

  for (const rawLine of match[1].split(/\r?\n/)) {
    const listItem = /^\s*-\s+(.*)$/.exec(rawLine);
    if (listItem?.[1] !== undefined && currentKey) {
      const existing = out[currentKey];
      const list = Array.isArray(existing) ? (existing as string[]) : [];
      list.push(stripQuotes(listItem[1].trim()));
      out[currentKey] = list;
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(rawLine);
    if (!kv?.[1]) continue;

    const key = kv[1];
    const value = (kv[2] ?? '').trim();
    currentKey = key;

    if (value === '' || value === '>' || value === '|' || value === '>-' || value === '|-') {
      // Block scalar or an about-to-start list; the value arrives on later lines.
      out[key] = value === '' ? [] : '';
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      out[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter((s) => s.length > 0);
      continue;
    }
    out[key] = stripQuotes(value);
  }

  // Folded descriptions span lines; re-read them as raw text.
  for (const key of ['description', 'name'] as const) {
    if (Array.isArray(out[key]) || out[key] === '') {
      const block = readBlockScalar(match[1], key);
      if (block) out[key] = block;
    }
  }
  return out;
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}

function readBlockScalar(frontmatter: string, key: string): string | null {
  const lines = frontmatter.split(/\r?\n/);
  const startIndex = lines.findIndex((l) => new RegExp(`^${key}:\\s*[>|]?-?\\s*$`).test(l));
  if (startIndex === -1) return null;

  const collected: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^[A-Za-z0-9_-]+:/.test(line)) break;
    collected.push(line.trim());
  }
  const text = collected.join(' ').trim();
  return text.length > 0 ? text : null;
}

function readSkillDir(dir: string, name: string, scope: InstallScope): DiscoveredSkill | null {
  const skillMdPath = join(dir, name, 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;
  try {
    const markdown = readFileSync(skillMdPath, 'utf8');
    return {
      name,
      path: join(dir, name),
      skillMdPath,
      scope,
      contentHash: skillContentHash(markdown),
      frontmatter: parseFrontmatter(markdown),
    };
  } catch {
    return null;
  }
}

/** Every skill installed for one agent. */
export function discoverSkills(agentKind: AgentKind, cwd?: string | null): DiscoveredSkill[] {
  const found: DiscoveredSkill[] = [];
  const seen = new Set<string>();

  for (const { dir, scope } of searchPaths(agentKind, cwd)) {
    if (!existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      try {
        if (!statSync(join(dir, entry)).isDirectory()) continue;
      } catch {
        continue;
      }
      const skill = readSkillDir(dir, entry, scope);
      if (skill && !seen.has(skill.path)) {
        seen.add(skill.path);
        found.push(skill);
      }
    }
  }
  return found;
}

/**
 * Resolve a name an agent reported to the skill on disk. Plugin-qualified names
 * (`plugin:skill`) and directory-scoped names (`apps/web:deploy`) are reduced to
 * their last segment, which is the directory that actually exists.
 */
export function resolveSkill(
  agentKind: AgentKind,
  observedName: string,
  cwd?: string | null,
): DiscoveredSkill | null {
  const bare = observedName.includes(':')
    ? (observedName.split(':').pop() ?? observedName)
    : observedName;

  for (const { dir, scope } of searchPaths(agentKind, cwd)) {
    const direct = readSkillDir(dir, bare, scope);
    if (direct) return direct;
  }
  return discoverSkills(agentKind, cwd).find((s) => s.name === bare) ?? null;
}

/** Scope implied by a name or path when the file cannot be found. */
export function inferScope(observedName: string, basePath?: string | null): InstallScope {
  if (observedName.includes(':')) return 'plugin';
  if (!basePath) return 'unknown';
  if (basePath.includes('/plugins/')) return 'plugin';
  if (basePath.startsWith(homedir())) return 'user';
  if (basePath.startsWith('/etc/')) return 'admin';
  return 'project';
}
