import { NextResponse } from 'next/server';
import { allUserIds, jobDaily, jobMonthly, jobNotifications, jobWeekly } from '@/lib/services/jobs';
import { ensureDemoAccount } from '@/lib/seed/demo';
import { q } from '@/lib/db';

export const maxDuration = 300;

/**
 * Scheduled jobs for every user (see vercel.json; all times IST):
 *   all    — 00:05 daily: recurring expenses, challenges, weekly close + insights (Mondays catch up Sunday),
 *            monthly close on the 1st, demo refresh, notifications
 *   notify — 21:00 and 22:00 daily: log reminders, streak-at-risk, budget checks + overspend warnings
 *   daily | weekly | monthly — the individual parts (for pg_cron or manual runs)
 * Auth: `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set (Vercel sends it automatically);
 * without CRON_SECRET only Vercel's own cron user-agent is accepted. Every job is idempotent.
 */
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get('authorization') === `Bearer ${secret}` : (req.headers.get('user-agent') || '').includes('vercel-cron');
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { job } = await params;
  const parts: Record<string, ((id: string) => Promise<void>)[]> = {
    all: [jobDaily, jobWeekly, jobMonthly, jobNotifications],
    daily: [jobDaily],
    weekly: [jobWeekly],
    monthly: [jobMonthly],
    notify: [jobNotifications],
  };
  const fns = parts[job];
  if (!fns) return NextResponse.json({ error: 'Unknown job' }, { status: 404 });
  const started = Date.now();
  let done = 0;
  let failed = 0;
  if (job === 'all' && process.env.SEED_DEMO !== 'false') await ensureDemoAccount().catch((e) => console.error('[cron] demo', e));
  for (const id of await allUserIds()) {
    if (Date.now() - started > 270_000) break; // stay inside the function time limit; the lazy runner catches up
    try {
      for (const fn of fns) await fn(id);
      done++;
    } catch (e) {
      failed++;
      console.error(`[cron:${job}]`, id, e);
    }
  }
  await q(`delete from rate_limits where window_start < now() - interval '1 day'`).catch(() => {});
  return NextResponse.json({ job, done, failed, ms: Date.now() - started });
}
