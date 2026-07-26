/**
 * `skillbase login` — Hexclave CLI authentication.
 *
 * This is the piece that turns anonymous device telemetry into attributed data.
 * Until now the collector minted a salted local id and had no way to say who the
 * machine belonged to, so every event arrived without a person and the
 * department analytics the product is built on had nothing to group by.
 *
 * Hexclave's CLI flow solves the awkward part of that: a terminal cannot show a
 * login form, so it asks Hexclave for a code, sends the user to a browser, and
 * polls until they finish. The refresh token is stored locally; access tokens
 * are short-lived and minted from it on demand.
 *
 * Deliberately dependency-free like the rest of the CLI — this runs from `npx`
 * and as a hook, so it uses fetch and the documented REST endpoints rather than
 * pulling in an SDK.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { skillbaseHome } from './identity.ts';

const DEFAULT_API = 'https://api.hexclave.com';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export interface StoredAuth {
  refreshToken: string;
  userId?: string;
  displayName?: string;
  projectId: string;
  apiUrl: string;
  savedAt: string;
}

function authPath(): string {
  return join(skillbaseHome(), 'auth.json');
}

export function apiUrl(): string {
  return (process.env.HEXCLAVE_API_URL ?? process.env.STACK_API_URL ?? DEFAULT_API).replace(/\/$/, '');
}

export function projectId(): string | null {
  return (
    process.env.HEXCLAVE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_STACK_PROJECT_ID ??
    process.env.STACK_PROJECT_ID ??
    null
  );
}

export function publishableKey(): string | null {
  return (
    process.env.HEXCLAVE_PUBLISHABLE_CLIENT_KEY ??
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY ??
    process.env.STACK_PUBLISHABLE_CLIENT_KEY ??
    null
  );
}

export function readAuth(): StoredAuth | null {
  try {
    return JSON.parse(readFileSync(authPath(), 'utf8')) as StoredAuth;
  } catch {
    return null;
  }
}

export function writeAuth(auth: StoredAuth): void {
  mkdirSync(skillbaseHome(), { recursive: true });
  // 0600: this token authenticates as the user until revoked.
  writeFileSync(authPath(), JSON.stringify(auth, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function clearAuth(): boolean {
  const path = authPath();
  if (!existsSync(path)) return false;
  writeFileSync(path, '{}', 'utf8');
  return true;
}

function clientHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-hexclave-access-type': 'client',
    'x-hexclave-project-id': projectId() ?? '',
    'x-hexclave-publishable-client-key': publishableKey() ?? '',
  };
}

async function post(path: string, body: unknown, extra: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(`${apiUrl()}/api/v1${path}`, {
    method: 'POST',
    headers: { ...clientHeaders(), ...extra },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`hexclave ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export interface LoginHandle {
  loginUrl: string;
  pollingCode: string;
}

/** Step 1 — ask Hexclave for a login URL the user can open. */
export async function beginLogin(): Promise<LoginHandle> {
  const data = (await post('/auth/cli', {
    expires_in_millis: POLL_TIMEOUT_MS,
  })) as { login_code?: string; polling_code?: string; login_url?: string };

  const pollingCode = data.polling_code;
  if (!pollingCode) throw new Error('hexclave did not return a polling code');

  const loginUrl =
    data.login_url ??
    `${apiUrl()}/api/v1/auth/cli?login_code=${encodeURIComponent(data.login_code ?? '')}`;

  return { loginUrl, pollingCode };
}

/**
 * Steps 2-4 — wait for the browser half, then exchange for a refresh token.
 * Resolves to null if the user never finishes.
 */
export async function waitForLogin(handle: LoginHandle): Promise<string | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const poll = (await post('/auth/cli/poll', { polling_code: handle.pollingCode })) as {
      status?: string;
      refresh_token?: string;
    };

    // Some versions hand the token back from the poll itself; others require an
    // explicit claim. Both are handled so this does not break on either.
    if (poll.refresh_token) return poll.refresh_token;
    if (poll.status === 'expired') return null;
    if (poll.status === 'completed' || poll.status === 'success') {
      const done = (await post('/auth/cli/complete', {
        polling_code: handle.pollingCode,
      })) as { refresh_token?: string };
      return done.refresh_token ?? null;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

/** Exchange the stored refresh token for a short-lived access token. */
export async function accessToken(): Promise<string | null> {
  const auth = readAuth();
  if (!auth?.refreshToken) return null;

  try {
    const data = (await post('/auth/sessions/current/refresh', {}, {
      'x-hexclave-refresh-token': auth.refreshToken,
    })) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export interface WhoAmI {
  id: string;
  displayName: string | null;
  email: string | null;
  team: string | null;
}

export async function whoAmI(token: string): Promise<WhoAmI | null> {
  try {
    const res = await fetch(`${apiUrl()}/api/v1/users/me`, {
      headers: { ...clientHeaders(), 'x-hexclave-access-token': token },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const user = (await res.json()) as {
      id: string;
      display_name?: string | null;
      primary_email?: string | null;
      selected_team?: { display_name?: string | null } | null;
    };
    return {
      id: user.id,
      displayName: user.display_name ?? null,
      email: user.primary_email ?? null,
      team: user.selected_team?.display_name ?? null,
    };
  } catch {
    return null;
  }
}

export function hexclaveConfigured(): boolean {
  return Boolean(projectId() && publishableKey());
}
