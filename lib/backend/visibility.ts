import 'server-only';

import { hexclaveConfigured, hexclaveServerApp } from '@/hexclave/server';

/**
 * Enforcing `skill.visibility`.
 *
 * The column has existed since the first migration and the README sells it —
 * company-wide, department-only, manager-approved, experimental, official — but
 * nothing checked it, so every level rendered identically. Hexclave's team RBAC
 * supplies the missing half.
 *
 * Two rules this must not break:
 *
 *  - Checks happen on the server. A client-side check is a UX affordance, not
 *    access control, and this decides which skills a person can see.
 *  - Signed out is not the same as denied. With no Hexclave credentials the app
 *    runs on seed data as a public demo, so an unauthenticated viewer sees the
 *    ordinary catalogue rather than an empty page.
 */

export const VISIBILITY_LEVELS = [
  'company',
  'department',
  'manager_approved',
  'experimental',
  'official',
] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

/** Which Hexclave permission each level demands. Absent = open to everyone. */
const REQUIRED_PERMISSION: Partial<Record<Visibility, string>> = {
  manager_approved: 'skills_manager',
  experimental: 'skills_admin',
};

export interface Viewer {
  /** Levels this viewer may see. */
  allowed: Set<Visibility>;
  /** True when a real Hexclave session drove the decision. */
  enforced: boolean;
  teamName: string | null;
  /** Levels withheld, so the UI can say "3 hidden" rather than silently drop them. */
  hidden: Visibility[];
}

const OPEN_LEVELS: Visibility[] = ['company', 'department', 'official'];

function openViewer(reason: { enforced: boolean; teamName?: string | null }): Viewer {
  return {
    allowed: new Set(VISIBILITY_LEVELS),
    enforced: reason.enforced,
    teamName: reason.teamName ?? null,
    hidden: [],
  };
}

/**
 * Work out what the current viewer may see.
 *
 * Falls back to the open catalogue whenever Hexclave is not configured or the
 * viewer is not signed in — the public demo has to keep working — and only
 * restricts once there is a real team to check permissions against.
 */
export async function getViewer(): Promise<Viewer> {
  if (!hexclaveConfigured()) return openViewer({ enforced: false });

  const user = await hexclaveServerApp.getUser().catch(() => null);
  if (!user) return openViewer({ enforced: false });

  const team = user.selectedTeam;
  // Signed in but with no team: nothing to scope permissions to, so treat them
  // as an ordinary viewer rather than locking them out of their own catalogue.
  if (!team) return openViewer({ enforced: false });

  const allowed = new Set<Visibility>(OPEN_LEVELS);
  const hidden: Visibility[] = [];

  for (const level of VISIBILITY_LEVELS) {
    const required = REQUIRED_PERMISSION[level];
    if (!required) continue;

    const granted = await user.getPermission(team, required).catch(() => null);
    if (granted) allowed.add(level);
    else hidden.push(level);
  }

  return { allowed, enforced: true, teamName: team.displayName ?? null, hidden };
}

export function canSee(viewer: Viewer, visibility: string | null | undefined): boolean {
  if (!visibility) return true;
  return viewer.allowed.has(visibility as Visibility);
}
