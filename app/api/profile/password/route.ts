import { NextResponse } from 'next/server';
import { api, HttpError, setSession } from '@/lib/auth';
import { changePassword } from '@/lib/services/profile';

export const POST = api(async (req, u) => {
  if (u.is_demo) throw new HttpError(400, 'The demo account password can’t be changed');
  const { current, next } = await req.json();
  const sv = await changePassword(u.id, String(current || ''), String(next || ''));
  return setSession(NextResponse.json({ ok: true }), u.id, sv);
});
