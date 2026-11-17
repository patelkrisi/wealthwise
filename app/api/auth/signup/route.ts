import { NextResponse } from 'next/server';
import { appUrl, clientIp, createUser, errorResponse, passwordProblem, rateLimit, setSession, validEmail } from '@/lib/auth';
import { emailLayout, sendEmail } from '@/lib/email';
import { q } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();
    await rateLimit(`signup:ip:${clientIp(req)}`, 8, 3600);
    if (!validEmail(String(email || ''))) return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
    const prob = passwordProblem(String(password || ''));
    if (prob) return NextResponse.json({ error: prob }, { status: 400 });
    const exists = await q(`select 1 from users where email=$1`, [String(email).trim().toLowerCase()]);
    if (exists.length) return NextResponse.json({ error: 'An account with this email already exists — log in instead' }, { status: 409 });
    const u = await createUser({ email, password, name });
    sendEmail(
      String(email).trim().toLowerCase(),
      'Welcome to Wealthwise 👋',
      emailLayout(`Welcome${name ? ', ' + String(name).split(' ')[0] : ''}!`, 'Log what you spend in 5 seconds — type it, say it, or fill the form — tag whether you needed it, and watch your avoidable spend turn into savings. Install it on your phone: open the site in your browser and choose “Add to Home Screen”.', { label: 'Open Wealthwise', url: appUrl(req) + '/home' }),
    ).catch(() => {});
    return setSession(NextResponse.json({ ok: true, next: '/onboarding' }), u.id, u.session_version);
  } catch (e) {
    return errorResponse(e);
  }
}
