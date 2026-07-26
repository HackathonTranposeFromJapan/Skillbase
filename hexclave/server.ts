import 'server-only';

import { HexclaveServerApp } from '@hexclave/next';

import { hexclaveClientApp } from './client';

export const hexclaveServerApp = new HexclaveServerApp({
  inheritsFrom: hexclaveClientApp,
});

/** Hexclave is optional: without credentials the app still runs on seed data. */
export function hexclaveConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STACK_PROJECT_ID && process.env.STACK_SECRET_SERVER_KEY);
}
