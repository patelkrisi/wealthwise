// Scheduled jobs (PRD §7, all times IST). They run two ways:
//  1. /api/cron/* endpoints (Vercel Cron or Supabase pg_cron → HTTP), for every user;
//  2. lazily, per user, whenever that user opens the app — so everything works locally with no scheduler.
// Every job is idempotent (job_runs table / closed flags / notification dedupe keys).
import { q } from '../db';
import { addDays, addMonths, fmtMonth, monthEnd, monthStart, ordinal, timeIST, todayIST, weekStart } from '../dates';
import { COINS } from '../finance/coins';
import { inr } from '../format';
import { award, evaluateChallenges, getStreak, grantBadge } from './gamification';
import { notify } from './notifications';
import { closeWeek } from './savings';
import { generateInsights } from './insights';
import { runRecurring } from './resources';
import { checkBudgetAlerts } from './expenses';
import { getForecast, overspendWarnings } from './forecast';
import { displayStreak } from '../finance/streak';
import { emailConfigured, emailLayout, sendEmail, weeklyEmailHtml } from '../email';
import { appUrl } from '../auth';

async function once(userId: string, job: string, key: string, fn: () => Promise<void>) {
  const r = await q(`insert into job_runs(user_id,job,period_key) values($1,$2,$3) on conflict do nothing returning job`, [userId, job, key]);
  if (!r.length) return false;
  try {
    await fn();
  } catch (e) {
    await q(`delete from job_runs where user_id=$1 and job=$2 and period_key=$3`, [userId, job, key]);
    throw e;
  }
  return true;
}

/** Daily 00:05 — recurring expenses for today (and any missed days). */
export async function jobDaily(userId: string, today = todayIST()) {
  await runRecurring(userId, today);
  await evaluateChallenges(userId, today);
}

/** Sunday 23:00 — close every finished week that isn't closed yet (catch-up safe). */
export async function jobWeekly(userId: string, today = todayIST(), includeCurrentIfSunday = true) {
  const [u] = await q<{ created: string }>(`select (created_at at time zone 'Asia/Kolkata')::date::text created from users where id=$1`, [userId]);
  const [first] = await q<{ d: string | null }>(`select min(spent_on) d from expenses where user_id=$1`, [userId]);
  const start = weekStart(first?.d && first.d < u.created ? first.d : u.created);
  const cur = weekStart(today);
  let lastToClose = addDays(cur, -7);
  // On Sunday after 23:00 IST the current week closes too.
  if (includeCurrentIfSunday && today === addDays(cur, 6) && timeIST() >= '23:00') lastToClose = cur;
  const from = [start, addDays(cur, -7 * 8)].sort()[1];
  for (let ws = from; ws <= lastToClose; ws = addDays(ws, 7)) {
    const [row] = await q<{ closed: boolean }>(`select closed from weekly_savings where user_id=$1 and week_start=$2`, [userId, ws]);
    if (row?.closed) continue;
    const closed = await closeWeek(userId, ws);
    await once(userId, 'insights', ws, async () => {
      await generateInsights(userId, ws);
    });
    if (ws >= addDays(cur, -7)) await emailWeekly(userId, ws, closed).catch(() => {});
  }
}

/** 1st of month 06:00 — budget coins for last month, carry budgets forward, forecast, report ready. */
export async function jobMonthly(userId: string, today = todayIST()) {
  const thisMonth = monthStart(today);
  const last = addMonths(thisMonth, -1);
  const [u] = await q<{ created: string }>(`select (created_at at time zone 'Asia/Kolkata')::date::text created from users where id=$1`, [userId]);
  if (u.created >= thisMonth) return; // brand-new users have no finished month yet
  await once(userId, 'month', last.slice(0, 7), async () => {
    await closeMonth(userId, last);
    // carry last month's budgets forward if none set yet
    await q(
      `insert into budgets(user_id,category_id,month,limit_inr)
       select user_id,category_id,$2,limit_inr from budgets where user_id=$1 and month=$3
       on conflict do nothing`,
      [userId, thisMonth, last],
    );
    await getForecast(userId, addMonths(thisMonth, 1)).catch(() => {});
    await emailMonthly(userId, last).catch(() => {});
    await notify(userId, {
      kind: 'report',
      title: `📄 Your ${fmtMonth(last)} report is ready`,
      body: 'See where your money went, what you saved and the badges you earned. Review it for +30 coins.',
      link: `/reports/${last.slice(0, 7)}`,
      dedupe: `report-${last.slice(0, 7)}`,
    });
  });
}

/** Budget-kept coins (75 per category, max 5) and Budget Ninja for a finished month. */
export async function closeMonth(userId: string, month: string, at?: string) {
  const rows = await q<{ category_id: string; name: string; limit_inr: number; spent: number }>(
    `select b.category_id, c.name, b.limit_inr,
       coalesce((select sum(e.amount_inr) from expenses e where e.user_id=b.user_id and e.category_id=b.category_id and e.spent_on between $2 and $3),0) spent
     from budgets b join categories c on c.id=b.category_id where b.user_id=$1 and b.month=$2`,
    [userId, month, monthEnd(month)],
  );
  const kept = rows.filter((r) => r.spent <= r.limit_inr).sort((a, b) => b.limit_inr - a.limit_inr);
  const day = monthEnd(month);
  for (const k of kept.slice(0, COINS.BUDGET_KEPT_MAX_CATEGORIES)) {
    await award(userId, 'budget_kept', COINS.BUDGET_KEPT, { refId: `${month}-${k.category_id}`, note: `${k.name} · ${fmtMonth(month)}`, day, at });
  }
  if (rows.length && kept.length === rows.length) await grantBadge(userId, 'budget_ninja', at);
  return { kept: kept.length, total: rows.length };
}

/** Reminder / streak-at-risk (21:00) / budget check (22:00) — evaluated against the current IST time. */
export async function jobNotifications(userId: string, today = todayIST()) {
  const now = timeIST();
  const [p] = await q<{ reminder_time: string; notifications_enabled: boolean }>(`select reminder_time, notifications_enabled from profiles where id=$1`, [userId]);
  const s = await getStreak(userId);
  const loggedToday = s.last_log_date === today;
  if (!loggedToday && now >= (p.reminder_time || '21:00')) {
    await notify(userId, { kind: 'reminder', title: '📝 Time to log today', body: 'Takes 5 seconds — type or say it. Spent nothing? Mark a No-spend day.', link: '/home?add=1', dedupe: `remind-${today}` });
  }
  const disp = displayStreak(s, today);
  if (!loggedToday && disp.current > 0 && now >= '21:00') {
    await notify(userId, { kind: 'streak', title: `🔥 Your ${disp.current}-day streak is at risk`, body: 'Log one expense or mark a No-spend day before midnight.', link: '/home?add=1', dedupe: `risk-${today}` });
  }
  if (now >= '22:00') {
    await once(userId, 'budget_check', today, async () => {
      await checkBudgetAlerts(userId, today);
      for (const w of await overspendWarnings(userId)) {
        if (w.alreadyOver || !w.crossDate) continue;
        await notify(userId, {
          kind: 'overspend',
          title: `⚠️ ${w.emoji} ${w.category}: on pace to overspend`,
          body: `At this pace you'll exceed your ${w.category} budget by ${inr(w.over)} around the ${ordinal(Number(w.crossDate.slice(8, 10)))}.`,
          link: '/goals',
          dedupe: `overspend-${w.category_id}-${monthStart(today)}`,
        });
      }
    });
  }
}

async function emailTarget(userId: string) {
  if (!emailConfigured()) return null;
  const [u] = await q<{ email: string; name: string; email_summaries: boolean; is_demo: boolean }>(
    `select u.email, p.name, p.email_summaries, u.is_demo from users u join profiles p on p.id=u.id where u.id=$1`,
    [userId],
  );
  if (!u || u.is_demo || !u.email_summaries) return null;
  return u;
}

async function emailWeekly(userId: string, ws: string, row: any) {
  const u = await emailTarget(userId);
  if (!u || !row || (!row.avoidable_inr && !row.prev_avoidable_inr)) return;
  await once(userId, 'email_week', ws, async () => {
    const [next] = await q<{ target_inr: number }>(`select target_inr from weekly_savings where user_id=$1 and week_start=$2`, [userId, addDays(ws, 7)]);
    await sendEmail(
      u.email,
      row.achieved ? `You saved ${inr(row.saved_inr)} last week 🎉` : 'Your Wealthwise week is in',
      weeklyEmailHtml(u.name.split(' ')[0], { avoidable: row.avoidable_inr, prev: row.prev_avoidable_inr, target: row.target_inr, achieved: !!row.achieved, saved: row.saved_inr, next: next?.target_inr ?? 0 }, `${appUrl()}/weekly?week=${ws}`),
    );
  });
}

async function emailMonthly(userId: string, month: string) {
  const u = await emailTarget(userId);
  if (!u) return;
  const [t] = await q<{ s: number; n: number }>(`select coalesce(sum(amount_inr),0) s, count(*)::int n from expenses where user_id=$1 and spent_on between $2 and $3`, [userId, month, monthEnd(month)]);
  if (!t.n) return;
  await sendEmail(
    u.email,
    `Your ${fmtMonth(month)} report is ready`,
    emailLayout(`${fmtMonth(month)} in one look`, `You logged <b>${t.n}</b> expenses worth <b>${inr(t.s)}</b>. Your report has the category split, what was avoidable, goals, badges and a 5-line summary — and reviewing it earns 30 coins.`, { label: 'Open the report', url: `${appUrl()}/reports/${month.slice(0, 7)}` }),
  );
}

const lastRun = new Map<string, number>();
/** Run whatever is due for this user. Throttled to once a minute per user. */
export async function runDueJobs(userId: string, force = false) {
  const now = Date.now();
  if (!force && (lastRun.get(userId) ?? 0) > now - 60_000) return;
  lastRun.set(userId, now);
  const today = todayIST();
  try {
    await jobDaily(userId, today);
    await jobWeekly(userId, today);
    await jobMonthly(userId, today);
    await jobNotifications(userId, today);
  } catch (e) {
    console.error('[jobs] failed for', userId, e);
  }
}

export async function allUserIds() {
  return (await q<{ id: string }>(`select id from users`)).map((r) => r.id);
}
