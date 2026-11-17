import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import fs from 'node:fs';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema-sql';

/**
 * Database access.
 *  - DATABASE_URL / POSTGRES_URL set -> real Postgres (Supabase in production) via postgres.js
 *  - not set                          -> embedded Postgres (PGlite) stored in ./.data/pglite, zero setup
 * Both expose the same tiny API: q(sql, params) and tx(fn).
 */

export type Q = <T = any>(text: string, params?: unknown[]) => Promise<T[]>;

interface Driver {
  q: Q;
  tx: <R>(fn: (q: Q) => Promise<R>) => Promise<R>;
  remote: boolean;
}

/** Bump when reference data (categories, merchants, badges, challenges, rewards) changes. */
export const REFERENCE_VERSION = 4;

const boot = new AsyncLocalStorage<boolean>();

type G = typeof globalThis & { __ww_db?: Promise<Driver>; __ww_ready?: Promise<void> };
const g = globalThis as G;

export function databaseUrl(): string | null {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Drop query params that some hosts add but Postgres doesn't understand (e.g. Supabase's "supa", "pgbouncer").
    for (const k of [...u.searchParams.keys()]) if (!['sslmode', 'application_name', 'options'].includes(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return raw;
  }
}

export const isRemoteDb = () => !!databaseUrl();

const REGION_NAMES: Record<string, string> = {
  'ap-south-1': 'Mumbai, India',
  'ap-northeast-2': 'Seoul, South Korea',
  'ap-southeast-1': 'Singapore',
  'ap-northeast-1': 'Tokyo, Japan',
  'ap-southeast-2': 'Sydney, Australia',
  'eu-central-1': 'Frankfurt, Germany',
  'eu-west-1': 'Ireland',
  'eu-west-2': 'London, UK',
  'us-east-1': 'North Virginia, USA',
  'us-east-2': 'Ohio, USA',
  'us-west-1': 'North California, USA',
  'ca-central-1': 'Canada',
  'sa-east-1': 'São Paulo, Brazil',
};

/** Where the database lives, read from its address: a cloud region code and a place name (for the privacy page and /api/health). */
export function databaseRegion(): { code: string | null; place: string | null } {
  let host = '';
  try {
    host = new URL(databaseUrl() || '').hostname;
  } catch {}
  const code = host.match(/aws-\d+-([a-z]{2}-[a-z]+-\d)\.pooler\.supabase\.com/)?.[1] ?? null;
  return { code, place: code ? REGION_NAMES[code] ?? code : null };
}

async function createPglite(): Promise<Driver> {
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. In Vercel open Settings → Environment Variables, add DATABASE_URL (your Supabase connection string), then redeploy.');
  }
  const { PGlite, types } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), '.data', 'pglite');
  fs.mkdirSync(dir, { recursive: true });
  const parsers = {
    [types.NUMERIC]: (v: string) => Number(v),
    [types.INT8]: (v: string) => Number(v),
    [types.DATE]: (v: string) => v,
    [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
    [types.TIMESTAMP]: (v: string) => new Date(v + 'Z').toISOString(),
  };
  const pg = await PGlite.create({ dataDir: dir, parsers });
  const q: Q = async (text, params = []) => (await pg.query(text, params as any[])).rows as any[];
  return {
    q,
    remote: false,
    tx: (fn) => pg.transaction(async (t) => fn(async (text, params = []) => (await t.query(text, params as any[])).rows as any[])),
  };
}

async function createPostgres(url: string): Promise<Driver> {
  const postgres = (await import('postgres')).default;
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false, // works with Supabase's transaction pooler (port 6543)
    max: Number(process.env.DB_POOL_MAX || 5),
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: local ? false : 'require',
    onnotice: () => {},
    types: {
      numeric: { to: 1700, from: [1700, 20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) },
      date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
      tstz: { to: 1184, from: [1184, 1114], serialize: (x: unknown) => String(x), parse: (x: string) => new Date(x).toISOString() },
      // We always pass JSON already stringified (`$1::jsonb`); don't encode it a second time.
      jsonb: { to: 3802, from: [3802, 114], serialize: (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)), parse: (x: string) => JSON.parse(x) },
      json: { to: 114, from: [], serialize: (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)), parse: (x: string) => JSON.parse(x) },
    } as any,
  });
  const run = (s: any): Q => async (text, params = []) => (await s.unsafe(text, params as any[])) as any[];
  return { q: run(sql), remote: true, tx: (fn) => sql.begin((t: any) => fn(run(t))) as any };
}

function driver(): Promise<Driver> {
  if (!g.__ww_db) {
    const url = databaseUrl();
    g.__ww_db = url ? createPostgres(url) : createPglite();
  }
  return g.__ww_db;
}

/** schema_meta values in one round trip (an empty object when the table doesn't exist yet). */
async function metaValues(d: Driver): Promise<Record<string, string>> {
  try {
    const rows = await d.q<{ key: string; value: string }>(`select key, value from schema_meta where key in ('version','ref_version')`);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

async function ensureReady(): Promise<void> {
  if (!g.__ww_ready) {
    g.__ww_ready = (async () => {
      const d = await driver();
      // Fast path (every cold start in production): a single query when nothing needs doing.
      let meta = await metaValues(d);
      if (Number(meta.version ?? 0) < SCHEMA_VERSION) {
        // Only one server instance migrates at a time (transaction-scoped advisory lock).
        await d.tx(async (t) => {
          await t(`select pg_advisory_xact_lock(727274)`);
          const [{ exists }] = await t<{ exists: boolean }>(`select to_regclass('public.schema_meta') is not null as exists`);
          const v = exists ? Number((await t<{ value: string }>(`select value from schema_meta where key='version'`))[0]?.value ?? 0) : 0;
          if (v >= SCHEMA_VERSION) return;
          for (const s of splitStatements(SCHEMA_SQL)) await t(s);
          await t(`insert into schema_meta(key,value) values('version',$1) on conflict(key) do update set value=excluded.value`, [String(SCHEMA_VERSION)]);
        });
        meta = await metaValues(d);
      }
      await boot.run(true, async () => {
        if (Number(meta.ref_version ?? 0) < REFERENCE_VERSION) {
          const { seedReferenceData } = await import('../seed/reference');
          await seedReferenceData(d.q);
          await d.q(`insert into schema_meta(key,value) values('ref_version',$1) on conflict(key) do update set value=excluded.value`, [String(REFERENCE_VERSION)]);
        }
        // Locally the demo account is created on first start. On a hosted database it is created/refreshed
        // by the demo sign-in and the daily job instead, so normal requests never wait for it.
        if (!d.remote && process.env.SEED_DEMO !== 'false') {
          const { ensureDemoAccount } = await import('../seed/demo');
          await ensureDemoAccount();
        }
      });
    })().catch((e) => {
      g.__ww_ready = undefined;
      throw e;
    });
  }
  return g.__ww_ready;
}

/** Split a multi-statement SQL script on top-level semicolons, keeping $$ … $$ blocks intact. */
function splitStatements(script: string): string[] {
  const stmts: string[] = [];
  let buf = '';
  let inDollar = false;
  for (const line of script.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) continue;
    buf += line + '\n';
    const count = (line.match(/\$\$/g) || []).length;
    if (count % 2 === 1) inDollar = !inDollar;
    if (!inDollar && trimmed.endsWith(';')) {
      stmts.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) stmts.push(buf.trim());
  return stmts;
}

/** Query helper. Ensures schema + seed on first use. */
export const q: Q = async (text, params) => {
  if (!boot.getStore()) await ready();
  const d = await driver();
  return d.q(text, params);
};

export async function tx<R>(fn: (q: Q) => Promise<R>): Promise<R> {
  if (!boot.getStore()) await ready();
  const d = await driver();
  return d.tx(fn);
}

export async function ready() {
  await ensureReady();
}

export async function one<T = any>(text: string, params?: unknown[]): Promise<T | null> {
  const r = await q<T>(text, params);
  return r[0] ?? null;
}

/** A value kept in the database (used for server secrets generated on first boot). */
export async function getOrCreateSecret(key: string, make: () => string): Promise<string> {
  const [r] = await q<{ value: string }>(`select value from schema_meta where key=$1`, [key]);
  if (r) return r.value;
  await q(`insert into schema_meta(key,value) values($1,$2) on conflict(key) do nothing`, [key, make()]);
  const [again] = await q<{ value: string }>(`select value from schema_meta where key=$1`, [key]);
  return again.value;
}

/** Drop everything (used by the reset script). */
export async function dropAll() {
  const d = await driver();
  await d.q(`drop schema public cascade`);
  await d.q(`create schema public`);
  g.__ww_ready = undefined;
}
