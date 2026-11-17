import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/auth';
import crypto from 'node:crypto';

export async function GET(req: Request) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const origin = appUrl(req);
  if (!id) return NextResponse.redirect(`${origin}/auth?error=google_not_configured`);
  const state = crypto.randomBytes(16).toString('hex');
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  res.cookies.set('ww_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
