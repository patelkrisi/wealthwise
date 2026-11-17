import { z } from 'zod';
import { q } from '../db';
import { HttpError } from '../auth';
import { addDays, dayOfMonth, isValidISODate, monthEnd, monthStart, todayIST } from '../dates';
import { COINS, logCoinsFor, shouldRevokeForEdits } from '../finance/coins';
import { budgetStatus } from '../finance/budget';
import { inr, MOODS, NECESSITIES, PAYMENT_MODES, type Necessity } from '../format';
import { assertCategory } from './categories';
import { learnFromLabel } from './categorize';
import { award, checkCountBadges, coinsToday, evaluateChallenges, registerActivity } from './gamification';
import { notify } from './notifications';

const dateStr = z.string().refine(isValidISODate, 'must be a valid date (YYYY-MM-DD)');

export const ExpenseInput = z.object({
  spent_on: dateStr,
  name: z.string().trim().min(1, 'is required').max(80),
  amount_inr: z.coerce.number().positive('must be more than 0').max(100000000),
  category_id: z.string().uuid('pick a category'),
  necessity: z.enum(NECESSITIES, { errorMap: () => ({ message: 'pick Necessary, Neutral or Unnecessary' }) }),
  payment_mode: z.enum(PAYMENT_MODES, { errorMap: () => ({ message: 'pick a payment mode' }) }),
  notes: z.string().trim().max(500).optional().nullable(),
  mood: z.enum(MOODS.map((m) => m.id) as [string, ...string[]]).optional().nullable(),
  entry_method: z.enum(['form', 'text', 'voice', 'quick']).default('form'),
  raw_input: z.string().max(1000).optional().nullable(),
  ai_category_id: z.string().uuid().optional().nullable(),
  ai_confidence: z.number().min(0).max(1).optional().nullable(),
  ai_necessity: z.enum(NECESSITIES).optional().nullable(),
  client_ref: z.string().max(80).optional().nullable(),
});
export type ExpenseInputT = z.infer<typeof ExpenseInput>;

export const ExpensePatch = ExpenseInput.partial().omit({ entry_method: true, raw_input: true, client_ref: true });

export interface CreateResult {
  expenses: any[];
  coins: number;
  events: { event: string; coins: number }[];
  badges: any[];
  streak: number;
  alerts: string[];
}

export async function createExpenses(userId: string, raw: unknown[], opts: { now?: Date } = {}): Promise<CreateResult> {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'Nothing to save');
  if (raw.length > 20) throw new HttpError(400, 'Save at most 20 expenses at once');
  const inputs = raw.map((r) => ExpenseInput.parse(r));
  const now = opts.now ?? new Date();
  const today = todayIST(now);
  for (const i of inputs) {
    if (i.spent_on > today) throw new HttpError(400, 'Date cannot be in the future');
    await assertCategory(userId, i.category_id);
  }
  const saved: any[] = [];
  const events: { event: string; coins: number }[] = [];
  let coins = 0;
  for (const i of inputs) {
    if (i.client_ref) {
      const dup = await q(`select * from expenses where user_id=$1 and client_ref=$2`, [userId, i.client_ref]);
      if (dup.length) {
        saved.push(dup[0]);
        continue;
      }
    }
    const [e] = await q(
      `insert into expenses(user_id,spent_on,name,amount_inr,category_id,ai_category_id,ai_confidence,necessity,ai_necessity,
         payment_mode,notes,mood,entry_method,raw_input,client_ref)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [
        userId, i.spent_on, i.name, i.amount_inr, i.category_id, i.ai_category_id ?? null, i.ai_confidence ?? null,
        i.necessity, i.ai_necessity ?? null, i.payment_mode, i.notes || null, i.mood || null, i.entry_method,
        i.raw_input || null, i.client_ref || null,
      ],
    );
    saved.push(e);
    // coins for logging (daily cap, nothing under ₹1)
    const earned = await coinsToday(userId, today, 'log_expense');
    const c = logCoinsFor(i.amount_inr, earned);
    if (c > 0) {
      await award(userId, 'log_expense', c, { refId: e.id, day: today });
      coins += c;
      events.push({ event: 'log_expense', coins: c });
    }
    // learning loop: store corrections vs the AI suggestion
    await learnFromLabel(
      userId,
      i.name,
      { category_id: i.category_id, necessity: i.necessity },
      {
        category: !!i.ai_category_id && i.ai_category_id !== i.category_id,
        necessity: !!i.ai_necessity && i.ai_necessity !== i.necessity,
      },
    );
  }
  // +5 once a day when every expense logged today carries a necessity tag
  if ((await coinsToday(userId, today, 'tag_all_day')) === 0) {
    const [t] = await q<{ total: number; tagged: number }>(
      `select count(*)::int total, count(necessity)::int tagged from expenses
       where user_id=$1 and entry_method <> 'recurring' and (created_at at time zone 'Asia/Kolkata')::date = $2::date`,
      [userId, today],
    );
    if (t.total > 0 && t.total === t.tagged) {
      await award(userId, 'tag_all_day', COINS.TAG_ALL_DAY, { day: today });
      coins += COINS.TAG_ALL_DAY;
      events.push({ event: 'tag_all_day', coins: COINS.TAG_ALL_DAY });
    }
  }
  await q(`delete from day_marks where user_id=$1 and day = any($2::date[])`, [userId, inputs.map((i) => i.spent_on)]);
  const act = await registerActivity(userId, today);
  coins += act.events.reduce((s, e) => s + e.coins, 0);
  events.push(...act.events);
  const badges = [...act.badges, ...(await checkCountBadges(userId))];
  await evaluateChallenges(userId, today);
  const alerts = await checkBudgetAlerts(userId, today);
  await paydayNudge(userId, today, inputs);
  return { expenses: saved, coins, events, badges, streak: act.streak, alerts };
}

/** 80% / 100% budget alerts (70% during payday mode). Returns alert messages for the UI. */
export async function checkBudgetAlerts(userId: string, today = todayIST()) {
  const month = monthStart(today);
  const rows = await q<{ category_id: string; name: string; emoji: string; limit_inr: number; spent: number }>(
    `select b.category_id, c.name, c.emoji, b.limit_inr,
       coalesce((select sum(e.amount_inr) from expenses e where e.user_id=b.user_id and e.category_id=b.category_id
                 and e.spent_on between $2 and $3),0) spent
     from budgets b join categories c on c.id=b.category_id where b.user_id=$1 and b.month=$2`,
    [userId, month, monthEnd(today)],
  );
  const payday = await inPaydayMode(userId, today);
  const out: string[] = [];
  for (const r of rows) {
    const st = budgetStatus(r.limit_inr, r.spent, payday ? 70 : 80);
    if (st.state === 'over') {
      const msg = `${r.emoji} ${r.name} budget crossed: ${inr(r.spent)} of ${inr(r.limit_inr)}`;
      if (await notify(userId, { kind: 'budget', title: msg, body: 'Tap to see where it went and how to recover this month.', link: '/goals', dedupe: `b100-${r.category_id}-${month}` }))
        out.push(msg);
    } else if (st.state === 'warn') {
      const msg = `${r.emoji} ${r.name} at ${Math.round(st.pct)}% of budget (${inr(st.remaining)} left)`;
      if (await notify(userId, { kind: 'budget', title: msg, body: payday ? 'Payday mode: stricter alerts for 3 days after salary.' : 'Slow down a little to stay within your limit.', link: '/goals', dedupe: `b80-${r.category_id}-${month}` }))
        out.push(msg);
    }
  }
  return out;
}

export async function inPaydayMode(userId: string, today = todayIST()) {
  const [p] = await q<{ payday: number | null; has_income: boolean; occupation: string | null }>(
    `select payday, has_income, occupation from profiles where id=$1`,
    [userId],
  );
  if (!p?.has_income || !p.payday || p.occupation === 'student') return false;
  const d = dayOfMonth(today);
  const since = d >= p.payday ? d - p.payday : null;
  return since != null && since <= 2;
}

async function paydayNudge(userId: string, today: string, inputs: ExpenseInputT[]) {
  if (!(await inPaydayMode(userId, today))) return;
  const big = inputs.find((i) => i.necessity === 'unnecessary' && i.amount_inr >= 500);
  if (big)
    await notify(userId, {
      kind: 'payday',
      title: '💸 Payday mode',
      body: `${inr(big.amount_inr)} on ${big.name} right after payday. Impulse spend peaks now — park the next want on your cool-off list?`,
      link: '/goals#wishlist',
      dedupe: `payday-${today}`,
    });
}

export interface ExpenseFilters {
  from?: string;
  to?: string;
  category?: string; // comma-separated ids
  necessity?: string;
  mode?: string;
  q?: string;
  min?: number;
  max?: number;
  limit?: number;
  offset?: number;
}

export async function listExpenses(userId: string, f: ExpenseFilters) {
  const where = ['e.user_id=$1'];
  const params: unknown[] = [userId];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (f.from && isValidISODate(f.from)) add('e.spent_on >= ?', f.from);
  if (f.to && isValidISODate(f.to)) add('e.spent_on <= ?', f.to);
  if (f.category) add('e.category_id = any(?::uuid[])', f.category.split(',').filter((x) => /^[0-9a-f-]{36}$/.test(x)));
  if (f.necessity) add('e.necessity = any(?::necessity[])', f.necessity.split(',').filter((x) => (NECESSITIES as readonly string[]).includes(x)));
  if (f.mode) add('e.payment_mode = any(?::payment_mode[])', f.mode.split(',').filter((x) => (PAYMENT_MODES as readonly string[]).includes(x)));
  if (f.q) add(`(e.name ilike ? or coalesce(e.notes,'') ilike ?)`, `%${f.q.trim()}%`);
  if (f.min != null && !Number.isNaN(f.min)) add('e.amount_inr >= ?', f.min);
  if (f.max != null && !Number.isNaN(f.max)) add('e.amount_inr <= ?', f.max);
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 1000);
  const offset = Math.max(f.offset ?? 0, 0);
  const rows = await q(
    `select e.*, c.name as category, c.emoji as category_emoji, c.colour as category_colour
     from expenses e left join categories c on c.id=e.category_id
     where ${where.join(' and ')}
     order by e.spent_on desc, e.created_at desc limit ${limit} offset ${offset}`,
    params,
  );
  const [agg] = await q<{ n: number; total: number }>(
    `select count(*)::int n, coalesce(sum(e.amount_inr),0) total from expenses e where ${where.join(' and ')}`,
    params,
  );
  return { rows, count: agg.n, total: agg.total };
}

export async function getExpense(userId: string, id: string) {
  const [e] = await q(`select * from expenses where id=$1 and user_id=$2`, [id, userId]);
  if (!e) throw new HttpError(404, 'Expense not found');
  return e;
}

export async function updateExpense(userId: string, id: string, raw: unknown, now = new Date()) {
  const patch = ExpensePatch.parse(raw);
  const cur = await getExpense(userId, id);
  if (patch.spent_on && patch.spent_on > todayIST(now)) throw new HttpError(400, 'Date cannot be in the future');
  if (patch.category_id) await assertCategory(userId, patch.category_id);
  const next = { ...cur, ...patch };
  const [e] = await q(
    `update expenses set spent_on=$3,name=$4,amount_inr=$5,category_id=$6,necessity=$7,payment_mode=$8,notes=$9,mood=$10,
       edit_count=edit_count+1, updated_at=now()
     where id=$1 and user_id=$2 returning *`,
    [id, userId, next.spent_on, next.name, next.amount_inr, next.category_id, next.necessity, next.payment_mode, next.notes ?? null, next.mood ?? null],
  );
  // learning loop: every edit of category / necessity is a labelled correction
  await learnFromLabel(
    userId,
    next.name,
    { category_id: next.category_id, necessity: next.necessity as Necessity },
    { category: !!patch.category_id && patch.category_id !== cur.category_id, necessity: !!patch.necessity && patch.necessity !== cur.necessity },
  );
  // anti-gaming: >3 edits within 5 minutes of creation → the logging coins are reversed
  if (!e.coins_revoked && shouldRevokeForEdits(e.edit_count, e.created_at, now)) {
    const [got] = await q<{ s: number }>(
      `select coalesce(sum(coins),0)::int s from coin_ledger where user_id=$1 and ref_id=$2 and event_type='log_expense'`,
      [userId, id],
    );
    if (got.s > 0) await award(userId, 'log_revoked', -got.s, { refId: id, note: 'Edited more than 3 times in 5 minutes' });
    await q(`update expenses set coins_revoked=true where id=$1`, [id]);
  }
  await checkBudgetAlerts(userId);
  return e;
}

export async function deleteExpense(userId: string, id: string) {
  const r = await q(`delete from expenses where id=$1 and user_id=$2 returning id`, [id, userId]);
  if (!r.length) throw new HttpError(404, 'Expense not found');
}

export async function bulkUpdate(userId: string, ids: string[], patch: { necessity?: Necessity; category_id?: string }) {
  if (!ids.length) return { updated: 0 };
  if (patch.category_id) await assertCategory(userId, patch.category_id);
  const rows = await q<{ id: string; name: string; category_id: string; necessity: Necessity }>(
    `select id,name,category_id,necessity from expenses where user_id=$1 and id = any($2::uuid[])`,
    [userId, ids],
  );
  for (const r of rows) {
    await q(
      `update expenses set necessity=coalesce($3::necessity,necessity), category_id=coalesce($4::uuid,category_id), updated_at=now()
       where id=$1 and user_id=$2`,
      [r.id, userId, patch.necessity ?? null, patch.category_id ?? null],
    );
    await learnFromLabel(
      userId,
      r.name,
      { category_id: patch.category_id ?? r.category_id, necessity: patch.necessity ?? r.necessity },
      { category: !!patch.category_id && patch.category_id !== r.category_id, necessity: !!patch.necessity && patch.necessity !== r.necessity },
    );
  }
  return { updated: rows.length };
}

/** Quick-add tiles: the user's most repeated (name, amount) pairs in the last 60 days. */
export async function quickAddTiles(userId: string) {
  return q(
    `select e.name, mode() within group (order by e.amount_inr) as amount_inr, mode() within group (order by e.category_id) as category_id,
            min(c.emoji) as emoji, mode() within group (order by e.necessity) as necessity,
            mode() within group (order by e.payment_mode) as payment_mode, count(*)::int n
     from expenses e join categories c on c.id=e.category_id
     where e.user_id=$1 and e.entry_method <> 'recurring' and e.spent_on >= $2 and e.amount_inr <= 2000
     group by e.name having count(*) >= 3 order by n desc limit 6`,
    [userId, addDays(todayIST(), -60)],
  );
}

export async function mostUsedMode(userId: string) {
  const [p] = await q<{ default_payment_mode: string | null }>(`select default_payment_mode from profiles where id=$1`, [userId]);
  if (p?.default_payment_mode) return p.default_payment_mode;
  const [r] = await q<{ payment_mode: string }>(
    `select payment_mode from expenses where user_id=$1 and spent_on >= $2 group by payment_mode order by count(*) desc limit 1`,
    [userId, addDays(todayIST(), -60)],
  );
  return r?.payment_mode ?? 'upi';
}

export async function topMerchants(userId: string, limit = 15) {
  const rows = await q<{ name: string }>(
    `select name from expenses where user_id=$1 and spent_on >= $2 group by name order by count(*) desc limit $3`,
    [userId, addDays(todayIST(), -90), limit],
  );
  return rows.map((r) => r.name);
}

export function toCSV(rows: any[]) {
  const head = ['Date', 'Name', 'Amount (INR)', 'Category', 'Necessity', 'Payment mode', 'Notes', 'Mood', 'Entry method'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.spent_on.split('-').reverse().join('/'), r.name, r.amount_inr, r.category, r.necessity, r.payment_mode, r.notes, r.mood, r.entry_method]
      .map(esc)
      .join(','),
  );
  return '﻿' + [head.join(','), ...lines].join('\n');
}
