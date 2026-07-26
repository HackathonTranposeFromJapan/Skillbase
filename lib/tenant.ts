/**
 * The tenant used by the local/demo deployment.
 *
 * Lives on its own so the Next app and the plain `bun` scripts share one
 * definition — a mismatch here would show up as an empty dashboard rather than
 * an error, because row level security would simply match nothing.
 */
export const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';
