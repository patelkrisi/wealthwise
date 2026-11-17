import { NextResponse } from 'next/server';

export const maxDuration = 60;
import { api, HttpError, setSession } from '@/lib/auth';
import { q } from '@/lib/db';
import { DEMO_EMAIL, seedDemo } from '@/lib/seed/demo';

export const POST = api(async (_req, u) => {
  if (!u.is_demo) throw new HttpError(403, 'Only the demo account can be reset');
  await seedDemo();
  const [d] = await q<any>(`select id, session_version from users where email=$1`, [DEMO_EMAIL]);
  return setSession(NextResponse.json({ ok: true }), d.id, d.session_version);
});
