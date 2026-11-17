import { NextResponse } from 'next/server';
import { clientIp, rateLimit } from '@/lib/auth';

/** Browser-side crashes are logged here so they show up in the hosting logs (Vercel → Logs). Nothing is stored. */
export async function POST(req: Request) {
  try {
    await rateLimit(`client-error:${clientIp(req)}`, 20, 3600, 'Too many reports');
    const body = await req.json().catch(() => ({}));
    console.error('[client-error]', JSON.stringify({ path: String(body.path || '').slice(0, 200), message: String(body.message || '').slice(0, 500), stack: String(body.stack || '').slice(0, 1500), digest: body.digest ?? null, ua: (req.headers.get('user-agent') || '').slice(0, 200) }));
  } catch {}
  return NextResponse.json({ ok: true });
}
