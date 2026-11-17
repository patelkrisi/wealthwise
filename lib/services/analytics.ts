import { q } from '../db';
import { addDays, addMonths, eachDay, fmtMonth, monthEnd, monthStart, todayIST, weekStart, weekday } from '../dates';
import { avoidableSpend, regretScore } from '../finance/savings';

export interface Range {
  from: string;
  to: string;
  label: string;
}

/** Resolve a named period (as used by the chatbot tools and the UI) to an IST date range. */
export function periodRange(period: string, today = todayIST()): Range {
  const p = (period || 'this_month').toLowerCase().replace(/\s+/g, '_');
  const ws = weekStart(today);
  const ms = monthStart(today);
  switch (p) {
    case 'today':
      return { from: today, to: today, label: 'today' };
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1), label: 'yesterday' };
    case 'this_week':
    case 'week':
      return { from: ws, to: today, label: 'this week' };
    case 'last_week':
      return { from: addDays(ws, -7), to: addDays(ws, -1), label: 'last week' };
    case 'last_7_days':
      return { from: addDays(today, -6), to: today, label: 'the last 7 days' };
    case 'last_30_days':
      return { from: addDays(today, -29), to: today, label: 'the last 30 days' };
    case 'last_month':
    case 'previous_month':
      return { from: addMonths(ms, -1), to: addDays(ms, -1), label: fmtMonth(addMonths(ms, -1)) };
    case 'last_3_months':
      return { from: addMonths(ms, -3), to: addDays(ms, -1), label: 'the last 3 months' };
    case 'this_year':
    case 'year':
      return { from: today.slice(0, 4) + '-01-01', to: today, label: 'this year' };
    case 'this_month':
    case 'month':
      return { from: ms, to: today, label: 'this month' };
    default: {
      const nDays = p.match(/^last_(\d{1,3})_days$/);
      if (nDays) {
        const n = Math.max(1, Math.min(366, Number(nDays[1])));
        return { from: addDays(today, -(n - 1)), to: today, label: `the last ${n} days` };
      }
      if (/^\d{4}$/.test(p)) {
        return { from: p + '-01-01', to: p === today.slice(0, 4) ? today : p + '-12-31', label: p === today.slice(0, 4) ? 'this year' : p };
      }
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(p)) {
        const m = monthStart(p.length === 7 ? p + '-01' : p);
        return { from: m, to: m === ms ? today : monthEnd(m), label: fmtMonth(m) };
      }
      return { from: ms, to: today, label: 'this month' };
    }
  }
}

export async function periodTotals(userId: string, from: string, to: string, neutralCutPct = 25) {
  const [r] = await q<any>(
    `select coalesce(sum(amount_inr),0) total, count(*)::int n,
       coalesce(sum(amount_inr) filter (where necessity='necessary'),0) necessary,
       coalesce(sum(amount_inr) filter (where necessity='neutral'),0) neutral,
       coalesce(sum(amount_inr) filter (where necessity='unnecessary'),0) unnecessary
     from expenses where user_id=$1 and spent_on between $2 and $3`,
    [userId, from, to],
  );
  return {
    ...r,
    avoidable: avoidableSpend(r.unnecessary, r.neutral, neutralCutPct),
    regret: regretScore(r.unnecessary, r.total),
  };
}

export async function incomeTotal(userId: string, from: string, to: string) {
  const [r] = await q<{ s: number }>(`select coalesce(sum(amount_inr),0) s from income where user_id=$1 and received_on between $2 and $3`, [userId, from, to]);
  return r.s;
}

export type BreakdownBy = 'category' | 'necessity' | 'payment_mode' | 'day' | 'mood' | 'weekday';

export async function breakdown(userId: string, from: string, to: string, by: BreakdownBy, opts: { excludeRecurring?: boolean } = {}) {
  if (by === 'category') {
    return q<any>(
      `select c.id, c.name as label, c.emoji, c.colour, sum(e.amount_inr) value, count(*)::int n,
         coalesce(sum(e.amount_inr) filter (where e.necessity='unnecessary'),0) unnecessary
       from expenses e join categories c on c.id=e.category_id where e.user_id=$1 and e.spent_on between $2 and $3
       group by c.id, c.name, c.emoji, c.colour order by value desc`,
      [userId, from, to],
    );
  }
  if (by === 'day') {
    const rows = await q<{ label: string; value: number }>(
      `select spent_on as label, sum(amount_inr) value from expenses where user_id=$1 and spent_on between $2 and $3 ${opts.excludeRecurring ? 'and not is_recurring' : ''} group by spent_on`,
      [userId, from, to],
    );
    const m = new Map(rows.map((r) => [r.label, r.value]));
    return eachDay(from, to).map((d) => ({ label: d, value: m.get(d) ?? 0 }));
  }
  if (by === 'weekday') {
    const rows = await breakdown(userId, from, to, 'day', { excludeRecurring: true });
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sums = Array(7).fill(0);
    const counts = Array(7).fill(0);
    for (const r of rows) {
      sums[weekday(r.label)] += r.value;
      counts[weekday(r.label)] += 1;
    }
    return [1, 2, 3, 4, 5, 6, 0].map((i) => ({ label: names[i], value: Math.round(counts[i] ? sums[i] / counts[i] : 0) }));
  }
  const col = by === 'necessity' ? 'necessity' : by === 'payment_mode' ? 'payment_mode' : 'mood';
  return q<any>(
    `select coalesce(${col}::text,'untagged') as label, sum(amount_inr) value, count(*)::int n
     from expenses where user_id=$1 and spent_on between $2 and $3 ${by === 'mood' ? 'and mood is not null' : ''}
     group by 1 order by value desc`,
    [userId, from, to],
  );
}

export async function monthOverMonth(userId: string, months = 6, today = todayIST()) {
  const start = addMonths(monthStart(today), -(months - 1));
  const rows = await q<any>(
    `select to_char(spent_on,'YYYY-MM') m, sum(amount_inr) total,
       coalesce(sum(amount_inr) filter (where necessity='necessary'),0) necessary,
       coalesce(sum(amount_inr) filter (where necessity='neutral'),0) neutral,
       coalesce(sum(amount_inr) filter (where necessity='unnecessary'),0) unnecessary
     from expenses where user_id=$1 and spent_on >= $2 and spent_on <= $3 group by 1 order by 1`,
    [userId, start, today],
  );
  const inc = await q<any>(
    `select to_char(received_on,'YYYY-MM') m, sum(amount_inr) total from income where user_id=$1 and received_on >= $2 group by 1`,
    [userId, start],
  );
  const im = new Map(inc.map((r: any) => [r.m, r.total]));
  const map = new Map(rows.map((r: any) => [r.m, r]));
  const out = [];
  for (let i = 0; i < months; i++) {
    const m = addMonths(start, i).slice(0, 7);
    const r: any = map.get(m) || { total: 0, necessary: 0, neutral: 0, unnecessary: 0 };
    out.push({ month: m, label: fmtMonth(m + '-01', false), total: r.total, necessary: r.necessary, neutral: r.neutral, unnecessary: r.unnecessary, income: im.get(m) ?? 0 });
  }
  return out;
}

export async function heatmap(userId: string, days = 120, today = todayIST()) {
  // start on a Monday so the grid lines up
  const from = weekStart(addDays(today, -days + 1));
  const rows = await breakdown(userId, from, today, 'day', { excludeRecurring: true });
  const values = rows.map((r) => r.value).filter((v) => v > 0).sort((a, b) => a - b);
  const qv = (p: number) => (values.length ? values[Math.floor((values.length - 1) * p)] : 0);
  const thresholds = [qv(0.25), qv(0.5), qv(0.75), qv(0.92)];
  const [p] = await q<{ payday: number | null }>(`select payday from profiles where id=$1`, [userId]);
  return {
    from,
    to: today,
    thresholds,
    days: rows.map((r) => ({
      day: r.label,
      value: r.value,
      level: r.value <= 0 ? 0 : r.value <= thresholds[0] ? 1 : r.value <= thresholds[1] ? 2 : r.value <= thresholds[2] ? 3 : 4,
      weekend: [0, 6].includes(weekday(r.label)),
      payday: !!p?.payday && Number(r.label.slice(8, 10)) === p.payday,
    })),
  };
}

export async function regretWeekly(userId: string, weeks = 8, today = todayIST()) {
  const ws = weekStart(today);
  const from = addDays(ws, -7 * (weeks - 1));
  const rows = await q<any>(
    `select date_trunc('week', spent_on::timestamp)::date w, sum(amount_inr) total,
       coalesce(sum(amount_inr) filter (where necessity='unnecessary'),0) unnecessary
     from expenses where user_id=$1 and spent_on >= $2 group by 1 order by 1`,
    [userId, from],
  );
  const map = new Map(rows.map((r: any) => [r.w, r]));
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const w = addDays(from, 7 * i);
    const r: any = map.get(w) || { total: 0, unnecessary: 0 };
    out.push({ week: w, total: r.total, unnecessary: r.unnecessary, score: regretScore(r.unnecessary, r.total), current: w === ws });
  }
  return out;
}

const MICRO = ['chai', 'tea', 'coffee', 'auto', 'rickshaw', 'samosa', 'cigarette', 'paan', 'maggi', 'juice', 'snacks', 'chaayos', 'chai point'];
export async function microSpend(userId: string, today = todayIST()) {
  const from = addDays(today, -29);
  const rows = await q<any>(
    `select name, amount_inr from expenses where user_id=$1 and spent_on between $2 and $3 and amount_inr <= 300`,
    [userId, from, today],
  );
  const groups: Record<string, { total: number; n: number }> = {};
  for (const r of rows) {
    const n = ` ${r.name.toLowerCase()} `;
    const k = MICRO.find((m) => n.includes(` ${m}`));
    if (!k) continue;
    const key = ['tea', 'chai point', 'chaayos'].includes(k) ? 'chai' : k === 'rickshaw' ? 'auto' : k;
    groups[key] = groups[key] || { total: 0, n: 0 };
    groups[key].total += r.amount_inr;
    groups[key].n += 1;
  }
  const items = Object.entries(groups)
    .map(([k, v]) => ({ item: k, total: Math.round(v.total), count: v.n, yearly: Math.round(v.total * 12.17) }))
    .sort((a, b) => b.total - a.total);
  return { items, total: items.reduce((s, i) => s + i.total, 0) };
}

export async function moodPattern(userId: string, today = todayIST()) {
  return q<any>(
    `select mood, count(*)::int n, sum(amount_inr) total, coalesce(sum(amount_inr) filter (where necessity='unnecessary'),0) unnecessary
     from expenses where user_id=$1 and mood is not null and spent_on >= $2 group by mood order by total desc`,
    [userId, addDays(today, -89)],
  );
}

export async function dailyTrend(userId: string, month = monthStart(todayIST())) {
  const today = todayIST();
  const to = month === monthStart(today) ? today : monthEnd(month);
  const days = await breakdown(userId, month, to, 'day');
  const prevM = addMonths(month, -1);
  const prev = await breakdown(userId, prevM, monthEnd(prevM), 'day');
  let cum = 0;
  let pcum = 0;
  const n = Math.max(days.length, prev.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (days[i]) cum += days[i].value;
    if (prev[i]) pcum += prev[i].value;
    out.push({ day: i + 1, value: days[i]?.value ?? null, cumulative: days[i] ? Math.round(cum) : null, prevCumulative: prev[i] ? Math.round(pcum) : null });
  }
  return out;
}
