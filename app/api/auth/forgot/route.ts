import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { appUrl, clientIp, errorResponse, rateLimit, sha256 } from '@/lib/auth';
import { q } from '@/lib/db';
import { emailConfigured, emailLayout, sendEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const addr = String(email || '').trim().toLowerCase();
    await rateLimit(`forgot:ip:${clientIp(req)}`, 10, 3600);
    await rateLimit(`forgot:${addr}`, 3, 3600);
    const [u] = await q<{ id: string; is_demo: boolean }>(`select id, is_demo from users where email=$1`, [addr]);
    const generic = { ok: true, message: 'If that email has an account, a reset link is on its way. Check your inbox (and spam).' };
    if (!u) return NextResponse.json(generic);
    if (u.is_demo) return NextResponse.json({ error: 'The demo account password is Demo@1234 — it can’t be reset.' }, { status: 400 });
    const token = crypto.randomBytes(24).toString('hex');
    await q(`insert into password_resets(token_hash,user_id,expires_at) values($1,$2, now() + interval '30 minutes')`, [sha256(token), u.id]);
    const link = `${appUrl(req)}/auth/reset?token=${token}`;
    if (emailConfigured()) {
      await sendEmail(addr, 'Reset your Wealthwise password', emailLayout('Reset your password', 'Tap the button to choose a new password. The link works for 30 minutes. If you didn’t ask for this, ignore this email.', { label: 'Choose a new password', url: link }));
      return NextResponse.json(generic);
    }
    // No email service configured: show the link directly (local / early testing only).
    console.log(`[forgot] reset link for ${addr}: ${link}`);
    return NextResponse.json({ ...generic, devLink: link, message: 'Email isn’t set up on this server yet, so here is your reset link.' });
  } catch (e) {
    return errorResponse(e);
  }
}
