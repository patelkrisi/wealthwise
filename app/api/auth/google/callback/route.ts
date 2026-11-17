import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/auth';
import { cookies } from 'next/headers';
import { createUser, setSession } from '@/lib/auth';
import { q } from '@/lib/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = appUrl(req);
  const fail = (m: string) => NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(m)}`);
  try {
    const c = await cookies();
    if (!url.searchParams.get('state') || url.searchParams.get('state') !== c.get('ww_oauth_state')?.value) return fail('google_state');
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code') || '',
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    }).then((r) => r.json());
    if (!tok.access_token) return fail('google_token');
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
    if (!info.email || !info.email_verified) return fail('google_email');
    const email = String(info.email).toLowerCase();
    let [u] = await q<any>(`select u.id, u.session_version, p.onboarded from users u join profiles p on p.id=u.id where u.google_id=$1 or u.email=$2`, [info.sub, email]);
    if (u) await q(`update users set google_id=$2 where id=$1 and google_id is null`, [u.id, info.sub]);
    else {
      const created = await createUser({ email, name: info.name, googleId: info.sub });
      u = { ...created, onboarded: false };
    }
    const res = NextResponse.redirect(`${origin}${u.onboarded ? '/home' : '/onboarding'}`);
    res.cookies.set('ww_oauth_state', '', { path: '/', maxAge: 0 });
    return setSession(res, u.id, u.session_version);
  } catch (e) {
    console.error(e);
    return fail('google_failed');
  }
}
