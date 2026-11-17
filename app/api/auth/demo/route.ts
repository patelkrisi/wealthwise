import { NextResponse } from 'next/server';

export const maxDuration = 60;
import { errorResponse, setSession } from '@/lib/auth';
import { q, ready } from '@/lib/db';
import { DEMO_EMAIL, ensureDemoAccount } from '@/lib/seed/demo';

/** One-tap demo sign-in (refreshes the demo data if it is more than a day old). */
export async function POST() {
  try {
    await ready();
    await ensureDemoAccount();
    const [u] = await q<any>(`select id, session_version from users where email=$1`, [DEMO_EMAIL]);
    return setSession(NextResponse.json({ ok: true, next: '/home' }), u.id, u.session_version);
  } catch (e) {
    return errorResponse(e);
  }
}
