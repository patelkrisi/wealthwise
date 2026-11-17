import { q } from '../db';
import { addDays, diffDays, todayIST, weekStart } from '../dates';
import { COINS } from '../finance/coins';
import { avoidableSpend, nextCutPct, nextWeekTarget, START_CUT_PCT, weeklyResult, weeksUntil } from '../finance/savings';
import { inr } from '../format';
import { award, grantBadge } from './gamification';
import { notify } from './notifications';
import { contributeGoal } from './resources';

async function profileSettings(userId: string) {
  const [p] = await q<{ neutral_cut_pct: number; savings_cap_pct: number; weekly_goal_id: string | null }>(
    `select neutral_cut_pct, savings_cap_pct, weekly_goal_id from profiles where id=$1`,
    [userId],
  );
  return p;
}

export async function weekAvoidable(userId: string, ws: string, until?: string, neutralCut?: number) {
  const cut = neutralCut ?? (await profileSettings(userId)).neutral_cut_pct;
  const to = until ?? addDays(ws, 6);
  const [r] = await q<{ unnecessary: number; neutral: number; total: number }>(
    `select coalesce(sum(amount_inr) filter (where necessity='unnecessary'),0) unnecessary,
            coalesce(sum(amount_inr) filter (where necessity='neutral'),0) neutral,
            coalesce(sum(amount_inr),0) total
     from expenses where user_id=$1 and spent_on between $2 and $3`,
    [userId, ws, to],
  );
  return { ...r, avoidable: avoidableSpend(r.unnecessary, r.neutral, cut) };
}

async function targetGoal(userId: string) {
  const p = await profileSettings(userId);
  const goals = await q<any>(`select * from goals where user_id=$1 and status='active' order by deadline nulls last, created_at`, [userId]);
  return goals.find((g) => g.id === p.weekly_goal_id) || goals[0] || null;
}

/** Week row for `ws`, creating it (with a target derived from the previous week) if needed. */
async function ensureWeekRow(userId: string, ws: string) {
  const [row] = await q<any>(`select * from weekly_savings where user_id=$1 and week_start=$2`, [userId, ws]);
  if (row) return row;
  const p = await profileSettings(userId);
  const prev = await weekAvoidable(userId, addDays(ws, -7), undefined, p.neutral_cut_pct);
  const goal = await targetGoal(userId);
  const target = nextWeekTarget({
    avoidableThisWeek: prev.avoidable,
    cutPct: START_CUT_PCT,
    capPct: p.savings_cap_pct,
    goalGap: goal ? goal.target_inr - goal.saved_inr : null,
    weeksLeft: goal ? weeksUntil(ws, goal.deadline) : null,
  });
  const [created] = await q<any>(
    `insert into weekly_savings(user_id,week_start,prev_avoidable_inr,target_inr,cut_pct,goal_id) values($1,$2,$3,$4,$5,$6)
     on conflict(user_id,week_start) do update set week_start=excluded.week_start returning *`,
    [userId, ws, prev.avoidable, target, START_CUT_PCT, goal?.id ?? null],
  );
  return created;
}

/** Current week's live savings status for Home. */
export async function weeklyStatus(userId: string, today = todayIST()) {
  const ws = weekStart(today);
  const row = await ensureWeekRow(userId, ws);
  const cur = await weekAvoidable(userId, ws, today);
  const allowance = Math.max(0, row.prev_avoidable_inr - row.target_inr); // avoidable you can spend and still hit target
  const goal = row.goal_id ? (await q<any>(`select id,name,icon from goals where id=$1`, [row.goal_id]))[0] : null;
  return {
    weekStart: ws,
    daysLeft: 6 - diffDays(today, ws),
    avoidable: cur.avoidable,
    unnecessary: cur.unnecessary,
    neutral: cur.neutral,
    total: cur.total,
    prevAvoidable: row.prev_avoidable_inr,
    target: row.target_inr,
    cutPct: row.cut_pct,
    allowance,
    onTrack: cur.avoidable <= allowance,
    projectedSaving: Math.max(0, row.prev_avoidable_inr - cur.avoidable),
    goal,
  };
}

/** Sunday job: close week `ws` — result, coins, goal jar, next week's target. Idempotent. */
export async function closeWeek(userId: string, ws: string, opts: { at?: string } = {}) {
  const row = await ensureWeekRow(userId, ws);
  if (row.closed) return row;
  const p = await profileSettings(userId);
  const thisW = await weekAvoidable(userId, ws, undefined, p.neutral_cut_pct);
  const res = weeklyResult(row.prev_avoidable_inr, thisW.avoidable, row.target_inr);
  const endDay = addDays(ws, 6);
  const at = opts.at ?? undefined;
  const hasData = thisW.total > 0 || row.prev_avoidable_inr > 0;
  const achieved = hasData && res.achieved;
  await q(
    `update weekly_savings set avoidable_inr=$3, achieved=$4, saved_inr=$5, closed=true where user_id=$1 and week_start=$2`,
    [userId, ws, thisW.avoidable, achieved, achieved ? res.saved : 0],
  );
  if (achieved) {
    await award(userId, 'weekly_target', COINS.WEEKLY_TARGET, { refId: `week-${ws}`, day: endDay, at });
    if (res.beatBy20) await award(userId, 'weekly_beat_20', COINS.WEEKLY_BEAT_20, { refId: `week-${ws}`, day: endDay, at });
    await grantBadge(userId, 'target_hitter', at);
    if (row.goal_id && res.saved > 0) {
      try {
        await contributeGoal(userId, row.goal_id, res.saved, at);
      } catch {}
    }
  }
  if (thisW.total > 0 && thisW.unnecessary === 0) await grantBadge(userId, 'zero_regret', at);

  // next week's target
  const goal = await targetGoal(userId);
  const cut = nextCutPct(row.cut_pct, achieved, p.savings_cap_pct);
  const target = nextWeekTarget({
    avoidableThisWeek: thisW.avoidable,
    cutPct: cut,
    capPct: p.savings_cap_pct,
    goalGap: goal ? goal.target_inr - goal.saved_inr : null,
    weeksLeft: goal ? weeksUntil(addDays(ws, 7), goal.deadline) : null,
  });
  await q(
    `insert into weekly_savings(user_id,week_start,prev_avoidable_inr,target_inr,cut_pct,goal_id) values($1,$2,$3,$4,$5,$6)
     on conflict(user_id,week_start) do update set prev_avoidable_inr=excluded.prev_avoidable_inr, target_inr=excluded.target_inr,
       cut_pct=excluded.cut_pct, goal_id=excluded.goal_id where weekly_savings.closed=false`,
    [userId, addDays(ws, 7), thisW.avoidable, target, cut, goal?.id ?? null],
  );
  if (hasData)
    await notify(userId, {
      kind: 'weekly',
      title: achieved ? `🎉 Week closed: you saved ${inr(res.saved)}` : '📊 Your week is in',
      body: achieved
        ? `Avoidable spend fell from ${inr(row.prev_avoidable_inr)} to ${inr(thisW.avoidable)}. +${COINS.WEEKLY_TARGET + (res.beatBy20 ? COINS.WEEKLY_BEAT_20 : 0)} coins. Next target: ${inr(target)}.`
        : `Avoidable spend was ${inr(thisW.avoidable)} (target was a ${inr(row.target_inr)} cut). Next week's target: ${inr(target)}.`,
      link: `/weekly?week=${ws}`,
      dedupe: `week-${ws}`,
      at,
    });
  return { ...row, avoidable_inr: thisW.avoidable, achieved, saved_inr: res.saved };
}

export async function weeklyHistory(userId: string, limit = 12) {
  return q<any>(
    `select ws.*, g.name as goal_name, g.icon as goal_icon from weekly_savings ws left join goals g on g.id=ws.goal_id
     where ws.user_id=$1 and ws.closed order by week_start desc limit $2`,
    [userId, limit],
  );
}

export async function weekDetail(userId: string, ws: string) {
  const [row] = await q<any>(`select * from weekly_savings where user_id=$1 and week_start=$2`, [userId, ws]);
  const [next] = await q<any>(`select * from weekly_savings where user_id=$1 and week_start=$2`, [userId, addDays(ws, 7)]);
  const [coins] = await q<{ s: number }>(
    `select coalesce(sum(coins),0)::int s from coin_ledger where user_id=$1 and event_day between $2 and $3 and event_type <> 'redeem'`,
    [userId, ws, addDays(ws, 6)],
  );
  const stats = await weekAvoidable(userId, ws);
  return { week: row, nextWeek: next, coinsEarned: coins.s, stats };
}
