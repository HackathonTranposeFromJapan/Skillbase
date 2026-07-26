import 'server-only';

import { HexclaveServerApp } from '@hexclave/next';

import { getHexclaveClientApp } from './client';

/** Hexclave is optional: without credentials the app still runs on seed data. */
export function hexclaveConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STACK_PROJECT_ID && process.env.STACK_SECRET_SERVER_KEY);
}

// Lazy for the same reason as the client app: constructing it without env
// throws, and that must not happen at module load during `next build`.
let app: HexclaveServerApp | null = null;

function getHexclaveServerApp(): HexclaveServerApp {
  app ??= new HexclaveServerApp({
    inheritsFrom: getHexclaveClientApp(),
  });
  return app;
}

/**
 * Same call surface as the old eager `export const hexclaveServerApp`, so
 * call sites (`hexclaveServerApp.getUser()` behind `hexclaveConfigured()`)
 * did not have to change.
 */
export const hexclaveServerApp = new Proxy({} as HexclaveServerApp, {
  get(_target, prop: keyof HexclaveServerApp) {
    const instance = getHexclaveServerApp();
    const value = instance[prop];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
