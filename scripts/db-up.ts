#!/usr/bin/env bun
/**
 * Bring up local Postgres and work out how to reach it.
 *
 * The reachability step exists because this repo is developed inside a
 * container with docker-outside-of-docker: `docker compose` talks to the host
 * daemon, so the published port lands on the *host* and `localhost:55432` from
 * in here connects to nothing. The database is on a bridge network this
 * container is not attached to.
 *
 * So: try localhost first (the normal laptop case), and if that fails, attach
 * the database to a network this container is already on and address it by
 * container name, which Docker's embedded DNS resolves and which survives
 * restarts in a way an IP does not.
 *
 * The resolved URL is written to `.env.local`, which Next.js loads and which is
 * gitignored.
 */

import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const ENV_FILE = join(ROOT, '.env.local');
const CONTAINER = 'skillbase-db';
const USER = 'skillbase';
const PASSWORD = 'skillbase';
const DATABASE = 'skillbase';
const HOST_PORT = 55432;

function docker(args: string[]): { ok: boolean; out: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

function canConnect(host: string, port: number, timeoutMs = 2_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitForHealthy(): Promise<boolean> {
  for (let i = 0; i < 40; i += 1) {
    const { ok } = docker(['exec', CONTAINER, 'pg_isready', '-U', USER, '-d', DATABASE]);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Networks this process's own container is attached to, if we are in one. */
function selfNetworks(): string[] {
  const { ok, out } = docker([
    'inspect',
    hostname(),
    '--format',
    '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{"\\n"}}{{end}}',
  ]);
  if (!ok) return [];
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function resolveHost(): Promise<string | null> {
  if (await canConnect('127.0.0.1', HOST_PORT)) return `127.0.0.1:${HOST_PORT}`;

  console.log('  localhost is not reachable — assuming docker-outside-of-docker');

  for (const network of selfNetworks()) {
    // Idempotent: already-connected is reported as an error we can ignore.
    docker(['network', 'connect', network, CONTAINER]);
    if (await canConnect(CONTAINER, 5432)) {
      console.log(`  attached ${CONTAINER} to ${network}`);
      return `${CONTAINER}:5432`;
    }
  }
  return null;
}

function writeEnv(url: string): void {
  const line = `DATABASE_URL=${url}`;
  let contents = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';

  contents = /^DATABASE_URL=.*$/m.test(contents)
    ? contents.replace(/^DATABASE_URL=.*$/m, line)
    : `${contents}${contents.endsWith('\n') || contents === '' ? '' : '\n'}${line}\n`;

  writeFileSync(ENV_FILE, contents, 'utf8');
}

async function main(): Promise<void> {
  console.log('starting Postgres...');
  const up = docker(['compose', 'up', '-d', 'db']);
  if (!up.ok) {
    console.error(`  docker compose failed:\n${up.out}`);
    process.exit(1);
  }

  if (!(await waitForHealthy())) {
    console.error('  database did not become ready');
    process.exit(1);
  }
  console.log('  container healthy');

  const hostPort = await resolveHost();
  if (!hostPort) {
    console.error('  could not reach the database from this environment');
    console.error(`  try: docker network connect <this-container-network> ${CONTAINER}`);
    process.exit(1);
  }

  const url = `postgres://${USER}:${PASSWORD}@${hostPort}/${DATABASE}`;
  writeEnv(url);
  console.log(`  reachable at ${hostPort}`);
  console.log(`  wrote DATABASE_URL to .env.local`);
  console.log('\nnext:  bun run db:setup');
}

void main();
