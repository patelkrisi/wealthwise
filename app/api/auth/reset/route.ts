import { NextResponse } from 'next/server';
import { errorResponse, hashPassword, passwordProblem, setSession, sha256 } from '@/lib/auth';
import { q } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();
    const prob = passwordProblem(String(password || ''));
    if (prob) return NextResponse.json({ error: prob }, { status: 400 });
    const [r] = await q<{ user_id: string }>(
      `update password_resets set used=true where token_hash=$1 and not used and expires_at > now() returning user_id`,
      [sha256(String(token || ''))],
    );
    if (!r) return NextResponse.json({ error: 'This link has expired or was already used' }, { status: 400 });
    const [u] = await q<{ session_version: number }>(
      `update users set password_hash=$2, session_version=session_version+1 where id=$1 returning session_version`,
      [r.user_id, await hashPassword(password)],
    );
    return setSession(NextResponse.json({ ok: true, next: '/home' }), r.user_id, u.session_version);
  } catch (e) {
    return errorResponse(e);
  }
}
