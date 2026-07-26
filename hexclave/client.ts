import { HexclaveClientApp } from '@hexclave/next';

/**
 * Hexclave is the identity layer for the whole pipeline.
 *
 * Skillbase's schema was built multi-tenant from the start — every table carries
 * `tenant_id`, and `principal` holds the person a skill run belongs to — but
 * nothing populated them: the tenant was a hardcoded constant and every event
 * arrived anonymous, which is why department analytics read "Unassigned".
 *
 * Hexclave supplies both: a team is the tenant, a user is the principal, and its
 * CLI auth flow is what lets a terminal on someone's laptop prove who it belongs
 * to before its telemetry is accepted.
 *
 * Constructed lazily: `new HexclaveClientApp` throws without
 * `NEXT_PUBLIC_STACK_PROJECT_ID`, which used to fail `next build` on a fresh
 * clone with no `.env.local`. Every call site is gated on
 * `hexclaveConfigured()`, so nothing touches this before the env exists.
 */
let app: HexclaveClientApp | null = null;

export function getHexclaveClientApp(): HexclaveClientApp {
  app ??= new HexclaveClientApp({
    tokenStore: 'nextjs-cookie',
    urls: {
      default: {
        type: 'hosted',
      },
    },
  });
  return app;
}
