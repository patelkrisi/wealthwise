import { q } from '../db';
import { addDays, dayOfMonth, todayIST, weekStart } from '../dates';
import { inr } from '../format';
import { callTool, hasClaude, SMART_MODEL } from '../ai/claude';
import { regretScore } from '../finance/savings';

/** Aggregated, de-identified weekly stats (no names, no notes) — this is all Claude ever sees. */
export async function weekStats(userId: string, ws: string) {
  const to = addDays(ws, 6);
  const prevWs = addDays(ws, -7);
  const cat = await q<any>(
    `select c.name category,
       coalesce(sum(e.amount_inr) filter (where e.spent_on between $2 and $3),0) this_week,
       coalesce(sum(e.amount_inr) filter (where e.spent_on between $4 and $5),0) last_week,
       coalesce(sum(e.amount_inr) filter (where e.spent_on between $2 and $3 and e.necessity='unnecessary'),0) unnecessary
     from expenses e join categories c on c.id=e.category_id
     where e.user_id=$1 and e.spent_on between $4 and $3 group by c.name`,
    [userId, ws, to, prevWs, addDays(ws, -1)],
  );
  const [t] = await q<any>(
    `select coalesce(sum(amount_inr),0) total,
       coalesce(sum(amount_inr) filter (where necessity='unnecessary'),0) unnecessary,
       coalesce(sum(amount_inr) filter (where extract(isodow from spent_on) in (6,7)),0) weekend,
       count(*)::int n,
       count(*) filter (where extract(hour from (created_at at time zone 'Asia/Kolkata')) >= 22 and necessity='unnecessary')::int late_night,
       coalesce(sum(amount_inr) filter (where payment_mode='upi'),0) upi
     from expenses where user_id=$1 and spent_on between $2 and $3`,
    [userId, ws, to],
  );
  const [lt] = await q<any>(`select coalesce(sum(amount_inr),0) total from expenses where user_id=$1 and spent_on between $2 and $3`, [userId, prevWs, addDays(ws, -1)]);
  const delivery = await q<any>(
    `select coalesce(sum(amount_inr),0) s, count(*)::int n from expenses where user_id=$1 and spent_on between $2 and $3
       and (name ilike '%swiggy%' or name ilike '%zomato%' or name ilike '%domino%' or name ilike '%eatsure%')`,
    [userId, ws, to],
  );
  return {
    week_start: ws,
    total: Math.round(t.total),
    last_week_total: Math.round(lt.total),
    unnecessary: Math.round(t.unnecessary),
    regret_score: regretScore(t.unnecessary, t.total),
    weekend_share_pct: t.total ? Math.round((t.weekend / t.total) * 100) : 0,
    expenses_logged: t.n,
    late_night_unnecessary_count: t.late_night,
    upi_share_pct: t.total ? Math.round((t.upi / t.total) * 100) : 0,
    food_delivery: { total: Math.round(delivery[0].s), orders: delivery[0].n },
    categories: cat
      .map((c: any) => ({ category: c.category, this_week: Math.round(c.this_week), last_week: Math.round(c.last_week), unnecessary: Math.round(c.unnecessary) }))
      .sort((a: any, b: any) => b.this_week - a.this_week)
      .slice(0, 6),
  };
}

export interface WeeklyInsights {
  insights: string[];
  action: string;
}

export function ruleInsights(s: Awaited<ReturnType<typeof weekStats>>): WeeklyInsights {
  const out: string[] = [];
  if (s.total === 0) return { insights: ['No spending logged this week yet.', 'Log as you go — it takes 5 seconds.', 'Mark a "No spend" day to keep your streak.'], action: 'Log your next expense right after you pay.' };
  const diff = s.total - s.last_week_total;
  if (s.last_week_total > 0) {
    out.push(
      diff <= 0
        ? `You spent **${inr(Math.abs(diff))} less** than last week (**${inr(s.total)}** vs ${inr(s.last_week_total)}).`
        : `Spending is up **${inr(diff)}** on last week — **${inr(s.total)}** in total.`,
    );
  } else out.push(`You spent **${inr(s.total)}** this week across ${s.expenses_logged} expenses.`);
  const mover = [...s.categories].sort((a, b) => Math.abs(b.this_week - b.last_week) - Math.abs(a.this_week - a.last_week))[0];
  if (mover && mover.this_week !== mover.last_week) {
    out.push(
      mover.this_week > mover.last_week
        ? `**${mover.category}** jumped to **${inr(mover.this_week)}** (from ${inr(mover.last_week)}).`
        : `**${mover.category}** dropped to **${inr(mover.this_week)}** (from ${inr(mover.last_week)}) — nice.`,
    );
  }
  if (s.food_delivery.orders >= 2) out.push(`**${s.food_delivery.orders} food-delivery orders** cost **${inr(s.food_delivery.total)}** this week.`);
  if (s.weekend_share_pct >= 45) out.push(`**${s.weekend_share_pct}%** of your spending happened on the weekend.`);
  out.push(`Your Regret score is **${s.regret_score}/100** — ${s.regret_score <= 20 ? 'healthy, very little of it was unnecessary' : s.regret_score <= 40 ? 'okay, with room to trim' : 'a lot of this week was avoidable'}.`);
  if (s.late_night_unnecessary_count >= 2) out.push(`**${s.late_night_unnecessary_count}** unnecessary buys happened after 10 pm.`);
  const topUnnec = [...s.categories].sort((a, b) => b.unnecessary - a.unnecessary)[0];
  const action =
    s.food_delivery.orders >= 3
      ? `Try the "No Swiggy Week" challenge — halving delivery saves about **${inr(Math.round(s.food_delivery.total / 2))}** a week.`
      : topUnnec && topUnnec.unnecessary > 0
        ? `Set a cap on **${topUnnec.category}** — ${inr(topUnnec.unnecessary)} of it was unnecessary this week.`
        : 'Keep it up: park any impulse buy on the cool-off list for 24 hours first.';
  return { insights: out.slice(0, 3), action };
}

export async function generateInsights(userId: string, ws: string, opts: { store?: boolean; at?: string } = {}): Promise<WeeklyInsights & { source: string }> {
  const stats = await weekStats(userId, ws);
  let result: WeeklyInsights = ruleInsights(stats);
  let source = 'rules';
  if (hasClaude() && stats.total > 0 && !opts.at) {
    try {
      const r = await callTool<WeeklyInsights>({
        model: SMART_MODEL,
        system:
          'You are Wealthwise, a friendly spending coach for Indian users. From the aggregated weekly stats, write exactly 3 short insights ' +
          '(max 22 words each) and 1 concrete action for next week. Use only the numbers given — never compute new ones except simple differences ' +
          'already implied. Format money as ₹ with Indian digit grouping and wrap key numbers in **bold**. No investment, tax or loan advice.',
        user: JSON.stringify(stats),
        tool: {
          name: 'weekly_insights',
          description: 'Return 3 insights and 1 action',
          input_schema: {
            type: 'object',
            properties: { insights: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }, action: { type: 'string' } },
            required: ['insights', 'action'],
          },
        },
        maxTokens: 500,
      });
      if (Array.isArray(r.insights) && r.insights.length && r.action) {
        result = { insights: r.insights.slice(0, 3).map(String), action: String(r.action) };
        source = 'claude';
      }
    } catch (e) {
      console.warn('[insights] Claude failed, using rules:', (e as Error).message);
    }
  }
  if (opts.store !== false) {
    await q(
      `insert into insights(user_id,week_start,content,source,created_at) values($1,$2,$3::jsonb,$4,coalesce($5::timestamptz,now()))
       on conflict(user_id,week_start) do update set content=excluded.content, source=excluded.source`,
      [userId, ws, JSON.stringify(result), source, opts.at ?? null],
    );
  }
  return { ...result, source };
}

/** Insight of the day for Home: rotates through the latest stored weekly insights. */
export async function insightOfTheDay(userId: string, today = todayIST()) {
  const [row] = await q<any>(`select week_start, content, source from insights where user_id=$1 order by week_start desc limit 1`, [userId]);
  let content: WeeklyInsights;
  let source = 'rules';
  if (row) {
    content = row.content;
    source = row.source;
  } else {
    content = ruleInsights(await weekStats(userId, weekStart(today)));
  }
  const all = [...content.insights, content.action];
  return { text: all[dayOfMonth(today) % all.length], source, all: content };
}

export async function latestInsights(userId: string) {
  return q<any>(`select week_start, content, source, created_at from insights where user_id=$1 order by week_start desc limit 6`, [userId]);
}
