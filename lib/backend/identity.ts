/**
 * Resolving a Hexclave caller into a Skillbase tenant and principal.
 *
 * The schema was multi-tenant from the first migration, but nothing filled it
 * in: the tenant was a hardcoded constant and every event arrived without a
 * person attached, which is why department analytics read "Unassigned". Hexclave
 * closes that loop — a team becomes the tenant, a user becomes the principal.
 *
 * It is also what makes ingest safe. `POST /api/ingest` previously accepted
 * events from anyone who could reach it; now a caller presents a Hexclave access
 * token and the events are attributed to whoever that token belongs to, not to
 * whoever they claim to be.
 *
 * Hexclave stays optional. Without it the app runs exactly as before against the
 * demo tenant, so a missing credential degrades rather than breaks.
 */

import { createHash } from 'node:crypto';

import { DEMO_TENANT_ID, query } from '@/lib/db';

export interface Caller {
  tenantId: string;
  principalId: string | null;
  userId: string | null;
  displayName: string | null;
  teamName: string | null;
  /** False when Hexclave is not configured and the demo tenant was used. */
  authenticated: boolean;
}

interface HexclaveUser {
  id: string;
  primary_email?: string | null;
  display_name?: string | null;
  selected_team?: { id: string; display_name?: string | null } | null;
}

function apiBase(): string {
  return (process.env.STACK_API_URL ?? 'https://api.hexclave.com').replace(/\/$/, '');
}

export function hexclaveEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STACK_PROJECT_ID && process.env.STACK_SECRET_SERVER_KEY);
}

/**
 * Verify an access token with Hexclave.
 *
 * Verified server-side against Hexclave rather than by decoding the token here:
 * this is the check that decides whose data a batch of events becomes, so it
 * should not depend on us implementing JWT validation correctly.
 */
export async function verifyAccessToken(accessToken: string): Promise<HexclaveUser | null> {
  if (!hexclaveEnabled()) return null;

  try {
    const res = await fetch(`${apiBase()}/api/v1/users/me`, {
      headers: {
        'x-hexclave-access-type': 'server',
        'x-hexclave-project-id': process.env.NEXT_PUBLIC_STACK_PROJECT_ID as string,
        'x-hexclave-secret-server-key': process.env.STACK_SECRET_SERVER_KEY as string,
        'x-hexclave-access-token': accessToken,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as HexclaveUser;
  } catch {
    return null;
  }
}

/** Stable, non-reversible id for a Hexclave user. */
const opaqueId = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Map the Hexclave user onto rows in our schema, creating them on first sight.
 *
 * The team is the tenant. A user with no team falls back to a personal tenant so
 * an individual trying the tool is not blocked on creating an organization.
 */
export async function resolveCaller(accessToken: string | null): Promise<Caller> {
  const anonymous: Caller = {
    tenantId: DEMO_TENANT_ID,
    principalId: null,
    userId: null,
    displayName: null,
    teamName: null,
    authenticated: false,
  };

  if (!accessToken) return anonymous;

  const user = await verifyAccessToken(accessToken);
  if (!user) return anonymous;

  const team = user.selected_team;
  const tenantSlug = team ? `hexclave-team-${team.id}` : `hexclave-user-${user.id}`;
  const tenantName = team?.display_name ?? user.display_name ?? user.primary_email ?? 'Personal';

  const tenantRows = await query<{ id: string }>(
    `insert into tenant (slug, name) values ($1, $2)
     on conflict (slug) do update set name = excluded.name
     returning id`,
    [tenantSlug, tenantName],
    // The insert itself is not tenant-scoped; RLS applies to the rows we read
    // afterwards, so any tenant context is fine here.
    DEMO_TENANT_ID,
  );
  const tenantId = tenantRows?.[0]?.id;
  if (!tenantId) return anonymous;

  const principalRows = await query<{ id: string }>(
    `insert into principal (tenant_id, email_hash, display_name, department)
     values ($1, $2, $3, $4)
     on conflict (tenant_id, email_hash) do update
       set display_name = excluded.display_name,
           department   = coalesce(excluded.department, principal.department)
     returning id`,
    [
      tenantId,
      opaqueId(user.primary_email ?? user.id),
      user.display_name ?? user.primary_email ?? 'Unknown',
      team?.display_name ?? null,
    ],
    tenantId,
  );

  return {
    tenantId,
    principalId: principalRows?.[0]?.id ?? null,
    userId: user.id,
    displayName: user.display_name ?? user.primary_email ?? null,
    teamName: team?.display_name ?? null,
    authenticated: true,
  };
}

/** Pull the bearer token off a request, whichever way the client sent it. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) return header.slice(7).trim() || null;
  return req.headers.get('x-hexclave-access-token');
}
