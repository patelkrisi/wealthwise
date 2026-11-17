import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getOrCreateSecret, isRemoteDb, one, q } from './db';

export const SESSION_COOKIE = 'ww_session';
const MAX_AGE = 60 * 60 * 24 * 30;

let secretCache: Uint8Array | null = null;
/**
 * Session-signing secret. AUTH_SECRET if set; otherwise a random secret generated once and kept
 * in the database (hosted) or in ./.data (local), so a deploy needs no manual secret.
 */
async function secret(): Promise<Uint8Array> {
  if (secretCache) return secretCache;
  let s = process.env.AUTH_SECRET;
  if (!s && isRemoteDb()) s = await getOrCreateSecret('auth_secret', () => crypto.randomBytes(32).toString('hex'));
  if (!s) {
    const file = path.join(process.cwd(), '.data', 'auth-secret');
    try {
      s = fs.readFileSync(file, 'utf8').trim();
    } catch {
      s = crypto.randomBytes(32).toString('hex');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, s);
    }
  }
  secretCache = new TextEncoder().encode(s);
  return secretCache;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string | null) {
  if (!hash) return false;
  return bcrypt.compare(pw, hash);
}

export async function createSessionToken(userId: string, sessionVersion: number) {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(await secret());
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true' && !!(process.env.VERCEL || process.env.APP_URL?.startsWith('https')),
    path: '/',
    maxAge: MAX_AGE,
  };
}

export async function setSession(res: NextResponse, userId: string, sv: number) {
  res.cookies.set(SESSION_COOKIE, await createSessionToken(userId, sv), sessionCookieOptions());
  return res;
}

export interface SessionUser {
  id: string;
  email: string;
  is_demo: boolean;
}

export async function readSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await secret());
    const uid = payload.sub as string;
    const u = await one<{ id: string; email: string; is_demo: boolean; session_version: number }>(
      `select id,email,is_demo,session_version from users where id=$1`,
      [uid],
    );
    if (!u || u.session_version !== (payload.sv as number)) return null;
    return { id: u.id, email: u.email, is_demo: u.is_demo };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<SessionUser | null> {
  const c = await cookies();
  return readSession(c.get(SESSION_COOKIE)?.value);
}

/** For server components/pages. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect('/auth');
  return u;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wrap an API route handler: resolves the signed-in user or returns 401, and maps errors to JSON. */
export function api<C = any>(handler: (req: Request, user: SessionUser, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      const user = await currentUser();
      if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
      const out = await handler(req, user, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: any) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e?.name === 'ZodError') {
    const first = e.issues?.[0];
    return NextResponse.json({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input' }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}

export function validEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number';
  return null;
}

/** Create a user + profile + streak row. */
export async function createUser(input: { email: string; password?: string; name?: string; googleId?: string; isDemo?: boolean }) {
  const email = input.email.trim().toLowerCase();
  const hash = input.password ? await hashPassword(input.password) : null;
  const [u] = await q<{ id: string; session_version: number }>(
    `insert into users(email,password_hash,google_id,is_demo) values($1,$2,$3,$4) returning id, session_version`,
    [email, hash, input.googleId ?? null, input.isDemo ?? false],
  );
  await q(`insert into profiles(id,name,email) values($1,$2,$3)`, [u.id, input.name?.trim() || email.split('@')[0], email]);
  await q(`insert into streaks(user_id) values($1) on conflict do nothing`, [u.id]);
  return u;
}

/** Best-effort client IP (Vercel sets x-forwarded-for). */
export function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}

/**
 * Fixed-window rate limit stored in Postgres (works across serverless instances).
 * Throws 429 when `key` has been used more than `max` times in `windowSec`.
 */
export async function rateLimit(key: string, max: number, windowSec: number, message = 'Too many attempts — please wait a few minutes and try again.') {
  const [r] = await q<{ count: number }>(
    `insert into rate_limits(key, window_start, count) values($1, now(), 1)
     on conflict(key) do update set
       count = case when rate_limits.window_start < now() - ($2::text || ' seconds')::interval then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - ($2::text || ' seconds')::interval then now() else rate_limits.window_start end
     returning count`,
    [key, String(windowSec)],
  );
  if (r.count > max) throw new HttpError(429, message);
}

/** Public base URL of the app (APP_URL, else Vercel's production URL, else the request's origin). */
export function appUrl(req?: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return req ? new URL(req.url).origin : 'http://localhost:3000';
}

export function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
