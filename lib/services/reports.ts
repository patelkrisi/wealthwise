import { q } from '../db';
import { addMonths, fmtMonth, monthEnd, monthStart, todayIST } from '../dates';
import { inr } from '../format';
import { COINS } from '../finance/coins';
import { callTool, hasClaude, SMART_MODEL } from '../ai/claude';
import { breakdown, incomeTotal, periodTotals, dailyTrend } from './analytics';
import { budgetOverview } from './resources';
import { award } from './gamification';
import { HttpError } from '../auth';

export async function reportData(userId: string, monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new HttpError(400, 'Month must be YYYY-MM');
  const month = monthKey + '-01';
  const today = todayIST();
  if (month > monthStart(today)) throw new HttpError(400, 'That month has not started yet');
  const isCurrent = month === monthStart(today);
  const to = isCurrent ? today : monthEnd(month);
  const [p] = await q<any>(`select name, neutral_cut_pct from profiles where id=$1`, [userId]);
  const totals = await periodTotals(userId, month, to, p.neutral_cut_pct);
  const prevM = addMonths(month, -1);
  const prev = await periodTotals(userId, prevM, monthEnd(prevM), p.neutral_cut_pct);
  const income = await incomeTotal(userId, month, to);
  const cats = await breakdown(userId, month, to, 'category');
  const modes = await breakdown(userId, month, to, 'payment_mode');
  const trend = await dailyTrend(userId, month);
  const budgets = await budgetOverview(userId, month);
  const goals = await q<any>(
    `select name, icon, target_inr, saved_inr, status, completed_at from goals where user_id=$1 and (status='active' or (completed_at at time zone 'Asia/Kolkata')::date between $2 and $3)`,
    [userId, month, to],
  );
  const badges = await q<any>(
    `select b.name, b.emoji, ub.earned_at from user_badges ub join badges b on b.id=ub.badge_id
     where ub.user_id=$1 and (ub.earned_at at time zone 'Asia/Kolkata')::date between $2 and $3 order by ub.earned_at`,
    [userId, month, to],
  );
  const [coins] = await q<{ s: number }>(
    `select coalesce(sum(coins),0)::int s from coin_ledger where user_id=$1 and event_day between $2 and $3 and event_type <> 'redeem'`,
    [userId, month, to],
  );
  const weeks = await q<any>(
    `select week_start, achieved, saved_inr from weekly_savings where user_id=$1 and closed and week_start between $2 and $3 order by week_start`,
    [userId, month, to],
  );
  const [report] = await q<any>(`select * from reports where user_id=$1 and month=$2`, [userId, month]);
  const topExpenses = await q<any>(
    `select e.name, e.amount_inr, e.spent_on, e.necessity, c.name as category from expenses e left join categories c on c.id=e.category_id
     where e.user_id=$1 and e.spent_on between $2 and $3 order by e.amount_inr desc, e.spent_on desc limit 6`,
    [userId, month, to],
  );
  const [pa] = await q<any>(`select accent from profiles where id=$1`, [userId]);
  const out = {
    month,
    monthKey,
    label: fmtMonth(month),
    isCurrent,
    name: p.name,
    totals,
    prevTotals: prev,
    income,
    savings: income - totals.total,
    savingsRate: income > 0 ? Math.round(((income - totals.total) / income) * 100) : null,
    categories: cats,
    modes,
    trend,
    budgets: { kept: budgets.items.filter((i: any) => i.spent <= i.limit_inr).length, total: budgets.items.length, items: budgets.items },
    goals,
    badges,
    coinsEarned: coins.s,
    weeks: { hit: weeks.filter((w: any) => w.achieved).length, total: weeks.length, saved: weeks.reduce((s: number, w: any) => s + (w.saved_inr || 0), 0) },
    summary: (report?.summary_json?.lines as string[] | undefined) ?? null,
    reviewed: !!report?.reviewed,
    from: month,
    to,
    topExpenses,
    accent: (pa?.accent as string) || 'teal',
    autoSummary: [] as string[],
  };
  out.autoSummary = ruleSummary(out);
  return out;
}

export type ReportData = Awaited<ReturnType<typeof reportData>>;

function ruleSummary(d: ReportData): string[] {
  if (!d.totals.n) return [`No expenses were logged in ${d.label}${d.isCurrent ? ' yet' : ''}. Add a few and this report fills itself in.`];
  const top = d.categories[0];
  const change = d.prevTotals.total ? Math.round(((d.totals.total - d.prevTotals.total) / d.prevTotals.total) * 100) : null;
  return [
    `You spent ${inr(d.totals.total)} across ${d.totals.n} expenses in ${d.label}${change != null ? ` — ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on the month before` : ''}.`,
    top ? `${top.label} was your biggest category at ${inr(top.value)} (${Math.round((top.value / Math.max(1, d.totals.total)) * 100)}%).` : 'No category stood out.',
    `${inr(d.totals.unnecessary)} was tagged Unnecessary (Regret score ${d.totals.regret}/100); avoidable spend came to ${inr(d.totals.avoidable)}.`,
    d.income > 0
      ? d.savings >= 0
        ? `With ${inr(d.income)} coming in, you kept ${inr(d.savings)} (${d.savingsRate}% savings rate).`
        : `You spent ${inr(-d.savings)} more than the ${inr(d.income)} of income you logged.`
      : 'Log your income to see how much you kept.',
    `You hit your weekly savings target ${d.weeks.hit} of ${d.weeks.total} weeks, kept ${d.budgets.kept} of ${d.budgets.total} budgets and earned ${Number(d.coinsEarned).toLocaleString('en-IN')} coins${d.badges.length ? ` and ${d.badges.length} badge${d.badges.length > 1 ? 's' : ''}` : ''}.`,
  ];
}

/** Generate (or refresh) the 5-line summary; reviewing a finished month once earns +30 coins. */
export async function generateReport(userId: string, monthKey: string, opts: { review?: boolean } = {}) {
  const d = await reportData(userId, monthKey);
  let lines = ruleSummary(d);
  let source = 'rules';
  if (hasClaude() && d.totals.n > 0) {
    try {
      const r = await callTool<{ lines: string[] }>({
        model: SMART_MODEL,
        system:
          'Write a 5-line plain-language monthly spending summary for an Indian personal-finance app user. One sentence per line, max 28 words each. ' +
          'Use ONLY the numbers provided (₹ with Indian grouping); do not compute new numbers. Encouraging, honest, no investment/tax/loan advice.',
        user: JSON.stringify({
          month: d.label,
          total: d.totals.total, expenses: d.totals.n, unnecessary: d.totals.unnecessary, avoidable: d.totals.avoidable, regret_score: d.totals.regret,
          previous_month_total: d.prevTotals.total, income: d.income, kept: d.savings, savings_rate_pct: d.savingsRate,
          top_categories: d.categories.slice(0, 4).map((c: any) => ({ c: c.label, v: Math.round(c.value) })),
          weekly_targets_hit: `${d.weeks.hit}/${d.weeks.total}`, budgets_kept: `${d.budgets.kept}/${d.budgets.total}`, coins: d.coinsEarned, badges: d.badges.map((b: any) => b.name),
        }),
        tool: { name: 'summary', description: '5 summary lines', input_schema: { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 } }, required: ['lines'] } },
        maxTokens: 600,
      });
      if (r.lines?.length) {
        lines = r.lines.slice(0, 5).map(String);
        source = 'claude';
      }
    } catch (e) {
      console.warn('[report] Claude failed:', (e as Error).message);
    }
  }
  await q(
    `insert into reports(user_id,month,summary_json,pdf_url) values($1,$2,$3::jsonb,$4)
     on conflict(user_id,month) do update set summary_json=excluded.summary_json`,
    [userId, d.month, JSON.stringify({ lines, source }), `/api/reports/${monthKey}/pdf`],
  );
  let coins = 0;
  if (opts.review && !d.isCurrent) {
    const [r] = await q<{ reviewed: boolean }>(`select reviewed from reports where user_id=$1 and month=$2`, [userId, d.month]);
    if (!r.reviewed) {
      await q(`update reports set reviewed=true where user_id=$1 and month=$2`, [userId, d.month]);
      const got = await q(`select 1 from coin_ledger where user_id=$1 and event_type='monthly_report' and ref_id=$2`, [userId, monthKey]);
      if (!got.length) {
        await award(userId, 'monthly_report', COINS.MONTHLY_REPORT, { refId: monthKey, note: d.label });
        coins = COINS.MONTHLY_REPORT;
      }
    }
  }
  return { lines, source, coins };
}

export async function availableMonths(userId: string) {
  const rows = await q<{ m: string }>(`select distinct to_char(spent_on,'YYYY-MM') m from expenses where user_id=$1 order by 1 desc limit 24`, [userId]);
  return rows.map((r) => ({ key: r.m, label: fmtMonth(r.m + '-01') }));
}
