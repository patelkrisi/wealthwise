import { NextResponse } from 'next/server';
import { api, SESSION_COOKIE } from '@/lib/auth';
import { deleteAccount, getProfile, updateProfile } from '@/lib/services/profile';
import { HttpError } from '@/lib/auth';

export const GET = api(async (_req, u) => getProfile(u.id));
export const PATCH = api(async (req, u) => updateProfile(u.id, await req.json()));
export const DELETE = api(async (req, u) => {
  const { confirm } = await req.json().catch(() => ({}));
  if (confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm');
  if (u.is_demo) throw new HttpError(400, 'The shared demo account can’t be deleted — use "Reset demo data" instead');
  await deleteAccount(u.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
});
