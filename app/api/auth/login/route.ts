import { NextResponse } from 'next/server';
import { clientIp, errorResponse, rateLimit, setSession, verifyPassword } from '@/lib/auth';
import { q } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    await rateLimit(`login:ip:${clientIp(req)}`, 30, 900);
    await rateLimit(`login:${String(email || '').trim().toLowerCase()}`, 10, 900, 'Too many login attempts for this email — wait 15 minutes or reset your password.');
    const [u] = await q<any>(
      `select u.id, u.password_hash, u.session_version, p.onboarded from users u join profiles p on p.id=u.id where u.email=$1`,
      [String(email || '').trim().toLowerCase()],
    );
    if (!u || !(await verifyPassword(String(password || ''), u.password_hash)))
      return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 });
    return setSession(NextResponse.json({ ok: true, next: u.onboarded ? '/home' : '/onboarding' }), u.id, u.session_version);
  } catch (e) {
    return errorResponse(e);
  }
}
