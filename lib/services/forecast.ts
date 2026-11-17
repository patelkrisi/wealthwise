import { q } from '../db';
import { addMonths, fmtMonth, monthStart, todayIST, dayOfMonth, daysInMonth } from '../dates';
import { backtest, forecastNextMonth, type ForecastResult, type MonthHistory } from '../finance/forecast';
import { inr } from '../format';
import { callTool, hasClaude, SMART_MODEL } from '../ai/claude';
import { listCategories } from './categories';
import { budgetOverview } from './resources';

/** Completed months of spend per category, oldest first, up to (not including) `beforeMonth`. */
export async function monthlyHistory(userId: string, beforeMonth: string, maxMonths = 13): Promise<MonthHistory[]> {
  const from = addMonths(beforeMonth, -maxMonths);
  const rows = await q<{ m: string; category: string; total: number }>(
    `select to_char(e.spent_on,'YYYY-MM') m, c.name as category, sum(e.amount_inr) total
     from expenses e join categories c on c.id=e.category_id
     where e.user_id=$1 and e.spent_on >= $2 and e.spent_on < $3 group by 1,2 order by 1`,
    [userId, from, beforeMonth],
  );
  if (!rows.length) return [];
  const [first] = await q<{ d: string }>(`select min(spent_on) d from expenses where user_id=$1`, [userId]);
  // a month only counts as history if the user was tracking for (most of) it
  const firstFull = first?.d && dayOfMonth(first.d) > 5 ? addMonths(monthStart(first.d), 1) : monthStart(first?.d || beforeMonth);
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (r.m + '-01' < firstFull) continue;
    const m = map.get(r.m) || {};
    m[r.category] = r.total;
    map.set(r.m, m);
  }
  return [...map.entries()].map(([m, byCategory]) => ({ month: m + '-01', byCategory })).sort((a, b) => a.month.localeCompare(b.month));
}

async function recurringByCategory(userId: string) {
  const rows = await q<{ category: string; frequency: string; amount_inr: number }>(
    `select c.name as category, r.frequency, r.amount_inr from recurring_rules r join categories c on c.id=r.category_id
     where r.user_id=$1 and r.active`,
    [userId],
  );
  const per: Record<string, number> = { daily: 30.4, weekly: 4.35, monthly: 1, yearly: 0 };
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = (out[r.category] || 0) + r.amount_inr * per[r.frequency];
  return out;
}

const explainCache = new Map<string, string>();

const forecastCache = new Map<string, any>();

export async function getForecast(userId: string, targetMonth?: string) {
  const today = todayIST();
  const month = monthStart(targetMonth ?? addMonths(today, 1));
  // Recompute only when the user's data changed (cheap signature), so Home loads don't rewrite predictions.
  const [sig] = await q<{ n: number; t: string | null; r: number }>(
    `select count(*)::int n, max(updated_at)::text t, (select count(*) from recurring_rules where user_id=$1)::int r from expenses where user_id=$1`,
    [userId],
  );
  const cacheKey = `${userId}|${month}|${today}|${sig.n}|${sig.t}|${sig.r}`;
  if (forecastCache.has(cacheKey)) return forecastCache.get(cacheKey);
  const result = await computeForecast(userId, month, today);
  if (forecastCache.size > 500) forecastCache.clear();
  forecastCache.set(cacheKey, result);
  return result;
}

async function computeForecast(userId: string, month: string, today: string): Promise<any> {
  const cats = (await listCategories(userId)).map((c) => c.name);
  const [p] = await q<any>(`select occupation, fixed_rent, fixed_emi, fixed_subscriptions from profiles where id=$1`, [userId]);
  // history = completed months before the current month
  const hist = await monthlyHistory(userId, monthStart(today));
  const base = {
    categories: cats,
    recurringMonthly: await recurringByCategory(userId),
    fixed: { rent: p?.fixed_rent ?? 0, emi: p?.fixed_emi ?? 0, subscriptions: p?.fixed_subscriptions ?? 0 },
    persona: p?.occupation === 'homemaker' ? 'homemaker' : p?.occupation === 'student' ? 'student' : 'professional',
  };
  const f = forecastNextMonth({ ...base, targetMonth: month, history: hist });

  // store predictions (one set per month, replaced on refresh)
  const catIds = new Map((await listCategories(userId)).map((c) => [c.name, c.id]));
  await q(`delete from predictions where user_id=$1 and month=$2`, [userId, month]);
  await q(
    `insert into predictions(user_id,month,category_id,predicted_inr,low_inr,high_inr,model_version,drivers) values($1,$2,null,$3,$4,$5,$6,$7::jsonb)`,
    [userId, month, f.total.predicted, f.total.low, f.total.high, f.modelVersion, JSON.stringify(f.drivers)],
  );
  for (const c of f.categories) {
    await q(
      `insert into predictions(user_id,month,category_id,predicted_inr,low_inr,high_inr,model_version) values($1,$2,$3,$4,$5,$6,$7)`,
      [userId, month, catIds.get(c.category), c.predicted, c.low, c.high, f.modelVersion],
    );
  }

  // accuracy card: what we would have predicted for last month vs what was spent
  const bt = backtest({ ...base, history: hist });
  const lastRow = bt.rows[bt.rows.length - 1] || null;

  return {
    ...f,
    monthLabel: fmtMonth(month),
    explanation: await explain(userId, f),
    accuracy: lastRow
      ? { month: lastRow.month, monthLabel: fmtMonth(lastRow.month), predicted: lastRow.predicted, actual: lastRow.actual, mape: bt.mape, months: bt.rows.length }
      : null,
    historyMonths: hist.length,
  };
}

async function explain(userId: string, f: ForecastResult): Promise<string> {
  const top = f.drivers[0];
  const fallback =
    `About ${inr(f.total.predicted)} next month, likely between ${inr(f.total.low)} and ${inr(f.total.high)}` +
    (top ? ` — ${top.category} is the biggest mover (${top.delta >= 0 ? '+' : ''}${inr(top.delta)}, ${top.reason}).` : '.');
  if (!hasClaude()) return fallback;
  const key = `${userId}:${f.month}:${f.total.predicted}`;
  if (explainCache.has(key)) return explainCache.get(key)!;
  try {
    const r = await callTool<{ sentence: string }>({
      model: SMART_MODEL,
      system:
        'Write ONE plain-language sentence (max 35 words) explaining a spending forecast for an Indian user. Use only the numbers provided, ' +
        'formatted in ₹ with Indian grouping. Do not change or recompute any number. No advice about investments, tax or loans.',
      user: JSON.stringify({ month: f.month, total: f.total, drivers: f.drivers, festivals: f.festivals }),
      tool: { name: 'explain', description: 'One-line explanation', input_schema: { type: 'object', properties: { sentence: { type: 'string' } }, required: ['sentence'] } },
      maxTokens: 150,
    });
    const s = r.sentence?.trim() || fallback;
    explainCache.set(key, s);
    return s;
  } catch {
    return fallback;
  }
}

/** "At this pace you'll exceed your Food budget by ₹1,200 on the 24th" */
export async function overspendWarnings(userId: string) {
  return warningsFrom((await budgetOverview(userId)).items);
}

/** Budgets projected to go over this month (from budgetOverview items). */
export function warningsFrom(items: any[]) {
  return items
    .filter((i: any) => i.projection && (i.projection.alreadyOver || i.projection.over > 0))
    .map((i: any) => ({
      category: i.category,
      emoji: i.emoji,
      category_id: i.category_id,
      limit: i.limit_inr,
      spent: i.spent,
      projected: i.projection.projected,
      over: i.projection.over,
      crossDate: i.projection.crossDate,
      alreadyOver: i.projection.alreadyOver,
    }));
}

/** Simple projection for the current month (Home ring). */
export function projectMonth(variableSpentSoFar: number, today: string, recurringStillDue = 0) {
  const d = dayOfMonth(today);
  const dim = daysInMonth(today);
  return Math.round(variableSpentSoFar + (variableSpentSoFar / d) * (dim - d) + recurringStillDue);
}
