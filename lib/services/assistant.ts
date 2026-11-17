// "Ask Wealthwise" (PRD §5.6). Claude Sonnet answers using read-only tools; every number comes from a tool.
// Without an API key, a deterministic intent engine answers using the very same tools.
import { q } from '../db';
import { HttpError, rateLimit } from '../auth';
import { claude, hasClaude, SMART_MODEL, useAiBudget } from '../ai/claude';
import { addMonths, fmtMonth, monthStart, todayIST, addDays, dayOfMonth, weekStart, ordinal } from '../dates';
import { candidateKeywords, detectPeriod, onWhat, when } from '../ai/question';
import { inr, NECESSITY_LABELS, PAYMENT_LABELS } from '../format';
import { findAmounts } from '../ai/hinglish';
import { simulateCut } from '../finance/savings';
import { breakdown, periodRange, periodTotals, incomeTotal, type BreakdownBy } from './analytics';
import { budgetOverview, listGoals, listRecurring } from './resources';
import { getForecast } from './forecast';
import { listCategories } from './categories';

const FOOD_DELIVERY = ['swiggy', 'zomato', 'domino', 'eatsure', 'faasos', 'box8', 'behrouz', 'pizza hut', 'kfc', 'mcdonald'];
const CABS = ['ola', 'uber', 'rapido', 'blusmart', 'cab', 'taxi'];


// ---------------- tools ----------------
type Json = Record<string, any>;

async function catId(userId: string, name?: string | null) {
  if (!name) return null;
  const cats = await listCategories(userId);
  const n = name.toLowerCase();
  return cats.find((c) => c.name.toLowerCase() === n) || cats.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase().split(' ')[0])) || null;
}

export const tools = {
  async get_spend(userId: string, a: Json) {
    const r = periodRange(a.period || 'this_month');
    const where = ['e.user_id=$1', 'e.spent_on between $2 and $3'];
    const params: unknown[] = [userId, r.from, r.to];
    let catLabel: string | null = null;
    if (a.category) {
      const c = await catId(userId, a.category);
      if (c) {
        params.push(c.id);
        where.push(`e.category_id=$${params.length}`);
        catLabel = c.name;
      }
    }
    if (a.necessity) {
      params.push(a.necessity);
      where.push(`e.necessity=$${params.length}::necessity`);
    }
    if (a.payment_mode) {
      params.push(a.payment_mode);
      where.push(`e.payment_mode=$${params.length}::payment_mode`);
    }
    if (a.search) {
      const named = a.search === 'food_delivery' ? FOOD_DELIVERY : a.search === 'cabs' ? CABS : null;
      const ors = named
        ? named.map((k) => {
            params.push(`%${k}%`);
            return `e.name ilike $${params.length}`;
          })
        : [String(a.search).toLowerCase()].map((k) => {
            params.push('\\m' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            return `e.name ~* $${params.length}`;
          });
      where.push(`(${ors.join(' or ')})`);
    }
    const [row] = await q<{ total: number; n: number }>(`select coalesce(sum(e.amount_inr),0) total, count(*)::int n from expenses e where ${where.join(' and ')}`, params);
    return { period: r.label, from: r.from, to: r.to, category: catLabel, necessity: a.necessity ?? null, payment_mode: a.payment_mode ?? null, search: a.search ?? null, total_inr: Math.round(row.total), count: row.n };
  },
  async get_breakdown(userId: string, a: Json) {
    const r = periodRange(a.period || 'this_month');
    const by = (['category', 'necessity', 'payment_mode', 'day'].includes(a.by) ? a.by : 'category') as BreakdownBy;
    const rows = await breakdown(userId, r.from, r.to, by);
    const total = rows.reduce((s: number, x: any) => s + x.value, 0);
    return {
      period: r.label,
      by,
      total_inr: Math.round(total),
      items: rows.filter((x: any) => x.value > 0).slice(0, by === 'day' ? 31 : 12).map((x: any) => ({
        label: by === 'necessity' ? NECESSITY_LABELS[x.label as keyof typeof NECESSITY_LABELS] ?? x.label : by === 'payment_mode' ? PAYMENT_LABELS[x.label as keyof typeof PAYMENT_LABELS] ?? x.label : x.label,
        emoji: x.emoji,
        value_inr: Math.round(x.value),
        share_pct: total ? Math.round((x.value / total) * 100) : 0,
      })),
    };
  },
  async compare_periods(userId: string, a: Json) {
    const ra = periodRange(a.period_a || 'this_month');
    const rb = periodRange(a.period_b || 'last_month');
    const ta = await periodTotals(userId, ra.from, ra.to);
    const tb = await periodTotals(userId, rb.from, rb.to);
    // like-for-like: same number of days into the earlier period
    const days = Math.round((Date.parse(ra.to) - Date.parse(ra.from)) / 86400000);
    const sameTo = addDays(rb.from, days) < rb.to ? addDays(rb.from, days) : rb.to;
    const tbSame = await periodTotals(userId, rb.from, sameTo);
    const ca = await breakdown(userId, ra.from, ra.to, 'category');
    const cb = await breakdown(userId, rb.from, sameTo, 'category');
    const mb = new Map(cb.map((x: any) => [x.label, x.value]));
    const changes = ca
      .map((x: any) => ({ category: x.label, a_inr: Math.round(x.value), b_same_days_inr: Math.round(mb.get(x.label) ?? 0), change_inr: Math.round(x.value - (mb.get(x.label) ?? 0)) }))
      .sort((x: any, y: any) => Math.abs(y.change_inr) - Math.abs(x.change_inr))
      .slice(0, 4);
    return {
      a: { label: ra.label, total_inr: Math.round(ta.total), unnecessary_inr: Math.round(ta.unnecessary), days: days + 1 },
      b: { label: rb.label, total_inr: Math.round(tb.total), same_days_total_inr: Math.round(tbSame.total), unnecessary_same_days_inr: Math.round(tbSame.unnecessary) },
      change_vs_same_days_inr: Math.round(ta.total - tbSame.total),
      change_vs_same_days_pct: tbSame.total ? Math.round(((ta.total - tbSame.total) / tbSame.total) * 100) : null,
      biggest_category_changes: changes,
    };
  },
  async get_budget_status(userId: string, a: Json) {
    const m = a.month && /^\d{4}-\d{2}/.test(a.month) ? monthStart(a.month.slice(0, 7) + '-01') : monthStart(todayIST());
    const b = await budgetOverview(userId, m);
    return {
      month: fmtMonth(m),
      items: b.items.map((i: any) => ({
        category: i.category,
        limit_inr: Math.round(i.limit_inr),
        spent_inr: Math.round(i.spent),
        pct_used: Math.round(i.pct),
        remaining_inr: Math.round(i.remaining),
        projected_month_end_inr: i.projection?.projected ?? null,
        on_pace_to_cross_on: i.projection?.crossDate ?? null,
      })),
    };
  },
  async get_goals(userId: string) {
    const g = await listGoals(userId);
    return {
      goals: g.map((x: any) => ({ name: x.name, target_inr: x.target_inr, saved_inr: x.saved_inr, pct: Math.round(x.pct), deadline: x.deadline, status: x.status, weeks_left: x.weeksLeft, needed_per_week_inr: x.neededPerWeek })),
    };
  },
  async get_forecast(userId: string, a: Json) {
    const m = a.month && /^\d{4}-\d{2}/.test(a.month) ? monthStart(a.month.slice(0, 7) + '-01') : addMonths(monthStart(todayIST()), 1);
    const f = await getForecast(userId, m);
    return {
      month: f.monthLabel,
      predicted_total_inr: f.total.predicted,
      likely_low_inr: f.total.low,
      likely_high_inr: f.total.high,
      method: f.method,
      top_categories: f.categories.slice(0, 6).map((c: any) => ({ category: c.category, predicted_inr: c.predicted, low_inr: c.low, high_inr: c.high })),
      drivers: f.drivers,
      festivals: f.festivals,
    };
  },
  async get_recurring(userId: string) {
    const r = await listRecurring(userId);
    return {
      monthly_total_inr: r.monthlyTotal,
      rules: r.rules.filter((x: any) => x.active).map((x: any) => ({ name: x.name, amount_inr: x.amount_inr, frequency: x.frequency, category: x.category, next_run: x.next_run })),
    };
  },
  async simulate_cut(userId: string, a: Json) {
    const today = todayIST();
    const from = addDays(today, -27);
    const target = String(a.target || 'unnecessary');
    const pct = Math.max(1, Math.min(100, Number(a.pct) || 50));
    let base: { total: number };
    let label = target;
    if (['unnecessary', 'neutral', 'necessary'].includes(target.toLowerCase())) {
      [base] = await q(`select coalesce(sum(amount_inr),0) total from expenses where user_id=$1 and spent_on between $2 and $3 and necessity=$4::necessity`, [userId, from, today, target.toLowerCase()]);
      label = `${NECESSITY_LABELS[target.toLowerCase() as 'unnecessary']} spend`;
    } else if (target.toLowerCase().includes('delivery')) {
      const r = await tools.get_spend(userId, { period: 'last_30_days', search: 'food_delivery' });
      base = { total: r.total_inr * (28 / 30) };
      label = 'food delivery';
    } else {
      const c = await catId(userId, target);
      [base] = await q(`select coalesce(sum(amount_inr),0) total from expenses where user_id=$1 and spent_on between $2 and $3 and category_id=$4`, [userId, from, today, c?.id ?? null]);
      label = c?.name ?? target;
    }
    const weekly = base.total / 4;
    const s = simulateCut(weekly, pct);
    return { target: label, cut_pct: pct, current_weekly_inr: Math.round(weekly), saves_per_week_inr: s.week, saves_per_month_inr: s.month, saves_per_year_inr: s.year, based_on: 'your last 4 weeks' };
  },
  async check_affordability(userId: string, a: Json) {
    const amount = Number(a.amount) || 0;
    const m = a.month && /^\d{4}-\d{2}/.test(a.month) ? monthStart(a.month.slice(0, 7) + '-01') : addMonths(monthStart(todayIST()), 1);
    const f = await getForecast(userId, m);
    const today = todayIST();
    const inc3 = await incomeTotal(userId, addMonths(monthStart(today), -3), addDays(monthStart(today), -1));
    const [p] = await q<any>(`select monthly_income from profiles where id=$1`, [userId]);
    const income = inc3 > 0 ? Math.round(inc3 / 3) : Math.round(p?.monthly_income || 0);
    const goals = await listGoals(userId);
    const goalNeeds = Math.round(goals.filter((g: any) => g.status === 'active' && g.neededPerWeek).reduce((s: number, g: any) => s + g.neededPerWeek * 4.35, 0));
    const headroom = income - f.total.predicted - goalNeeds;
    const headroomHigh = income - f.total.high - goalNeeds;
    let verdict: 'yes' | 'tight' | 'no';
    if (!income) verdict = 'tight';
    else if (amount <= headroomHigh) verdict = 'yes';
    else if (amount <= headroom) verdict = 'tight';
    else verdict = 'no';
    return {
      amount_inr: amount,
      month: f.monthLabel,
      expected_income_inr: income,
      forecast_spend_inr: f.total.predicted,
      forecast_spend_high_inr: f.total.high,
      goal_contributions_needed_inr: goalNeeds,
      headroom_inr: headroom,
      verdict,
      reasons: [
        income ? `Expected income about ${inr(income)} (average of recent months)` : 'No income recorded — add income for a better answer',
        `Forecast spend ${inr(f.total.predicted)} (up to ${inr(f.total.high)})`,
        goalNeeds ? `Goal savings needed ${inr(goalNeeds)} a month` : 'No goal contributions due',
      ],
    };
  },
};

export type ToolName = keyof typeof tools;

const TOOL_DEFS = [
  {
    name: 'get_spend',
    description: 'Total ₹ spent and number of expenses for a period, optionally filtered. Use search="food_delivery" for Swiggy/Zomato-style orders, "cabs" for Ola/Uber/Rapido.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'today | yesterday | this_week | last_week | last_7_days | this_month | last_month | last_30_days | last_3_months | this_year | YYYY-MM' },
        category: { type: 'string' },
        necessity: { type: 'string', enum: ['necessary', 'neutral', 'unnecessary'] },
        payment_mode: { type: 'string', enum: ['cash', 'upi', 'credit_card', 'debit_card', 'cheque', 'netbanking'] },
        search: { type: 'string', description: 'food_delivery | cabs | any merchant keyword' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_breakdown',
    description: 'Totals grouped by category, necessity, payment_mode or day for a period, with share %.',
    input_schema: { type: 'object', properties: { period: { type: 'string' }, by: { type: 'string', enum: ['category', 'necessity', 'payment_mode', 'day'] } }, required: ['period', 'by'] },
  },
  {
    name: 'compare_periods',
    description: 'Compare two periods: totals, like-for-like (same number of days) change in ₹ and %, biggest category changes.',
    input_schema: { type: 'object', properties: { period_a: { type: 'string' }, period_b: { type: 'string' } }, required: ['period_a', 'period_b'] },
  },
  { name: 'get_budget_status', description: "Each budget's limit, spent, % used and month-end projection.", input_schema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM, default current month' } } } },
  { name: 'get_goals', description: 'Savings goals with target, saved, deadline and ₹ needed per week.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_forecast', description: 'Predicted spend total and per category with an 80% range for a month (default next month).', input_schema: { type: 'object', properties: { month: { type: 'string' } } } },
  { name: 'get_recurring', description: 'Recurring payments (rent, SIPs, subscriptions) and their monthly total.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'simulate_cut',
    description: 'What-if: savings per week/month/year from cutting a category, a necessity level (e.g. "unnecessary") or "food delivery" by pct%.',
    input_schema: { type: 'object', properties: { target: { type: 'string' }, pct: { type: 'number' }, horizon: { type: 'string', enum: ['week', 'month', 'year'] } }, required: ['target', 'pct'] },
  },
  {
    name: 'check_affordability',
    description: 'Whether an amount is affordable in a month: forecast spend + goal needs vs expected income → yes / tight / no with reasons.',
    input_schema: { type: 'object', properties: { amount: { type: 'number' }, month: { type: 'string' } }, required: ['amount'] },
  },
];

const SYSTEM = `You are Ask Wealthwise, the in-app assistant of Wealthwise, a personal-finance app for India. Today (IST) is {TODAY}.
Rules:
- Answer ONLY about this user's own spending data, using the tools. Every number in your answer must come from a tool result — never calculate, estimate or invent numbers yourself. If a needed number isn't in a tool result, call another tool.
- Reply in the same language the user wrote in (English, Hindi or Hinglish).
- Keep answers under 120 words. Put every ₹ amount and key number in **bold**. Use ₹ with Indian digit grouping (₹1,25,000).
- Do not give investment, tax or loan recommendations. If asked, say briefly that Wealthwise gives spending insights, not financial advice.
- Be warm and practical; end with one short suggestion when useful.`;

// ---------------- chat ----------------
export function isHinglish(t: string) {
  return /\b(kitna|kitne|kitni|kya|mera|meri|mere|maine|kharcha|kharch|kahan|kaha|mahine|mahina|hafte|hafta|bachat|paisa|paise|sakti|sakta|agle|pichle|karu|karun|kaise|zyada|jyada|bata|batao|hoga|hogi|hai)\b/i.test(t);
}

export async function checkChatCap(userId: string) {
  // The built-in engine costs nothing, so it only has an anti-abuse limit. The daily cap applies when Claude answers.
  if (!hasClaude()) {
    await rateLimit(`chat:${userId}`, 60, 600, 'You’re asking very fast — please wait a few minutes.');
    return null;
  }
  const cap = Number(process.env.CHAT_DAILY_CAP || 30);
  const today = todayIST();
  const [p] = await q<{ chat_day: string | null; chat_count: number }>(`select chat_day, chat_count from profiles where id=$1`, [userId]);
  const used = p.chat_day === today ? p.chat_count : 0;
  if (used >= cap) throw new HttpError(429, `You've reached today's limit of ${cap} questions. Ask again tomorrow!`);
  await q(`update profiles set chat_day=$2, chat_count=$3 where id=$1`, [userId, today, used + 1]);
  return { used: used + 1, cap };
}

export interface ChatEvent {
  t: 'text' | 'chart' | 'followups' | 'done' | 'error' | 'tool';
  v?: any;
}

type Chart = { type: 'bar' | 'pie'; title: string; data: { label: string; value: number }[] } | null;

function chartFrom(name: string, res: any): Chart {
  if (name === 'get_breakdown' && res.items?.length && res.by !== 'day')
    return { type: res.by === 'category' ? 'bar' : 'pie', title: `By ${res.by.replace('_', ' ')} · ${res.period}`, data: res.items.slice(0, 6).map((i: any) => ({ label: i.label, value: i.value_inr })) };
  if (name === 'compare_periods')
    return { type: 'bar', title: 'Like-for-like comparison', data: [{ label: res.b.label, value: res.b.same_days_total_inr }, { label: res.a.label, value: res.a.total_inr }] };
  if (name === 'get_budget_status' && res.items?.length)
    return { type: 'bar', title: '% of budget used', data: res.items.slice(0, 6).map((i: any) => ({ label: i.category, value: i.pct_used })) };
  if (name === 'get_forecast') return { type: 'bar', title: `Forecast · ${res.month}`, data: res.top_categories.map((c: any) => ({ label: c.category, value: c.predicted_inr })) };
  if (name === 'simulate_cut') return { type: 'bar', title: 'You could save', data: [{ label: 'Week', value: res.saves_per_week_inr }, { label: 'Month', value: res.saves_per_month_inr }, { label: 'Year', value: res.saves_per_year_inr }] };
  return null;
}

export async function* chat(userId: string, message: string): AsyncGenerator<ChatEvent> {
  const text = message.trim().slice(0, 600);
  if (!text) return;
  await q(`insert into chat_messages(user_id,role,content) values($1,'user',$2)`, [userId, text]);
  let answer = '';
  let chart: Chart = null;
  let intent = 'generic';
  try {
    if (hasClaude()) {
      for await (const ev of claudeChat(userId, text)) {
        if (ev.t === 'text') answer += ev.v;
        if (ev.t === 'chart') chart = ev.v;
        if (ev.t === 'tool') intent = toolIntent(ev.v) || intent;
        yield ev;
      }
    } else {
      const r = await ruleChat(userId, text);
      answer = cap1(r.text);
      chart = r.chart;
      intent = r.intent;
      // stream it in small chunks so the UI feels the same
      for (const chunk of answer.match(/.{1,24}(\s|$)|.+/g) || [answer]) {
        yield { t: 'text', v: chunk };
      }
      if (chart) yield { t: 'chart', v: chart };
    }
  } catch (e) {
    console.error('[assistant]', e);
    if (!answer) {
      const r = await ruleChat(userId, text);
      answer = r.text;
      chart = r.chart;
      intent = r.intent;
      yield { t: 'text', v: answer };
      if (chart) yield { t: 'chart', v: chart };
    }
  }
  const followups = await followupsFor(userId, intent, text).catch(() => []);
  yield { t: 'followups', v: followups };
  await q(`insert into chat_messages(user_id,role,content,meta) values($1,'assistant',$2,$3::jsonb)`, [userId, answer, JSON.stringify({ chart, followups })]);
  yield { t: 'done' };
}

function toolIntent(name: string) {
  return (
    {
      get_breakdown: 'most',
      compare_periods: 'compare',
      get_budget_status: 'budget',
      get_goals: 'goals',
      get_forecast: 'forecast',
      get_recurring: 'recurring',
      simulate_cut: 'cut',
      check_affordability: 'afford',
    } as Record<string, string>
  )[name];
}

async function* claudeChat(userId: string, text: string): AsyncGenerator<ChatEvent> {
  await useAiBudget('chat');
  const history = await q<{ role: 'user' | 'assistant'; content: string }>(
    `select role, content from (select role, content, created_at from chat_messages where user_id=$1 order by created_at desc limit 9) t order by created_at`,
    [userId],
  );
  const messages: any[] = history.map((h) => ({ role: h.role, content: h.content }));
  // ensure the conversation starts with a user turn and alternates
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const merged: any[] = [];
  for (const m of messages) {
    if (merged.length && merged[merged.length - 1].role === m.role) merged[merged.length - 1].content += '\n' + m.content;
    else merged.push({ ...m });
  }
  const system = SYSTEM.replace('{TODAY}', todayIST());
  let chartSent = false;
  for (let round = 0; round < 6; round++) {
    const stream = claude().messages.stream({ model: SMART_MODEL, max_tokens: 700, system, tools: TOOL_DEFS as any, messages: merged });
    for await (const ev of stream as any) {
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield { t: 'text', v: ev.delta.text };
    }
    const final = await stream.finalMessage();
    merged.push({ role: 'assistant', content: final.content });
    const uses = final.content.filter((b: any) => b.type === 'tool_use') as any[];
    if (!uses.length || final.stop_reason !== 'tool_use') break;
    const results: any[] = [];
    for (const u of uses) {
      let out: any;
      try {
        const fn = (tools as any)[u.name];
        out = fn ? await fn(userId, u.input || {}) : { error: 'unknown tool' };
      } catch (e: any) {
        out = { error: e.message };
      }
      yield { t: 'tool', v: u.name };
      const c = chartFrom(u.name, out);
      if (c && !chartSent) {
        yield { t: 'chart', v: c };
        chartSent = true;
      }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    merged.push({ role: 'user', content: results });
  }
}

// ---------------- built-in engine (no API key needed) ----------------
// Understands the common questions people ask about their own spending, in English and Hinglish, and answers with
// exact numbers from the same tools Claude uses. Every number below comes from SQL — nothing is estimated in text.

const b = (s: string | number) => `**${s}**`;
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CATEGORY_WORDS: Record<string, string> = {
  food: 'Food & Dining', khana: 'Food & Dining', dining: 'Food & Dining', restaurant: 'Food & Dining', restaurants: 'Food & Dining', eating: 'Food & Dining',
  grocery: 'Groceries', groceries: 'Groceries', sabzi: 'Groceries', kirana: 'Groceries',
  transport: 'Transport', travel: 'Travel', commute: 'Transport', cab: 'Transport', cabs: 'Transport', fuel: 'Transport',
  shopping: 'Shopping', clothes: 'Shopping', bills: 'Bills & Utilities', utilities: 'Bills & Utilities', electricity: 'Bills & Utilities',
  rent: 'Rent & Housing', housing: 'Rent & Housing', health: 'Health & Medical', medical: 'Health & Medical', medicine: 'Health & Medical', medicines: 'Health & Medical',
  education: 'Education', fees: 'Education', books: 'Education', entertainment: 'Entertainment & Subscriptions', movies: 'Entertainment & Subscriptions', subscriptions: 'Entertainment & Subscriptions',
  gifts: 'Gifts & Festivals', festival: 'Gifts & Festivals', festivals: 'Gifts & Festivals', investments: 'Investments & Savings', investment: 'Investments & Savings',
  personal: 'Personal Care', salon: 'Personal Care', fitness: 'Health & Fitness', gym: 'Health & Fitness',
};

type Cat = { id: string; name: string; emoji: string };

async function findCategory(userId: string, t: string): Promise<Cat | null> {
  const cats = (await listCategories(userId)) as Cat[];
  const byName = cats.find((c) => t.includes(c.name.toLowerCase())) || cats.find((c) => c.name.length > 4 && t.includes(c.name.toLowerCase().split(/[ &]/)[0]) && c.name.toLowerCase().split(/[ &]/)[0].length > 4);
  if (byName) return byName;
  for (const [w, n] of Object.entries(CATEGORY_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) {
      const c = cats.find((x) => x.name === n) || cats.find((x) => x.name.toLowerCase().startsWith(n.toLowerCase().split(' ')[0]));
      if (c) return c;
    }
  }
  return null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The keyword from the question that matches the most of this user's expense names ("uber" → 12 expenses). */
async function findMerchant(userId: string, raw: string): Promise<string | null> {
  let best: { kw: string; n: number } | null = null;
  for (const kw of candidateKeywords(raw).slice(0, 6)) {
    const [r] = await q<{ n: number }>(`select count(*)::int n from expenses where user_id=$1 and name ~* $2`, [userId, '\\m' + esc(kw)]);
    if (r.n > 0 && (!best || r.n > best.n)) best = { kw, n: r.n };
  }
  return best?.kw ?? null;
}

async function topItems(userId: string, from: string, to: string, extra: { categoryId?: string; keyword?: string; necessity?: string } = {}, limit = 3) {
  const params: unknown[] = [userId, from, to];
  const where = ['user_id=$1', 'spent_on between $2 and $3'];
  if (extra.categoryId) { params.push(extra.categoryId); where.push(`category_id=$${params.length}`); }
  if (extra.keyword) { params.push('\\m' + esc(extra.keyword)); where.push(`name ~* $${params.length}`); }
  if (extra.necessity) { params.push(extra.necessity); where.push(`necessity=$${params.length}::necessity`); }
  return q<{ name: string; amount_inr: number; spent_on: string }>(`select name, amount_inr, spent_on from expenses where ${where.join(' and ')} order by amount_inr desc, spent_on desc limit ${limit}`, params);
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const listItems = (items: { name: string; amount_inr: number; spent_on: string }[]) => items.map((i) => `${i.name} ${b(inr(i.amount_inr))} (${ddmm(i.spent_on)})`).join(', ');

type Answer = { text: string; chart: Chart; intent: string };

const HI_PERIODS: [RegExp, string][] = [
  [/\bThis month\b/g, 'Is mahine'], [/\bthis month\b/g, 'is mahine'], [/\bThis week\b/g, 'Is hafte'], [/\bthis week\b/g, 'is hafte'],
  [/\bLast week\b/g, 'Pichle hafte'], [/\blast week\b/g, 'pichle hafte'], [/\bToday\b/g, 'Aaj'], [/\btoday\b/g, 'aaj'],
  [/\bYesterday\b/g, 'Kal'], [/\byesterday\b/g, 'kal'], [/\bThis year\b/g, 'Is saal'], [/\bthis year\b/g, 'is saal'],
];

/** "3%", or "under 1%" for tiny non-zero shares. */
const sharePct = (part: number, whole: number) => (!whole || !part ? '0%' : part / whole < 0.01 ? 'under 1%' : Math.round((part / whole) * 100) + '%');

export async function ruleChat(userId: string, raw: string): Promise<Answer> {
  const r = await ruleChatInner(userId, raw);
  if (isHinglish(raw)) for (const [re, to] of HI_PERIODS) r.text = r.text.replace(re, to);
  return r;
}

async function ruleChatInner(userId: string, raw: string): Promise<Answer> {
  const t = raw.toLowerCase().replace(/[’']/g, "'").trim();
  const hi = isHinglish(raw);
  const L = (en: string, hn: string) => (hi ? hn : en);
  const today = todayIST();
  const asked = detectPeriod(raw, today);
  const P = (dflt: string) => asked ?? dflt;

  const [{ n: totalCount }] = await q<{ n: number }>(`select count(*)::int n from expenses where user_id=$1`, [userId]);

  // greetings / help
  if (/^(hi+|hello|hey|namaste|hola|yo|help|start)\b[!. ]*$/.test(t) || /(what can you (do|answer)|what can i ask|how do(es)? (this|you) work|kya puch)/.test(t)) {
    return {
      intent: 'help',
      chart: null,
      text: L(
        'Hi! I answer questions about **your own** spending, using the expenses you log. You can ask things like:\n• Where did I spend the most this month?\n• How much did I spend on Swiggy in September?\n• Which budget am I closest to crossing?\n• Can I afford a ₹10,000 purchase next month?' +
          (totalCount ? '' : '\nAdd a few expenses first — then I’ll have something to work with.'),
        'Namaste! Main aapke **apne** kharche ke sawaalon ka jawab deta hoon. Jaise:\n• Is mahine sabse zyada kahan kharch hua?\n• September mein Swiggy par kitna gaya?\n• Kaunsa budget cross hone wala hai?',
      ),
    };
  }

  if (/(invest|stock|mutual fund|sip kahan|which sip|tax|loan le|loan lena|crypto|share market|insurance)/.test(t) && !/(spent|spend|kharch|how much|kitna)/.test(t)) {
    return { intent: 'advice', chart: null, text: L('I can help with your spending, budgets and goals — but not investment, tax, insurance or loan advice. Wealthwise gives spending insights, not financial advice.', 'Main kharche, budget aur goals mein madad kar sakta hoon — investment, tax ya loan advice nahi.') };
  }

  if (!totalCount && !/(goal|budget|recurring|afford)/.test(t)) {
    return { intent: 'empty', chart: null, text: L('You haven’t logged any expenses yet, so there’s nothing to analyse. Tap **+** to add your first one — I can answer as soon as there’s data.', 'Abhi tak koi kharcha log nahi hua. **+** dabake pehla kharcha add karo.') };
  }

  // ---- affordability
  if (/(afford|le sakt|kharid sakt|khareed sakt|can i buy|should i buy)/.test(t)) {
    const amt = findAmounts(t.replace(/₹/g, ' rs '))[0]?.value ?? findAmounts(t)[0]?.value;
    if (!amt) return { intent: 'afford', chart: null, text: L('How much does it cost? Try: “Can I afford a ₹15,000 phone next month?”', 'Kitne ka hai? Jaise: “Kya main agle mahine ₹15,000 ka phone le sakti hoon?”') };
    const r = await tools.check_affordability(userId, { amount: amt });
    const chart: Chart = { type: 'bar', title: `${r.month} · expected`, data: [{ label: 'Income', value: r.expected_income_inr }, { label: 'Spending', value: r.forecast_spend_inr }, { label: 'Goals', value: r.goal_contributions_needed_inr }, { label: 'Spare', value: Math.max(0, r.headroom_inr) }] };
    if (!r.expected_income_inr) {
      return { intent: 'afford', chart: null, text: L(`I don’t know your income yet, so I can’t say for sure. Your spending in ${r.month} is forecast at about ${b(inr(r.forecast_spend_inr))} (up to ${b(inr(r.forecast_spend_high_inr))}). Add your monthly income in **Settings → Profile** and ask again.`, `Aapki income pata nahi hai. ${r.month} ka anumaanit kharcha ${b(inr(r.forecast_spend_inr))} hai. Settings mein income add karo.`) };
    }
    const base = L(
      `in ${r.month} you’re expected to earn about ${b(inr(r.expected_income_inr))}, spend about ${b(inr(r.forecast_spend_inr))} (up to ${b(inr(r.forecast_spend_high_inr))} in a pricier month) and need ${b(inr(r.goal_contributions_needed_inr))} for your goals`,
      `${r.month} mein income lagbhag ${b(inr(r.expected_income_inr))}, kharcha ${b(inr(r.forecast_spend_inr))} (max ${b(inr(r.forecast_spend_high_inr))}) aur goals ke liye ${b(inr(r.goal_contributions_needed_inr))}`,
    );
    let text: string;
    if (r.verdict === 'yes') text = L(`${b('Yes')} — ${base}. That leaves about ${b(inr(r.headroom_inr))} spare, enough for ${b(inr(amt))} even in a pricier month.`, `${b('Haan')} — ${base}. Lagbhag ${b(inr(r.headroom_inr))} bachte hain, ${b(inr(amt))} aaram se ho jayega.`);
    else if (r.verdict === 'tight') text = L(`${b('It’s tight')} — ${base}. A normal month leaves about ${b(inr(r.headroom_inr))} spare, so ${b(inr(amt))} fits only if spending stays on forecast. Waiting a week on your cool-off list could help.`, `${b('Thoda tight hai')} — ${base}. Normal mahine mein ${b(inr(r.headroom_inr))} bachte hain, toh ${b(inr(amt))} tabhi fit hoga jab kharcha forecast par rahe.`);
    else if (r.headroom_inr > 0) text = L(`${b('Not comfortably')} — ${base}. That leaves only about ${b(inr(r.headroom_inr))} spare, less than the ${b(inr(amt))} it costs. You could save towards it over ${Math.ceil(amt / Math.max(1, r.headroom_inr))} months instead.`, `${b('Abhi mushkil hai')} — ${base}. Sirf ${b(inr(r.headroom_inr))} bachte hain, jo ${b(inr(amt))} se kam hai.`);
    else text = L(`${b('Not right now')} — ${base}. Together those already use up your expected income (about ${b(inr(-r.headroom_inr))} short), so ${b(inr(amt))} would have to come out of savings.`, `${b('Abhi nahi')} — ${base}. Ye sab milke income se ${b(inr(-r.headroom_inr))} zyada hai, toh ${b(inr(amt))} savings se jayega.`);
    return { intent: 'afford', chart, text };
  }

  // ---- what-if cut
  if (/(cut|half|halve|aadha|kam kar|reduce|stop|skip)/.test(t) && /(save|bach|unnecessary|faltu|delivery|swiggy|zomato|shopping|spend|kharch|entertainment|food|%|subscription|\bon\b)/.test(t)) {
    const pctM = t.match(/(\d{1,3})\s*(%|percent)/);
    const pct = pctM ? Number(pctM[1]) : /(stop|skip|completely|entirely|band)/.test(t) ? 100 : /(third)/.test(t) ? 33 : /(quarter)/.test(t) ? 25 : 50;
    let target = 'unnecessary';
    if (/delivery|swiggy|zomato/.test(t)) target = 'food delivery';
    else if (/neutral/.test(t)) target = 'neutral';
    else if (!/(unnecessary|faltu)/.test(t)) {
      const c = await findCategory(userId, t);
      if (c) target = c.name;
    }
    const r = await tools.simulate_cut(userId, { target, pct });
    if (!r.current_weekly_inr) return { intent: 'cut', chart: null, text: L(`You haven’t spent anything on ${r.target} in the last 4 weeks, so there’s nothing to cut there.`, `Pichle 4 hafton mein ${r.target} par kuch kharch nahi hua.`) };
    return {
      intent: 'cut',
      chart: chartFrom('simulate_cut', r),
      text: L(
        `Over the last 4 weeks you spent about ${b(inr(r.current_weekly_inr))} a week on ${r.target}. Cutting that by ${b(pct + '%')} would save about ${b(inr(r.saves_per_week_inr))} a week — ${b(inr(r.saves_per_month_inr))} a month, or ${b(inr(r.saves_per_year_inr))} a year.`,
        `Pichle 4 hafton mein aap hafte ka lagbhag ${b(inr(r.current_weekly_inr))} ${r.target} par kharch kar rahe ho. ${b(pct + '%')} kam karo toh ${b(inr(r.saves_per_week_inr))}/hafta — ${b(inr(r.saves_per_month_inr))}/mahina, yaani ${b(inr(r.saves_per_year_inr))} saal mein.`,
      ),
    };
  }

  // ---- goals
  if (/(goal|on track|jar|saving for|target)/.test(t) && !/(budget)/.test(t)) {
    const r = await tools.get_goals(userId);
    let act = r.goals.filter((g: any) => g.status === 'active');
    if (!act.length) {
      const done = r.goals.filter((g: any) => g.status === 'completed');
      return { intent: 'goals', chart: null, text: done.length ? L(`All your goals are complete 🎉 (${done.map((g: any) => g.name).join(', ')}). Add a new one in **Goals & budgets**.`, `Saare goals poore ho gaye 🎉. Naya goal banao.`) : L('You don’t have any savings goals yet. Add one in **Goals & budgets** — like “Goa trip ₹25,000 by March”.', 'Abhi koi goal nahi hai. Goals mein ek banao — jaise “Goa trip ₹25,000 March tak”.') };
    }
    const named = act.filter((g: any) => t.includes(String(g.name).toLowerCase()) || String(g.name).toLowerCase().split(/\s+/).some((w: string) => w.length > 3 && new RegExp(`\\b${esc(w)}\\b`).test(t)));
    if (named.length) act = named;
    const ws = await q<any>(`select achieved from weekly_savings where user_id=$1 and closed order by week_start desc limit 4`, [userId]);
    const hits = ws.filter((w: any) => w.achieved).length;
    const lines = act.slice(0, 3).map((g: any) => {
      const left = Math.max(0, g.target_inr - g.saved_inr);
      const dl = g.deadline ? g.deadline.split('-').reverse().join('/') : null;
      if (left <= 0) return L(`${b(g.name)}: fully saved — ${b(inr(g.saved_inr))} 🎉`, `${b(g.name)}: poora ho gaya 🎉`);
      return L(
        `${b(g.name)}: ${b(inr(g.saved_inr))} of ${b(inr(g.target_inr))} saved (${g.pct}%), ${b(inr(left))} to go` + (g.needed_per_week_inr && dl ? ` — about ${b(inr(g.needed_per_week_inr))} a week gets you there by ${dl}.` : '.'),
        `${b(g.name)}: ${b(inr(g.target_inr))} mein se ${b(inr(g.saved_inr))} (${g.pct}%), ${b(inr(left))} baaki` + (g.needed_per_week_inr && dl ? ` — ${dl} tak ${b(inr(g.needed_per_week_inr))}/hafta chahiye.` : '.'),
      );
    });
    return {
      intent: 'goals',
      chart: act.length > 1 ? { type: 'bar', title: '% of goal saved', data: act.slice(0, 5).map((g: any) => ({ label: g.name, value: g.pct })) } : null,
      text: lines.join('\n') + (ws.length ? L(`\nYou hit your weekly savings target in ${b(hits)} of the last ${ws.length} week${ws.length === 1 ? '' : 's'}.`, `\nPichle ${ws.length} hafton mein se ${b(hits)} mein weekly target hit hua.`) : ''),
    };
  }

  // ---- budgets
  if (/(budget|limit|overspen|cross)/.test(t)) {
    const r = await tools.get_budget_status(userId, {});
    if (!r.items.length) return { intent: 'budget', chart: null, text: L('You haven’t set any budgets for this month. Open **Goals & budgets** and tap **Suggest budgets** to get started.', 'Is mahine koi budget nahi hai. Goals & budgets mein set karo.') };
    const c = await findCategory(userId, t);
    const one = c ? r.items.find((i: any) => i.category === c.name) : null;
    if (one) {
      return {
        intent: 'budget',
        chart: null,
        text: L(
          `${b(one.category)}: ${b(inr(one.spent_inr))} of ${b(inr(one.limit_inr))} used (${b(one.pct_used + '%')}), ` + (one.remaining_inr >= 0 ? `${b(inr(one.remaining_inr))} left for ${r.month}.` : `${b(inr(-one.remaining_inr))} over.`) + (one.on_pace_to_cross_on ? ` At this pace you’ll cross it around ${b(ddmm(one.on_pace_to_cross_on))}.` : ''),
          `${b(one.category)}: ${b(inr(one.limit_inr))} mein se ${b(inr(one.spent_inr))} (${b(one.pct_used + '%')}).`,
        ),
      };
    }
    // Rank by whichever is higher: what's used already, or where the current pace ends the month.
    const risk = (i: any) => Math.max(i.pct_used, i.projected_month_end_inr && i.limit_inr ? (i.projected_month_end_inr / i.limit_inr) * 100 : 0);
    const sorted = [...r.items].sort((a: any, z: any) => risk(z) - risk(a));
    const over = sorted.filter((i: any) => i.pct_used >= 100);
    const under = sorted.filter((i: any) => i.pct_used < 100);
    const top = under[0];
    if (top && !over.length && top.pct_used < 50) {
      const onPace = top.projected_month_end_inr && top.projected_month_end_inr > top.limit_inr;
      const used = r.items.reduce((s2: number, i: any) => s2 + i.spent_inr, 0);
      const limit = r.items.reduce((s2: number, i: any) => s2 + i.limit_inr, 0);
      return {
        intent: 'budget',
        chart: chartFrom('get_budget_status', { items: sorted }),
        text: L(
          `You’ve used ${b(inr(used))} of your ${b(inr(limit))} in budgets for ${r.month} so far, so none is close yet. ` +
            (onPace
              ? `The one to watch is ${b(top.category)}: at your recent pace it would reach about ${b(inr(top.projected_month_end_inr))} against its ${b(inr(top.limit_inr))} limit${top.on_pace_to_cross_on ? `, crossing around the ${b(ordinal(Number(top.on_pace_to_cross_on.slice(8, 10))))}` : ''}.`
              : `At your recent pace every budget stays under its limit.`),
          `${r.month} ke budgets mein se abhi ${b(inr(used))} / ${b(inr(limit))} use hua hai.` + (onPace ? ` ${b(top.category)} par nazar rakho — isi speed se ${b(inr(top.projected_month_end_inr))} tak jayega (limit ${b(inr(top.limit_inr))}).` : ''),
        ),
      };
    }
    let text = '';
    if (over.length) text += L(`Already over: ${over.map((i: any) => `${b(i.category)} (${inr(i.spent_inr)} of ${inr(i.limit_inr)})`).join(', ')}. `, `Pehle se cross: ${over.map((i: any) => b(i.category)).join(', ')}. `);
    if (top) text += L(`Closest to crossing: ${b(top.category)} — ${b(inr(top.spent_inr))} of ${b(inr(top.limit_inr))} used (${b(top.pct_used + '%')}), ${b(inr(top.remaining_inr))} left.`, `Sabse kareeb: ${b(top.category)} — ${b(inr(top.limit_inr))} mein se ${b(inr(top.spent_inr))} (${b(top.pct_used + '%')}).`) + (top.on_pace_to_cross_on ? L(` At this pace it crosses around ${b(ddmm(top.on_pace_to_cross_on))}.`, ` Isi speed se ${b(ddmm(top.on_pace_to_cross_on))} ko cross hoga.`) : '');
    else text += L('Every budget is already used up.', 'Saare budget khatam.');
    return { intent: 'budget', chart: chartFrom('get_budget_status', { items: sorted }), text };
  }

  // ---- compare periods
  if (/(compare|comparison| vs |versus|compared|than last|last month se|pichle mahine se|difference|change from)/.test(t) && !/(upi|cash|card)/.test(t)) {
    const months = [...t.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(20\d{2}))?/g)].map((m) => detectPeriod(m[0], today)).filter(Boolean) as string[];
    let pa = 'this_month', pb = 'last_month';
    if (months.length >= 2) [pa, pb] = months[0] > months[1] ? [months[0], months[1]] : [months[1], months[0]];
    else if (/week|hafte/.test(t)) [pa, pb] = ['this_week', 'last_week'];
    else if (months.length === 1) [pa, pb] = [months[0], addMonths(months[0] + '-01', -1).slice(0, 7)];
    const r = await tools.compare_periods(userId, { period_a: pa, period_b: pb });
    const up = r.change_vs_same_days_inr > 0;
    const partial = r.b.same_days_total_inr !== r.b.total_inr;
    const mover = r.biggest_category_changes.find((x: any) => x.change_inr !== 0);
    const delta = `${up ? L('up', 'zyada') : L('down', 'kam')} ${b(inr(Math.abs(r.change_vs_same_days_inr)))}${r.change_vs_same_days_pct != null ? ` (${b(Math.abs(r.change_vs_same_days_pct) + '%')})` : ''}`;
    if (!r.b.total_inr) {
      return { intent: 'compare', chart: null, text: L(`${cap1(when(r.a.label))} you’ve spent ${b(inr(r.a.total_inr))}. There’s nothing logged ${when(r.b.label)}, so there’s nothing to compare with yet.`, `${cap1(r.a.label)} ${b(inr(r.a.total_inr))}. ${cap1(r.b.label)} ka koi data nahi hai.`) };
    }
    const text = partial
      ? L(`${cap1(r.a.label)} so far: ${b(inr(r.a.total_inr))}. By the same point ${r.b.label === 'last week' ? 'last week' : `in ${r.b.label}`} you’d spent ${b(inr(r.b.same_days_total_inr))} — ${delta}. ${cap1(r.b.label)}’s full total was ${b(inr(r.b.total_inr))}.`, `${cap1(r.a.label)} ab tak: ${b(inr(r.a.total_inr))}. ${r.b.label} mein isi din tak ${b(inr(r.b.same_days_total_inr))} the — ${delta}.`)
      : L(`${cap1(r.a.label)}: ${b(inr(r.a.total_inr))} vs ${r.b.label}: ${b(inr(r.b.total_inr))} — ${delta}.`, `${cap1(r.a.label)}: ${b(inr(r.a.total_inr))}, ${r.b.label}: ${b(inr(r.b.total_inr))} — ${delta}.`);
    const moverText = mover ? L(` Biggest change: ${mover.category} (${mover.change_inr >= 0 ? '+' : '−'}${inr(Math.abs(mover.change_inr))}).`, ` Sabse bada badlav: ${mover.category} (${mover.change_inr >= 0 ? '+' : '−'}${inr(Math.abs(mover.change_inr))}).`) : '';
    return { intent: 'compare', chart: chartFrom('compare_periods', r), text: text + moverText };
  }

  // ---- forecast
  if (/(next month|predict|forecast|agle mahine|probably spend|will i spend|expect to spend|going to spend)/.test(t)) {
    const r = await tools.get_forecast(userId, {});
    const d = r.drivers[0];
    return {
      intent: 'forecast',
      chart: chartFrom('get_forecast', r),
      text:
        (r.method === 'cold_start'
          ? L(`You haven’t tracked a full month yet, so this is a starter estimate: about ${b(inr(r.predicted_total_inr))} for ${r.month} (between ${b(inr(r.likely_low_inr))} and ${b(inr(r.likely_high_inr))}), based on typical spending for people like you plus any recurring payments. It becomes personal after your first full month of logging.`, `Abhi ek poora mahina track nahi hua, toh ye shuruaati anumaan hai: ${r.month} mein lagbhag ${b(inr(r.predicted_total_inr))}.`)
          : L(`For ${r.month} I expect you’ll spend about ${b(inr(r.predicted_total_inr))}, most likely between ${b(inr(r.likely_low_inr))} and ${b(inr(r.likely_high_inr))}. This is based on your last few months, your recurring payments and festivals coming up.`, `${r.month} mein lagbhag ${b(inr(r.predicted_total_inr))} kharch hone ka anumaan hai — ${b(inr(r.likely_low_inr))} se ${b(inr(r.likely_high_inr))} ke beech.`)) +
        (d ? L(` Biggest driver: ${d.category} (${d.delta >= 0 ? '+' : '−'}${inr(Math.abs(d.delta))}${d.reason ? `, ${d.reason}` : ''}).`, ` Sabse bada factor: ${d.category} (${d.delta >= 0 ? '+' : '−'}${inr(Math.abs(d.delta))}).`) : '') +
        (r.festivals.length ? L(` Heads-up: ${r.festivals.join(', ')}.`, ` Dhyaan dein: ${r.festivals.join(', ')}.`) : ''),
    };
  }

  // ---- income & savings
  if (/(how much (did|have) i (save|saved)|did i save|savings (this|last)|money left|left over|leftover|bach(a|e|i)( hai| hua)?\b|income|earn|salary)/.test(t) && !/afford/.test(t)) {
    const r = periodRange(P('this_month'));
    const inc = await incomeTotal(userId, r.from, r.to);
    const spent = await tools.get_spend(userId, { period: P('this_month') });
    if (inc > 0) {
      const left = Math.round(inc - spent.total_inr);
      return { intent: 'savings', chart: { type: 'bar', title: cap1(r.label), data: [{ label: 'Income', value: Math.round(inc) }, { label: 'Spent', value: spent.total_inr }, { label: left >= 0 ? 'Left' : 'Over', value: Math.abs(left) }] }, text: L(`${cap1(when(r.label))} you received ${b(inr(inc))} and spent ${b(inr(spent.total_inr))}, so ` + (left >= 0 ? `${b(inr(left))} is left (${b(Math.round((left / inc) * 100) + '%')} of income).` : `you spent ${b(inr(-left))} more than you earned.`), `${cap1(r.label)}: income ${b(inr(inc))}, kharcha ${b(inr(spent.total_inr))} — ` + (left >= 0 ? `${b(inr(left))} bache.` : `${b(inr(-left))} zyada kharch hua.`)) };
    }
    const [p] = await q<any>(`select monthly_income from profiles where id=$1`, [userId]);
    if (p?.monthly_income && /month/.test(r.label + (asked ?? 'this_month'))) {
      const left = Math.round(p.monthly_income - spent.total_inr);
      return { intent: 'savings', chart: null, text: L(`You haven’t logged income ${when(r.label)}. Going by the monthly income in your profile (about ${b(inr(p.monthly_income))}) and the ${b(inr(spent.total_inr))} you’ve spent, about ${b(inr(Math.max(0, left)))} would be left${left < 0 ? ` — you’re ${b(inr(-left))} over` : ''}.`, `Income log nahi hui. Profile ki income (${b(inr(p.monthly_income))}) ke hisaab se lagbhag ${b(inr(Math.max(0, left)))} bachega.`) };
    }
    return { intent: 'savings', chart: null, text: L(`You’ve spent ${b(inr(spent.total_inr))} ${when(r.label)}, but I don’t have your income, so I can’t work out savings. Add your income in **Settings → Profile**.`, `${r.label} ${b(inr(spent.total_inr))} kharch hua, par income pata nahi hai.`) };
  }

  // ---- payment modes
  if (/(upi|cash|card|payment mode|payment method|paid by|pay by|how did i pay|netbanking|gpay|phonepe|paytm)/.test(t)) {
    const r = await tools.get_breakdown(userId, { period: P('this_month'), by: 'payment_mode' });
    if (!r.items.length) return { intent: 'modes', chart: null, text: L(`No spending logged ${when(r.period)}.`, `${r.period} koi kharcha nahi.`) };
    const parts = r.items.map((i: any) => `${i.label} ${b(inr(i.value_inr))} (${i.share_pct}%)`);
    return { intent: 'modes', chart: chartFrom('get_breakdown', r), text: L(`${cap1(when(r.period))} you paid ${b(inr(r.total_inr))} in total: ${parts.join(', ')}.`, `${cap1(r.period)} kul ${b(inr(r.total_inr))}: ${parts.join(', ')}.`) };
  }

  // ---- recurring
  if (/(recurring|subscription|emi|\bsips?\b|har mahine|every month|monthly payments|autopay|fixed costs?)/.test(t)) {
    const r = await tools.get_recurring(userId);
    if (!r.rules.length) return { intent: 'recurring', chart: null, text: L('You don’t have any recurring payments set up yet. Add rent, SIPs or subscriptions in **Transactions → Recurring** and they’ll be logged automatically.', 'Abhi koi recurring payment nahi hai.') };
    return {
      intent: 'recurring',
      chart: { type: 'bar', title: 'Recurring payments', data: r.rules.slice(0, 6).map((x: any) => ({ label: x.name, value: x.amount_inr })) },
      text: L(`You have ${b(r.rules.length)} recurring payment${r.rules.length === 1 ? '' : 's'}, about ${b(inr(r.monthly_total_inr))} a month in total:`, `Aapke ${b(r.rules.length)} recurring payments hain, lagbhag ${b(inr(r.monthly_total_inr))}/mahina:`) + '\n' + r.rules.slice(0, 8).map((x: any) => `• ${x.name} — ${b(inr(x.amount_inr))} ${x.frequency}`).join('\n'),
    };
  }

  // ---- tips
  if (/(tip|tips|save more|bachau|bachaun|advice|suggest|kaise bach|how (can|do) i save|ideas)/.test(t)) {
    const br = await tools.get_breakdown(userId, { period: 'last_30_days', by: 'category' });
    const del = await tools.get_spend(userId, { period: 'last_30_days', search: 'food_delivery' });
    const un = await tools.simulate_cut(userId, { target: 'unnecessary', pct: 50 });
    const [topU] = await q<any>(
      `select c.name, sum(e.amount_inr) s from expenses e join categories c on c.id=e.category_id where e.user_id=$1 and e.spent_on >= $2 and e.necessity='unnecessary' group by c.name order by s desc limit 1`,
      [userId, addDays(today, -29)],
    );
    const tips = [
      topU ? L(`Watch ${b(topU.name)} — ${b(inr(topU.s))} of it was marked Unnecessary in the last 30 days.`, `${b(topU.name)} par dhyaan do — 30 din mein ${b(inr(topU.s))} unnecessary tha.`) : null,
      del.count >= 3 ? L(`Swap 2 food-delivery orders a week for home food — about ${b(inr(Math.round((del.total_inr / del.count) * 2)))} saved each week.`, `Hafte ke 2 delivery orders ghar ke khane se badlo — lagbhag ${b(inr(Math.round((del.total_inr / del.count) * 2)))}/hafta.`) : null,
      un.saves_per_week_inr > 0 ? L(`Halving Unnecessary spend saves about ${b(inr(un.saves_per_week_inr))} a week (${b(inr(un.saves_per_year_inr))} a year).`, `Unnecessary kharcha aadha karo toh ${b(inr(un.saves_per_week_inr))}/hafta bachega.`) : null,
      br.items[0] ? L(`${br.items[0].label} is your biggest category (${b(br.items[0].share_pct + '%')} of the last 30 days) — a budget there helps most.`, `${br.items[0].label} sabse badi category hai (${b(br.items[0].share_pct + '%')}).`) : null,
      L('Before any non-essential buy over ₹1,000, wait 24 hours on the cool-off list.', '₹1,000 se upar ki cheez pehle 24 ghante cool-off list par rakho.'),
    ].filter(Boolean) as string[];
    return { intent: 'tips', chart: null, text: L('Three ideas based on your last 30 days:\n', 'Pichle 30 din ke hisaab se 3 tips:\n') + tips.slice(0, 3).map((x, i) => `${i + 1}. ${x}`).join('\n') };
  }

  // ---- biggest single expenses
  if (/(biggest|largest|highest|most expensive|costliest|sabse bada|sabse mehenga|top \d? ?)(\s+\w+){0,2}\s+(expense|purchase|transaction|payment|kharcha|spend|item)s?\b/.test(t) || /(expensive|costliest|mehenga)/.test(t)) {
    const r = periodRange(P('this_month'));
    const items = await topItems(userId, r.from, r.to, {}, 5);
    if (!items.length) return { intent: 'biggest', chart: null, text: L(`No spending logged ${when(r.label)}.`, `${r.label} koi kharcha nahi.`) };
    return {
      intent: 'biggest',
      chart: { type: 'bar', title: `Biggest expenses · ${r.label}`, data: items.map((i) => ({ label: i.name, value: i.amount_inr })) },
      text: L(`Your biggest expense ${when(r.label)} was ${b(items[0].name)} — ${b(inr(items[0].amount_inr))} on ${ddmm(items[0].spent_on)}.`, `${cap1(r.label)} sabse bada kharcha ${b(items[0].name)} — ${b(inr(items[0].amount_inr))} (${ddmm(items[0].spent_on)}).`) + (items.length > 1 ? L(` Next: ${listItems(items.slice(1, 4))}.`, ` Uske baad: ${listItems(items.slice(1, 4))}.`) : ''),
    };
  }

  // ---- unnecessary / necessity split
  if (/(unnecessary|faltu|bekaar|avoidable|regret|wasted|waste|necessary|neutral|needs vs wants|wants)/.test(t)) {
    const period = P('this_month');
    const all = await tools.get_spend(userId, { period });
    if (!all.count) return { intent: 'unnecessary', chart: null, text: L(`No spending logged ${when(all.period)}.`, `${all.period} koi kharcha nahi.`) };
    const u = await tools.get_spend(userId, { period, necessity: 'unnecessary' });
    const br = await tools.get_breakdown(userId, { period, by: 'necessity' });
    const share = Math.round((u.total_inr / all.total_inr) * 100);
    const r = periodRange(period);
    const top = await topItems(userId, r.from, r.to, { necessity: 'unnecessary' }, 3);
    return {
      intent: 'unnecessary',
      chart: chartFrom('get_breakdown', br),
      text:
        L(`${cap1(when(u.period))}, ${b(inr(u.total_inr))} of your ${b(inr(all.total_inr))} was marked Unnecessary — ${b(share + '%')} across ${u.count} expense${u.count === 1 ? '' : 's'}.`, `${cap1(u.period)} ke ${b(inr(all.total_inr))} mein se ${b(inr(u.total_inr))} Unnecessary tha — ${b(share + '%')} (${u.count} kharche).`) +
        (top.length ? L(` Biggest ones: ${listItems(top)}.`, ` Sabse bade: ${listItems(top)}.`) : ''),
    };
  }

  // ---- food delivery
  if (/(delivery|swiggy|zomato|ordered in|order food)/.test(t)) {
    const period = P('this_week');
    // A named app ("Swiggy") means just that app; otherwise all delivery apps together.
    const brand = ['swiggy', 'zomato'].find((x) => t.includes(x));
    const what = brand ? cap1(brand) : 'food delivery';
    const r = await tools.get_spend(userId, { period, search: brand ?? 'food_delivery' });
    if (!r.count) return { intent: 'delivery', chart: null, text: L(`No ${what} orders ${when(r.period)}. 👏`, `${cap1(r.period)} koi ${what} order nahi! 👏`) };
    return {
      intent: 'delivery',
      chart: null,
      text: L(`${cap1(when(r.period))} you spent ${b(inr(r.total_inr))} on ${what} across ${b(r.count)} order${r.count === 1 ? '' : 's'} (about ${b(inr(Math.round(r.total_inr / r.count)))} each).`, `${cap1(r.period)} ${what} par ${b(inr(r.total_inr))} — ${b(r.count)} orders.`) + (r.count >= 3 && /week/.test(r.period) ? L(' The “No Swiggy Week” challenge in Rewards could help.', ' Rewards mein “No Swiggy Week” challenge try karo!') : ''),
    };
  }

  // ---- daily average
  if (/(average|avg|per day|a day|daily|roz|rozana)/.test(t)) {
    const r = periodRange(P('this_month'));
    const s = await tools.get_spend(userId, { period: P('this_month') });
    const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1;
    const [rec] = await q<{ s: number }>(`select coalesce(sum(amount_inr),0) s from expenses where user_id=$1 and is_recurring and spent_on between $2 and $3`, [userId, r.from, r.to]);
    const flexible = Math.round((s.total_inr - rec.s) / days);
    return { intent: 'average', chart: null, text: L(`${cap1(when(r.label))} you spent ${b(inr(s.total_inr))} over ${days} day${days === 1 ? '' : 's'} — about ${b(inr(Math.round(s.total_inr / days)))} a day.` + (rec.s > 0 ? ` Leaving out fixed payments like rent and subscriptions (${inr(rec.s)}), it’s about ${b(inr(flexible))} a day.` : ''), `${cap1(r.label)} ${days} din mein ${b(inr(s.total_inr))} — roz ka lagbhag ${b(inr(Math.round(s.total_inr / days)))}.`) };
  }

  // ---- a category, or a shop / item
  const cat = await findCategory(userId, t);
  const merchant = cat ? null : await findMerchant(userId, raw);
  const howMany = /(how many|kitni baar|kitne baar|number of|times)/.test(t);
  if (cat || merchant) {
    const period = P('this_month');
    const r = periodRange(period);
    const s = await tools.get_spend(userId, cat ? { period, category: cat.name } : { period, search: merchant });
    const label = cat ? `${cat.emoji} ${b(cat.name)}` : b(cap1(merchant!));
    if (!s.count) {
      const [ever] = await q<any>(cat ? `select max(spent_on) d from expenses where user_id=$1 and category_id=$2` : `select max(spent_on) d from expenses where user_id=$1 and name ~* $2`, [userId, cat ? cat.id : '\\m' + esc(merchant!)]);
      return { intent: 'category', chart: null, text: L(`Nothing on ${label} ${when(r.label)}.` + (ever?.d ? ` The last one was on ${ever.d.split('-').reverse().join('/')}.` : ''), `${cap1(r.label)} ${label} par kuch nahi.`) };
    }
    const all = await tools.get_spend(userId, { period });
    const items = await topItems(userId, r.from, r.to, cat ? { categoryId: cat.id } : { keyword: merchant! }, 3);
    const share = sharePct(s.total_inr, all.total_inr);
    return {
      intent: 'category',
      chart: null,
      text:
        (howMany
          ? L(`${s.count} time${s.count === 1 ? '' : 's'} ${when(r.label)} — ${b(inr(s.total_inr))} in total on ${label}.`, `${cap1(r.label)} ${b(s.count)} baar — kul ${b(inr(s.total_inr))}.`)
          : L(`${cap1(when(r.label))} you spent ${b(inr(s.total_inr))} on ${label} across ${b(s.count)} expense${s.count === 1 ? '' : 's'} — ${b(share)} of everything you spent.`, `${cap1(r.label)} ${label} par ${b(inr(s.total_inr))} gaye (${b(s.count)} kharche) — kul ka ${b(share)}.`)) +
        (items.length > 1 || cat ? L(` Biggest: ${listItems(items)}.`, ` Sabse bade: ${listItems(items)}.`) : ''),
    };
  }
  const on = onWhat(raw);
  if (on && /(spend|spent|kharch|how much|kitna|paid)/.test(t)) {
    const r = periodRange(P('this_month'));
    return { intent: 'category', chart: null, text: L(`I couldn’t find any expenses matching “${on}” ${when(r.label)}. Try the name as you logged it (for example “Swiggy” or “Petrol”), or a category like Food or Shopping.`, `“${on}” se milta koi kharcha nahi mila.`) };
  }

  // ---- where most (category breakdown)
  if (/(most|sabse zyada|sabse jyada|biggest|top|highest|kahan|where|breakdown|categories|split)/.test(t)) {
    const r = await tools.get_breakdown(userId, { period: P('this_month'), by: 'category' });
    const top = r.items[0];
    if (!top) return { intent: 'most', chart: null, text: L(`No spending logged ${when(r.period)} yet.`, `${r.period} abhi koi kharcha nahi.`) };
    const rest = r.items.slice(1, 3);
    return {
      intent: 'most',
      chart: chartFrom('get_breakdown', r),
      text:
        L(`${cap1(when(r.period))} you spent the most on ${top.emoji ?? ''} ${b(top.label)}: ${b(inr(top.value_inr))}, which is ${b(top.share_pct + '%')} of your ${b(inr(r.total_inr))} total.`, `${cap1(r.period)} sabse zyada ${b(top.label)} par gaya: ${b(inr(top.value_inr))} — kul ${b(inr(r.total_inr))} ka ${b(top.share_pct + '%')}.`).replace('  ', ' ') +
        (rest.length ? L(` Next: ${rest.map((x: any) => `${x.label} (${b(inr(x.value_inr))})`).join(' and ')}.`, ` Uske baad: ${rest.map((x: any) => `${x.label} (${b(inr(x.value_inr))})`).join(', ')}.`) : ''),
    };
  }

  // ---- counts and plain totals
  if (howMany || /(spend|spent|kharch|kitna|total|how much|paid)/.test(t) || asked) {
    const s = await tools.get_spend(userId, { period: P('this_month') });
    if (!s.count) return { intent: 'total', chart: null, text: L(`No spending logged ${when(s.period)}.`, `${cap1(s.period)} koi kharcha nahi.`) };
    return { intent: 'total', chart: null, text: L(`${cap1(when(s.period))} you spent ${b(inr(s.total_inr))} across ${b(s.count)} expense${s.count === 1 ? '' : 's'}.`, `${cap1(s.period)} aapne ${b(inr(s.total_inr))} kharch kiye (${b(s.count)} kharche).`) };
  }

  return {
    intent: 'help',
    chart: null,
    text: L(
      'I’m not sure I understood that. I can answer questions about your own spending — totals for any period, categories or shops (“How much on Uber in September?”), budgets, goals, forecasts, what-ifs and whether you can afford something. Try one of the questions below.',
      'Samajh nahi aaya. Main aapke kharche, budget, goals, forecast aur “what-if” ke sawaalon ka jawab de sakta hoon. Neeche diye sawaal try karo.',
    ),
  };
}

export async function chatHistory(userId: string) {
  const rows = await q<any>(`select id, role, content, meta, created_at from chat_messages where user_id=$1 order by created_at desc limit 40`, [userId]);
  return [...rows].reverse().map((r) => {
    let meta = r.meta;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch { meta = null; }
    }
    return { id: String(r.id), role: r.role === 'user' ? 'user' : 'assistant', content: String(r.content ?? ''), meta: meta && typeof meta === 'object' ? meta : null, created_at: r.created_at };
  });
}

// ---------------- suggested questions ----------------
export interface ChipDef { key: string; text: string }

/** Pre-built questions, chosen so every one has a real answer for this user's data. */
export async function chipsFor(userId: string): Promise<{ chips: ChipDef[]; empty: boolean }> {
  const today = todayIST();
  const ms = monthStart(today);
  const [c] = await q<any>(
    `select (select count(*) from expenses where user_id=$1)::int total,
            (select count(*) from expenses where user_id=$1 and spent_on >= $2)::int month_n,
            (select count(*) from expenses where user_id=$1 and spent_on >= $3 and spent_on < $2)::int last_month_n,
            (select count(*) from expenses where user_id=$1 and spent_on >= $2 and necessity='unnecessary')::int unnec_month,
            (select count(*) from expenses where user_id=$1 and spent_on >= $4 and necessity='unnecessary')::int unnec_28,
            (select count(*) from budgets where user_id=$1 and month=$2)::int budgets,
            (select name from goals where user_id=$1 and status='active' order by deadline nulls last, created_at limit 1) goal,
            (select count(*) from goals where user_id=$1 and status='active')::int goals,
            (select count(*) from recurring_rules where user_id=$1 and active)::int recurring,
            (select count(*) from expenses where user_id=$1 and spent_on >= $5 and (${FOOD_DELIVERY.map((k) => `name ilike '%${k}%'`).join(' or ')}))::int delivery_week,
            (select count(distinct payment_mode) from expenses where user_id=$1 and spent_on >= $2)::int modes,
            (select coalesce(sum(amount_inr),0) from income where user_id=$1 and received_on >= $3)::float income,
            (select monthly_income from profiles where id=$1)::float profile_income,
            (select min(spent_on) from expenses where user_id=$1) first_day`,
    [userId, ms, addMonths(ms, -1), addDays(today, -27), weekStart(today)],
  );
  if (!c.total) return { empty: true, chips: [{ key: 'help', text: 'What can you help me with?' }] };
  const [topCat] = c.month_n ? await q<any>(`select c.name from expenses e join categories c on c.id=e.category_id where e.user_id=$1 and e.spent_on >= $2 and not e.is_recurring group by c.name order by sum(e.amount_inr) desc limit 1`, [userId, ms]) : [];
  const income = c.income > 0 || c.profile_income > 0;
  const longHistory = c.first_day && c.first_day <= addDays(today, -20);
  const affordAmt = (c.profile_income || 0) >= 60000 || c.income >= 120000 ? '₹15,000 phone' : '₹5,000 purchase';
  const list: (ChipDef | false)[] = [
    c.month_n > 0 ? { key: 'most', text: 'Where did I spend the most this month?' } : c.last_month_n > 0 && { key: 'most', text: 'Where did I spend the most last month?' },
    !!topCat && { key: 'category', text: `How much did I spend on ${topCat.name} this month?` },
    c.unnec_month > 0 && { key: 'unnecessary', text: 'How much of my spending was unnecessary this month?' },
    c.month_n > 0 && c.last_month_n > 0 && dayOfMonth(today) >= 3 && { key: 'compare', text: 'Compare this month with last month' },
    c.budgets > 0 && { key: 'budget', text: 'Which budget am I closest to crossing?' },
    c.goals > 0 && { key: 'goals', text: c.goals === 1 && c.goal ? `Am I on track for my ${c.goal} goal?` : 'Am I on track for my savings goals?' },
    c.delivery_week > 0 && { key: 'delivery', text: 'How much did I spend on food delivery this week?' },
    c.month_n > 0 && { key: 'biggest', text: 'What were my biggest expenses this month?' },
    longHistory && { key: 'forecast', text: 'What will I probably spend next month?' },
    c.unnec_28 > 0 && { key: 'cut', text: 'If I cut unnecessary spending by half, how much would I save in a year?' },
    longHistory && income && { key: 'afford', text: `Can I afford a ${affordAmt} next month?` },
    c.modes > 1 && { key: 'modes', text: 'How did I pay this month — UPI, cash or card?' },
    c.recurring > 0 && { key: 'recurring', text: 'What are my recurring payments?' },
    c.month_n > 0 && { key: 'average', text: 'How much do I spend a day on average?' },
    c.total >= 5 && { key: 'tips', text: 'Give me 3 tips to save more' },
  ];
  return { empty: false, chips: list.filter(Boolean) as ChipDef[] };
}

export async function suggestions(userId: string) {
  const r = await chipsFor(userId);
  return { chips: r.chips.map((c) => c.text), empty: r.empty };
}

const RELATED: Record<string, string[]> = {
  most: ['category', 'compare', 'unnecessary', 'biggest'],
  category: ['most', 'compare', 'budget', 'cut'],
  unnecessary: ['cut', 'tips', 'most'],
  goals: ['afford', 'tips', 'forecast'],
  budget: ['forecast', 'most', 'tips'],
  compare: ['most', 'forecast', 'unnecessary'],
  forecast: ['afford', 'budget', 'recurring'],
  cut: ['tips', 'goals', 'delivery'],
  afford: ['goals', 'forecast', 'cut'],
  modes: ['most', 'biggest', 'compare'],
  recurring: ['forecast', 'most', 'cut'],
  tips: ['cut', 'delivery', 'budget'],
  biggest: ['unnecessary', 'most', 'tips'],
  delivery: ['cut', 'tips', 'unnecessary'],
  savings: ['afford', 'goals', 'most'],
  average: ['most', 'compare', 'forecast'],
  total: ['most', 'compare', 'biggest'],
  help: ['most', 'compare', 'biggest'],
  empty: ['help'],
  advice: ['most', 'goals', 'tips'],
};

async function followupsFor(userId: string, intent: string, asked: string): Promise<string[]> {
  const { chips } = await chipsFor(userId);
  const prefer = RELATED[intent] || RELATED.help;
  const out: string[] = [];
  for (const k of [...prefer, ...chips.map((c) => c.key)]) {
    const c = chips.find((x) => x.key === k);
    if (c && c.text.toLowerCase() !== asked.toLowerCase() && !out.includes(c.text)) out.push(c.text);
    if (out.length === 3) break;
  }
  return out;
}

export async function clearChat(userId: string) {
  await q(`delete from chat_messages where user_id=$1`, [userId]);
}
