import { z } from 'zod';
import { q } from '../db';
import { HttpError } from '../auth';
import { addDays, addMonths, daysInMonth, isValidISODate, monthEnd, monthStart, todayIST, weekStart } from '../dates';
import { COINS } from '../finance/coins';
import { budgetStatus, projectOverspend } from '../finance/budget';
import { suggestBudgets, weeksUntil } from '../finance/savings';
import { NECESSITIES, PAYMENT_MODES, inr } from '../format';
import { assertCategory } from './categories';
import { award, grantBadge } from './gamification';
import { notify } from './notifications';
import { callTool, hasClaude, SMART_MODEL } from '../ai/claude';

const dateStr = z.string().refine(isValidISODate, 'must be a valid date');
const money = z.coerce.number().positive('must be more than 0').max(100000000);

// ---------------- income ----------------
export const IncomeInput = z.object({
  source: z.string().trim().min(1).max(80),
  kind: z.enum(['salary', 'freelance', 'pocket_money', 'refund', 'interest', 'gift', 'other']).default('other'),
  amount_inr: money,
  received_on: dateStr,
  notes: z.string().max(300).optional().nullable(),
});

export async function listIncome(userId: string, from?: string, to?: string) {
  return q(
    `select * from income where user_id=$1 and received_on between coalesce($2::date,'2000-01-01') and coalesce($3::date,'2999-01-01')
     order by received_on desc, created_at desc limit 300`,
    [userId, from ?? null, to ?? null],
  );
}
export async function createIncome(userId: string, raw: unknown) {
  const i = IncomeInput.parse(raw);
  if (i.received_on > todayIST()) throw new HttpError(400, 'Date cannot be in the future');
  const [r] = await q(`insert into income(user_id,source,kind,amount_inr,received_on,notes) values($1,$2,$3,$4,$5,$6) returning *`, [
    userId, i.source, i.kind, i.amount_inr, i.received_on, i.notes ?? null,
  ]);
  return r;
}
export async function updateIncome(userId: string, id: string, raw: unknown) {
  const i = IncomeInput.partial().parse(raw);
  const [r] = await q(
    `update income set source=coalesce($3,source), kind=coalesce($4,kind), amount_inr=coalesce($5,amount_inr),
       received_on=coalesce($6,received_on), notes=coalesce($7,notes) where id=$1 and user_id=$2 returning *`,
    [id, userId, i.source ?? null, i.kind ?? null, i.amount_inr ?? null, i.received_on ?? null, i.notes ?? null],
  );
  if (!r) throw new HttpError(404, 'Not found');
  return r;
}
export async function deleteIncome(userId: string, id: string) {
  await q(`delete from income where id=$1 and user_id=$2`, [id, userId]);
}

// ---------------- recurring ----------------
export const RecurringInput = z.object({
  name: z.string().trim().min(1).max(80),
  amount_inr: money,
  category_id: z.string().uuid(),
  necessity: z.enum(NECESSITIES).default('necessary'),
  payment_mode: z.enum(PAYMENT_MODES).default('upi'),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('monthly'),
  next_run: dateStr,
  active: z.boolean().optional(),
});

export function advance(date: string, freq: string, anchorDay?: number | null): string {
  switch (freq) {
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addDays(date, 7);
    case 'yearly': {
      const m = addMonths(date, 12);
      const d = Math.min(anchorDay ?? Number(date.slice(8, 10)), daysInMonth(m));
      return m.slice(0, 8) + String(d).padStart(2, '0');
    }
    default: {
      const m = addMonths(date, 1);
      const d = Math.min(anchorDay ?? Number(date.slice(8, 10)), daysInMonth(m));
      return m.slice(0, 8) + String(d).padStart(2, '0');
    }
  }
}

export async function listRecurring(userId: string) {
  const rows = await q<any>(
    `select r.*, c.name as category, c.emoji as category_emoji from recurring_rules r left join categories c on c.id=r.category_id
     where r.user_id=$1 order by r.active desc, r.amount_inr desc`,
    [userId],
  );
  const perMonth: Record<string, number> = { daily: 30.4, weekly: 4.35, monthly: 1, yearly: 1 / 12 };
  const monthlyTotal = rows.filter((r) => r.active).reduce((s, r) => s + r.amount_inr * perMonth[r.frequency], 0);
  return { rules: rows, monthlyTotal: Math.round(monthlyTotal) };
}
export async function createRecurring(userId: string, raw: unknown) {
  const r = RecurringInput.parse(raw);
  await assertCategory(userId, r.category_id);
  const [row] = await q(
    `insert into recurring_rules(user_id,name,amount_inr,category_id,necessity,payment_mode,frequency,next_run,anchor_day)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [userId, r.name, r.amount_inr, r.category_id, r.necessity, r.payment_mode, r.frequency, r.next_run, Number(r.next_run.slice(8, 10))],
  );
  await runRecurring(userId);
  return row;
}
export async function updateRecurring(userId: string, id: string, raw: unknown) {
  const r = RecurringInput.partial().parse(raw);
  if (r.category_id) await assertCategory(userId, r.category_id);
  const [row] = await q(
    `update recurring_rules set name=coalesce($3,name), amount_inr=coalesce($4,amount_inr), category_id=coalesce($5,category_id),
      necessity=coalesce($6::necessity,necessity), payment_mode=coalesce($7::payment_mode,payment_mode), frequency=coalesce($8,frequency),
      next_run=coalesce($9::date,next_run), anchor_day=coalesce($10,anchor_day), active=coalesce($11,active)
     where id=$1 and user_id=$2 returning *`,
    [id, userId, r.name ?? null, r.amount_inr ?? null, r.category_id ?? null, r.necessity ?? null, r.payment_mode ?? null,
     r.frequency ?? null, r.next_run ?? null, r.next_run ? Number(r.next_run.slice(8, 10)) : null, r.active ?? null],
  );
  if (!row) throw new HttpError(404, 'Not found');
  return row;
}
export async function deleteRecurring(userId: string, id: string) {
  await q(`delete from recurring_rules where id=$1 and user_id=$2`, [id, userId]);
}

/** Create every due occurrence of the user's recurring rules (idempotent). */
export async function runRecurring(userId: string, today = todayIST()) {
  const rules = await q<any>(`select * from recurring_rules where user_id=$1 and active and next_run <= $2`, [userId, today]);
  let created = 0;
  for (const r of rules) {
    let next = r.next_run as string;
    let guard = 0;
    while (next <= today && guard++ < 400) {
      await q(
        `insert into expenses(user_id,spent_on,name,amount_inr,category_id,necessity,payment_mode,entry_method,is_recurring,recurring_id,notes,created_at)
         values($1,$2,$3,$4,$5,$6,$7,'recurring',true,$8,'Auto-logged recurring payment', ($2::date + time '09:00') at time zone 'Asia/Kolkata')`,
        [userId, next, r.name, r.amount_inr, r.category_id, r.necessity, r.payment_mode, r.id],
      );
      created++;
      next = advance(next, r.frequency, r.anchor_day);
    }
    await q(`update recurring_rules set next_run=$2 where id=$1`, [r.id, next]);
  }
  return created;
}

// ---------------- budgets ----------------
export async function budgetOverview(userId: string, month = monthStart(todayIST())) {
  const today = todayIST();
  const isCurrent = month === monthStart(today);
  const end = monthEnd(month);
  const rows = await q<any>(
    `select b.id, b.category_id, b.limit_inr, c.name as category, c.emoji, c.colour,
       coalesce((select sum(e.amount_inr) from expenses e where e.user_id=b.user_id and e.category_id=b.category_id and e.spent_on between $2 and $3),0) spent,
       coalesce((select sum(e.amount_inr) from expenses e where e.user_id=b.user_id and e.category_id=b.category_id and e.spent_on between $4 and $3),0) last7
     from budgets b join categories c on c.id=b.category_id where b.user_id=$1 and b.month=$2 order by b.limit_inr desc`,
    [userId, month, isCurrent ? today : end, addDays(isCurrent ? today : end, -6)],
  );
  const items = rows.map((r) => {
    const st = budgetStatus(r.limit_inr, r.spent);
    const proj = isCurrent ? projectOverspend({ limit: r.limit_inr, spent: r.spent, today, last7Spend: r.last7 }) : null;
    return { ...r, ...st, projection: proj };
  });
  const totalLimit = items.reduce((s, i) => s + i.limit_inr, 0);
  const totalSpent = items.reduce((s, i) => s + i.spent, 0);
  return { month, items, totalLimit, totalSpent };
}

export async function upsertBudget(userId: string, raw: unknown) {
  const b = z.object({ category_id: z.string().uuid(), month: dateStr.optional(), limit_inr: money }).parse(raw);
  await assertCategory(userId, b.category_id);
  const month = monthStart(b.month ?? todayIST());
  const [row] = await q(
    `insert into budgets(user_id,category_id,month,limit_inr) values($1,$2,$3,$4)
     on conflict(user_id,category_id,month) do update set limit_inr=excluded.limit_inr returning *`,
    [userId, b.category_id, month, b.limit_inr],
  );
  return row;
}
export async function deleteBudget(userId: string, id: string) {
  await q(`delete from budgets where id=$1 and user_id=$2`, [id, userId]);
}

/** AI budget suggestion: numbers from code (50/30/20 adapted to tags), one-line rationale from Claude if configured. */
export async function suggestBudgetsFor(userId: string) {
  const today = todayIST();
  const from = addMonths(today, -3);
  const to = addDays(monthStart(today), -1);
  const rows = await q<any>(
    `select c.id as category_id, c.name as category, c.bucket, c.emoji,
       sum(e.amount_inr) total, sum(e.amount_inr) filter (where e.necessity='unnecessary') unnec,
       count(distinct date_trunc('month', e.spent_on::timestamp))::int months
     from expenses e join categories c on c.id=e.category_id
     where e.user_id=$1 and e.spent_on between $2 and $3 group by c.id, c.name, c.bucket, c.emoji`,
    [userId, from, to],
  );
  const [p] = await q<any>(`select monthly_income, has_income from profiles where id=$1`, [userId]);
  const nMonths = Math.max(1, Math.min(3, Math.max(0, ...rows.map((r) => r.months))));
  const hist = rows
    .filter((r) => !['Investments & Savings'].includes(r.category))
    .map((r) => ({ category: r.category, bucket: r.bucket, avgMonthly: r.total / nMonths, unnecessaryShare: r.total ? (r.unnec || 0) / r.total : 0 }));
  const s = suggestBudgets(p?.has_income ? p.monthly_income : null, hist);
  const byName = new Map(rows.map((r) => [r.category, r]));
  const items = s.items
    .map((i) => ({ ...i, category_id: byName.get(i.category)?.category_id, emoji: byName.get(i.category)?.emoji }))
    .sort((a, b) => b.suggested - a.suggested);
  let note = `Based on your last ${nMonths} month${nMonths > 1 ? 's' : ''}: needs ${inr(s.split.needs)}, wants ${inr(s.split.wants)}` +
    (s.split.save != null ? `, leaving ${inr(s.split.save)} to save each month.` : '.');
  if (hasClaude() && items.length) {
    try {
      const r = await callTool<{ note: string }>({
        model: SMART_MODEL,
        system: 'You explain budget suggestions for an Indian personal-finance app. Use only the numbers given. One or two short sentences, friendly, no investment advice.',
        user: JSON.stringify({ split: s.split, top: items.slice(0, 6).map((i) => ({ c: i.category, now: i.current, suggested: i.suggested })) }),
        tool: { name: 'explain', description: 'Explain the suggestion', input_schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] } },
        maxTokens: 200,
      });
      if (r.note) note = r.note;
    } catch {}
  }
  return { items, split: s.split, note, months: nMonths };
}

export async function applySuggestedBudgets(userId: string, items: { category_id: string; limit_inr: number }[]) {
  for (const i of items) await upsertBudget(userId, { category_id: i.category_id, limit_inr: i.limit_inr });
}

// ---------------- goals ----------------
export const GoalInput = z.object({
  name: z.string().trim().min(1).max(60),
  target_inr: money,
  saved_inr: z.coerce.number().min(0).default(0),
  deadline: dateStr.optional().nullable(),
  icon: z.string().max(8).default('🎯'),
});

export async function listGoals(userId: string) {
  const today = todayIST();
  const rows = await q<any>(`select * from goals where user_id=$1 and status <> 'archived' order by status, deadline nulls last, created_at`, [userId]);
  return rows.map((g) => {
    const gap = Math.max(0, g.target_inr - g.saved_inr);
    const weeks = weeksUntil(today, g.deadline);
    return { ...g, gap, weeksLeft: weeks, neededPerWeek: weeks ? Math.ceil(gap / weeks) : null, pct: Math.min(100, (g.saved_inr / g.target_inr) * 100) };
  });
}
export async function createGoal(userId: string, raw: unknown) {
  const g = GoalInput.parse(raw);
  const [row] = await q(`insert into goals(user_id,name,target_inr,saved_inr,deadline,icon) values($1,$2,$3,$4,$5,$6) returning *`, [
    userId, g.name, g.target_inr, g.saved_inr, g.deadline ?? null, g.icon,
  ]);
  await maybeCompleteGoal(userId, row.id);
  return row;
}
export async function updateGoal(userId: string, id: string, raw: unknown) {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const g = GoalInput.partial().extend({ status: z.enum(['active', 'archived']).optional() }).parse(raw);
  const [cur] = await q<any>(`select * from goals where id=$1 and user_id=$2`, [id, userId]);
  if (!cur) throw new HttpError(404, 'Goal not found');
  const clearDeadline = 'deadline' in body && !body.deadline;
  if (g.deadline && g.deadline < todayIST()) throw new HttpError(400, 'Pick a date in the future');
  // Raising the target of a finished goal re-opens it.
  const reopen = cur.status === 'completed' && g.target_inr != null && g.target_inr > cur.saved_inr;
  const [row] = await q(
    `update goals set name=coalesce($3,name), target_inr=coalesce($4,target_inr),
       deadline=case when $8::boolean then null else coalesce($5::date,deadline) end, icon=coalesce($6,icon),
       status=case when $9::boolean then 'active' else coalesce($7,status) end,
       completed_at=case when $9::boolean then null else completed_at end
     where id=$1 and user_id=$2 returning *`,
    [id, userId, g.name ?? null, g.target_inr ?? null, g.deadline ?? null, g.icon ?? null, g.status ?? null, clearDeadline, reopen],
  );
  await maybeCompleteGoal(userId, id);
  return row;
}
export async function contributeGoal(userId: string, id: string, amount: number, at?: string) {
  if (!(amount > 0)) throw new HttpError(400, 'Amount must be more than 0');
  const [row] = await q(`update goals set saved_inr = saved_inr + $3 where id=$1 and user_id=$2 and status='active' returning *`, [id, userId, amount]);
  if (!row) throw new HttpError(404, 'Goal not found or already completed');
  const done = await maybeCompleteGoal(userId, id, at);
  return { goal: row, completed: done };
}
export async function deleteGoal(userId: string, id: string) {
  await q(`delete from goals where id=$1 and user_id=$2`, [id, userId]);
}
async function maybeCompleteGoal(userId: string, id: string, at?: string) {
  const [g] = await q<any>(`select * from goals where id=$1 and user_id=$2`, [id, userId]);
  if (!g || g.status !== 'active' || g.saved_inr < g.target_inr) return false;
  await q(`update goals set status='completed', completed_at=coalesce($2::timestamptz, now()) where id=$1`, [id, at ?? null]);
  // Coins once per goal, even if its target is later edited and it completes again.
  const paid = await q(`select 1 from coin_ledger where user_id=$1 and event_type='goal_complete' and ref_id=$2`, [userId, id]);
  if (!paid.length) await award(userId, 'goal_complete', COINS.GOAL_COMPLETE, { refId: id, note: g.name, at, day: at?.slice(0, 10) });
  await grantBadge(userId, 'goal_getter', at);
  await notify(userId, { kind: 'goal', title: `${g.icon} Goal reached: ${g.name}!`, body: `You saved ${inr(g.target_inr)}. +${COINS.GOAL_COMPLETE} coins.`, link: '/goals', dedupe: `goal-${id}`, at });
  return true;
}

// ---------------- wishlist (24-hour / 7-day cool-off) ----------------
export async function listWishlist(userId: string) {
  const rows = await q<any>(
    `select w.*, c.name as category, c.emoji as category_emoji from wishlist w left join categories c on c.id=w.category_id
     where w.user_id=$1 order by (w.status='waiting') desc, w.created_at desc limit 50`,
    [userId],
  );
  const [s] = await q<{ saved: number; n: number }>(
    `select coalesce(sum(amount_inr),0) saved, count(*)::int n from wishlist where user_id=$1 and status='skipped'`,
    [userId],
  );
  const now = Date.now();
  return {
    items: rows.map((r) => ({ ...r, ready: new Date(r.cool_off_until).getTime() <= now })),
    savedBySkipping: s.saved,
    skippedCount: s.n,
  };
}
export async function addWishlist(userId: string, raw: unknown) {
  const w = z
    .object({ item: z.string().trim().min(1).max(80), amount_inr: money, category_id: z.string().uuid().optional().nullable(), cool_off: z.enum(['24h', '7d']).default('24h') })
    .parse(raw);
  if (w.category_id) await assertCategory(userId, w.category_id);
  const hours = w.cool_off === '7d' ? 24 * 7 : 24;
  const [row] = await q(
    `insert into wishlist(user_id,item,amount_inr,category_id,cool_off_until) values($1,$2,$3,$4, now() + ($5 || ' hours')::interval) returning *`,
    [userId, w.item, w.amount_inr, w.category_id ?? null, String(hours)],
  );
  return row;
}
export async function decideWishlist(userId: string, id: string, decision: 'bought' | 'skipped', goalId?: string | null) {
  const [w] = await q<any>(`select * from wishlist where id=$1 and user_id=$2`, [id, userId]);
  if (!w) throw new HttpError(404, 'Not found');
  if (w.status !== 'waiting') throw new HttpError(400, 'Already decided');
  if (decision === 'bought' && new Date(w.cool_off_until).getTime() > Date.now())
    throw new HttpError(400, 'Still cooling off — come back when the timer ends');
  await q(`update wishlist set status=$3, decided_at=now() where id=$1 and user_id=$2`, [id, userId, decision]);
  let coins = 0;
  if (decision === 'skipped') {
    // anti-gaming: coins only once the item has waited 24h+, max 5 rewarded skips a week
    const waited = Date.now() - new Date(w.created_at).getTime() >= 24 * 3600 * 1000;
    const [wk] = await q<{ n: number }>(
      `select count(*)::int n from coin_ledger where user_id=$1 and event_type='wishlist_skip' and event_day >= $2`,
      [userId, weekStart(todayIST())],
    );
    if (waited && wk.n < 5) {
      await award(userId, 'wishlist_skip', COINS.WISHLIST_SKIP, { refId: id, note: w.item });
      coins = COINS.WISHLIST_SKIP;
    }
    if (goalId) await contributeGoal(userId, goalId, w.amount_inr);
    const [s] = await q<{ n: number }>(`select count(*)::int n from wishlist where user_id=$1 and status='skipped'`, [userId]);
    if (s.n >= 3) await grantBadge(userId, 'wishlist_warrior');
  }
  return { coins, item: w };
}
export async function deleteWishlist(userId: string, id: string) {
  await q(`delete from wishlist where id=$1 and user_id=$2`, [id, userId]);
}

// ---------------- kirana list ----------------
export async function listKirana(userId: string) {
  return q(`select * from kirana_items where user_id=$1 order by done, created_at`, [userId]);
}
export async function addKirana(userId: string, raw: unknown) {
  const k = z.object({ item: z.string().trim().min(1).max(60), qty: z.string().max(20).optional().nullable(), est_inr: z.coerce.number().min(0).optional().nullable() }).parse(raw);
  const [r] = await q(`insert into kirana_items(user_id,item,qty,est_inr) values($1,$2,$3,$4) returning *`, [userId, k.item, k.qty ?? null, k.est_inr ?? null]);
  return r;
}
export async function updateKirana(userId: string, id: string, raw: any) {
  await q(`update kirana_items set done=coalesce($3,done) where id=$1 and user_id=$2`, [id, userId, typeof raw?.done === 'boolean' ? raw.done : null]);
}
export async function deleteKirana(userId: string, id?: string) {
  if (id) await q(`delete from kirana_items where id=$1 and user_id=$2`, [id, userId]);
  else await q(`delete from kirana_items where user_id=$1 and done`, [userId]);
}
