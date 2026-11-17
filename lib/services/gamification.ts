import { q } from '../db';
import { HttpError } from '../auth';
import { COINS, EVENT_LABELS, levelFor, streakCoins } from '../finance/coins';
import { displayStreak, registerDay, type StreakState } from '../finance/streak';
import { evaluateChallenge, challengeWindow, type ChallengeRule } from '../finance/challenges';
import { addDays, hourIST, todayIST } from '../dates';
import { notify } from './notifications';

export interface AwardOpts {
  refId?: string | null;
  day?: string; // IST day the event belongs to
  note?: string;
  at?: string; // ISO timestamp (used by the demo seeder for history)
  silent?: boolean;
}

/** All coin changes go through here: one append-only ledger row, then the cached balance/level. */
export async function award(userId: string, event: string, coins: number, opts: AwardOpts = {}) {
  if (!coins) return { coins: 0, levelUp: null as null | { level: number; name: string } };
  const day = opts.day ?? todayIST();
  await q(
    `insert into coin_ledger(user_id,event_type,coins,ref_id,event_day,note,created_at)
     values($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()))`,
    [userId, event, coins, opts.refId ?? null, day, opts.note ?? null, opts.at ?? null],
  );
  const [before] = await q<{ level: number }>(`select level from profiles where id=$1`, [userId]);
  const [tot] = await q<{ balance: number; lifetime: number }>(
    `select coalesce(sum(coins),0)::int balance,
            coalesce(sum(coins) filter (where event_type <> 'redeem'),0)::int lifetime
     from coin_ledger where user_id=$1`,
    [userId],
  );
  const lvl = levelFor(tot.lifetime);
  await q(`update profiles set coin_balance=$2, lifetime_coins=$3, level=$4 where id=$1`, [userId, tot.balance, tot.lifetime, lvl.level]);
  let levelUp = null;
  if (before && lvl.level > before.level) {
    levelUp = { level: lvl.level, name: lvl.name };
    if (!opts.silent)
      await notify(userId, {
        kind: 'level',
        title: `Level up! You're now a ${lvl.name} 🎉`,
        body: `You've earned ${tot.lifetime.toLocaleString('en-IN')} coins in total. Keep going!`,
        link: '/rewards',
        dedupe: `level-${lvl.level}`,
        at: opts.at,
      });
  }
  return { coins, levelUp };
}

export async function coinsToday(userId: string, day: string, event: string) {
  const [r] = await q<{ s: number }>(
    `select coalesce(sum(coins),0)::int s from coin_ledger where user_id=$1 and event_day=$2 and event_type=$3`,
    [userId, day, event],
  );
  return r.s;
}

export async function grantBadge(userId: string, badgeId: string, at?: string) {
  const rows = await q<{ badge_id: string }>(
    `insert into user_badges(user_id,badge_id,earned_at) values($1,$2,coalesce($3::timestamptz, now())) on conflict do nothing returning badge_id`,
    [userId, badgeId, at ?? null],
  );
  if (!rows.length) return null;
  const [b] = await q<{ id: string; name: string; emoji: string; description: string }>(`select id,name,emoji,description from badges where id=$1`, [badgeId]);
  await notify(userId, {
    kind: 'badge',
    title: `${b.emoji} Badge unlocked: ${b.name}`,
    body: b.description,
    link: '/rewards',
    dedupe: `badge-${badgeId}`,
    at,
  });
  return b;
}

export async function getStreak(userId: string): Promise<StreakState> {
  const [s] = await q<StreakState>(`select current, longest, last_log_date, freezes_held, had_break from streaks where user_id=$1`, [userId]);
  if (s) return s;
  await q(`insert into streaks(user_id) values($1) on conflict do nothing`, [userId]);
  return { current: 0, longest: 0, last_log_date: null, freezes_held: 0, had_break: false };
}

/**
 * A qualifying action happened on `day` (an expense logged, or "no spend" marked).
 * Updates the streak, awards streak coins and streak badges. Returns what happened for the UI.
 */
export async function registerActivity(userId: string, day: string, at?: string) {
  const firstAt = at ?? new Date().toISOString();
  await q(`insert into activity_days(user_id,day,first_at) values($1,$2,$3) on conflict do nothing`, [userId, day, firstAt]);
  const state = await getStreak(userId);
  const r = registerDay(state, day);
  const events: { event: string; coins: number }[] = [];
  const badges: any[] = [];
  if (!r.counted) return { streak: state.current, events, badges, frozenDays: [] as string[] };
  for (const d of r.events.frozenDays) {
    await q(`insert into activity_days(user_id,day,first_at,frozen) values($1,$2,$3,true) on conflict do nothing`, [userId, d, firstAt]);
  }
  await q(
    `update streaks set current=$2, longest=$3, last_log_date=$4, freezes_held=$5, had_break=$6 where user_id=$1`,
    [userId, r.state.current, r.state.longest, r.state.last_log_date, r.state.freezes_held, r.state.had_break],
  );
  for (const e of streakCoins(r.state.current)) {
    await award(userId, e.event, e.coins, { day, at, refId: `streak-${day}`, note: `Streak day ${r.state.current}` });
    events.push(e);
  }
  if (r.state.current >= 7) badges.push(await grantBadge(userId, 'streak_7', at));
  if (r.state.current >= 30) badges.push(await grantBadge(userId, 'streak_30', at));
  if (r.state.had_break && r.state.current >= 3) {
    badges.push(await grantBadge(userId, 'comeback_kid', at));
  }
  // Early Bird: first activity before 10am IST on 7 different days
  const [eb] = await q<{ n: number }>(
    `select count(*)::int n from activity_days where user_id=$1 and not frozen
       and extract(hour from (first_at at time zone 'Asia/Kolkata')) < 10`,
    [userId],
  );
  if (eb.n >= 7) badges.push(await grantBadge(userId, 'early_bird', at));
  return { streak: r.state.current, events, badges: badges.filter(Boolean), frozenDays: r.events.frozenDays };
}

export async function markNoSpend(userId: string, day = todayIST()) {
  const spent = await q(`select 1 from expenses where user_id=$1 and spent_on=$2 and entry_method <> 'recurring' limit 1`, [userId, day]);
  if (spent.length) throw new HttpError(400, "You've already logged spending today");
  await q(`insert into day_marks(user_id,day,kind) values($1,$2,'no_spend') on conflict do nothing`, [userId, day]);
  return registerActivity(userId, day);
}

export async function gamificationStatus(userId: string) {
  const today = todayIST();
  const [p] = await q<{ coin_balance: number; lifetime_coins: number; level: number }>(
    `select coin_balance, lifetime_coins, level from profiles where id=$1`,
    [userId],
  );
  const s = await getStreak(userId);
  const disp = displayStreak(s, today);
  const lvl = levelFor(p.lifetime_coins);
  const loggedToday = s.last_log_date === today;
  return {
    coins: p.coin_balance,
    lifetime: p.lifetime_coins,
    level: lvl,
    streak: { current: disp.current, longest: s.longest, freezes: s.freezes_held, atRisk: disp.atRisk || (!loggedToday && hourIST() >= 18 && disp.current > 0), loggedToday },
  };
}

export async function streakCalendar(userId: string, days = 35) {
  const today = todayIST();
  const from = addDays(today, -days + 1);
  const rows = await q<{ day: string; frozen: boolean }>(
    `select day, frozen from activity_days where user_id=$1 and day >= $2 order by day`,
    [userId, from],
  );
  const marks = await q<{ day: string }>(`select day from day_marks where user_id=$1 and day >= $2`, [userId, from]);
  const map = new Map(rows.map((r) => [r.day, r.frozen ? 'frozen' : 'logged']));
  for (const m of marks) if (map.get(m.day) !== 'frozen') map.set(m.day, 'no_spend');
  const out: { day: string; state: string }[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) out.push({ day: d, state: map.get(d) || 'none' });
  return out;
}

export async function badgesFor(userId: string) {
  return q(
    `select b.id, b.name, b.description, b.emoji, ub.earned_at
     from badges b left join user_badges ub on ub.badge_id=b.id and ub.user_id=$1 order by b.sort`,
    [userId],
  );
}

export async function ledger(userId: string, limit = 60) {
  const rows = await q<{ id: string; event_type: string; coins: number; note: string | null; created_at: string; event_day: string }>(
    `select id, event_type, coins, note, created_at, event_day from coin_ledger where user_id=$1 order by created_at desc limit $2`,
    [userId, limit],
  );
  return rows.map((r) => ({ ...r, label: EVENT_LABELS[r.event_type] || r.event_type }));
}

// ---------- rewards store ----------
export async function storeItems(userId: string) {
  const items = await q<any>(`select * from rewards where type <> 'theme' order by sort`);
  const [p] = await q<any>(`select accent, avatar_frame, advanced_analytics, extra_icons, coin_balance from profiles where id=$1`, [userId]);
  const owned = await q<{ reward_id: string }>(`select distinct reward_id from redemptions where user_id=$1`, [userId]);
  const ownedSet = new Set(owned.map((o) => o.reward_id));
  const s = await getStreak(userId);
  return items.map((r: any) => {
    const isOwned = r.type !== 'freeze' && ownedSet.has(r.id);
    const active =
      (r.type === 'theme' && p.accent === r.value) ||
      (r.type === 'frame' && p.avatar_frame === r.value) ||
      (r.type === 'analytics' && p.advanced_analytics) ||
      (r.type === 'icons' && p.extra_icons);
    return {
      ...r,
      owned: isOwned,
      active,
      held: r.type === 'freeze' ? s.freezes_held : undefined,
      affordable: p.coin_balance >= r.cost_coins,
    };
  });
}

export async function redeem(userId: string, rewardId: string) {
  const [r] = await q<any>(`select * from rewards where id=$1`, [rewardId]);
  if (!r) throw new HttpError(404, 'Unknown reward');
  if (!r.available) throw new HttpError(400, 'This reward is coming soon');
  const [p] = await q<{ coin_balance: number }>(`select coin_balance from profiles where id=$1`, [userId]);
  const owned = await q(`select 1 from redemptions where user_id=$1 and reward_id=$2`, [userId, rewardId]);
  if (r.type === 'freeze') {
    const s = await getStreak(userId);
    if (s.freezes_held >= COINS.FREEZE_MAX) throw new HttpError(400, `You can hold at most ${COINS.FREEZE_MAX} streak freezes`);
  } else if (owned.length) {
    // already owned: just apply it again for free
    await applyReward(userId, r);
    return { applied: true, charged: 0 };
  }
  if (p.coin_balance < r.cost_coins) throw new HttpError(400, `You need ${r.cost_coins - p.coin_balance} more coins`);
  await q(`insert into redemptions(user_id,reward_id) values($1,$2)`, [userId, rewardId]);
  await award(userId, 'redeem', -r.cost_coins, { refId: rewardId, note: r.name });
  await applyReward(userId, r);
  return { applied: true, charged: r.cost_coins };
}

async function applyReward(userId: string, r: any) {
  switch (r.type) {
    case 'freeze':
      await q(`update streaks set freezes_held = least(freezes_held + 1, $2) where user_id=$1`, [userId, COINS.FREEZE_MAX]);
      break;
    case 'theme':
      await q(`update profiles set accent=$2 where id=$1`, [userId, r.value]);
      break;
    case 'frame':
      await q(`update profiles set avatar_frame=$2 where id=$1`, [userId, r.value]);
      break;
    case 'analytics':
      await q(`update profiles set advanced_analytics=true where id=$1`, [userId]);
      break;
    case 'icons':
      await q(`update profiles set extra_icons=true where id=$1`, [userId]);
      break;
  }
}

// ---------- challenges ----------
export async function listChallenges(userId: string) {
  await evaluateChallenges(userId);
  const all = await q<any>(`select * from challenges order by reward`);
  const mine = await q<any>(
    `select uc.*, c.name, c.emoji, c.reward, c.duration_days, c.description from user_challenges uc join challenges c on c.id=uc.challenge_id
     where uc.user_id=$1 order by uc.started_on desc limit 30`,
    [userId],
  );
  const activeIds = new Set(mine.filter((m: any) => m.status === 'active').map((m: any) => m.challenge_id));
  return {
    active: mine.filter((m: any) => m.status === 'active'),
    history: mine.filter((m: any) => m.status !== 'active').slice(0, 10),
    available: all.filter((c: any) => !activeIds.has(c.id)),
  };
}

export async function joinChallenge(userId: string, challengeId: string, today = todayIST()) {
  const [c] = await q<any>(`select * from challenges where id=$1`, [challengeId]);
  if (!c) throw new HttpError(404, 'Unknown challenge');
  const active = await q(`select 1 from user_challenges where user_id=$1 and challenge_id=$2 and status='active'`, [userId, challengeId]);
  if (active.length) throw new HttpError(400, 'You are already doing this challenge');
  const w = challengeWindow(today, c.duration_days, c.rule_json as ChallengeRule);
  const [uc] = await q(
    `insert into user_challenges(user_id,challenge_id,status,progress,started_on,ends_on) values($1,$2,'active',0,$3,$4) returning *`,
    [userId, challengeId, w.start, w.end],
  );
  return uc;
}

export async function abandonChallenge(userId: string, id: string) {
  await q(`update user_challenges set status='abandoned' where id=$1 and user_id=$2 and status='active'`, [id, userId]);
}

export async function evaluateChallenges(userId: string, today = todayIST(), at?: string) {
  const active = await q<any>(
    `select uc.*, c.rule_json, c.reward, c.name, c.emoji from user_challenges uc join challenges c on c.id=uc.challenge_id
     where uc.user_id=$1 and uc.status='active'`,
    [userId],
  );
  const completed: any[] = [];
  for (const uc of active) {
    if (uc.started_on > today) continue;
    const exps = await q<any>(
      `select e.spent_on, e.name, e.amount_inr, c.name as category, e.necessity
       from expenses e left join categories c on c.id=e.category_id
       where e.user_id=$1 and e.spent_on between $2 and $3`,
      [userId, uc.started_on, uc.ends_on],
    );
    const r = evaluateChallenge(uc.rule_json, uc.started_on, uc.ends_on, today, exps);
    if (r.status === 'active') {
      await q(`update user_challenges set progress=$2 where id=$1`, [uc.id, r.progress]);
    } else if (r.status === 'failed') {
      await q(`update user_challenges set status='failed', progress=$2 where id=$1`, [uc.id, r.progress]);
      await notify(userId, {
        kind: 'challenge',
        title: `${uc.emoji} ${uc.name} ended`,
        body: `Broken by ${r.violation}. Try again — every attempt builds the habit.`,
        link: '/rewards',
        dedupe: `challenge-fail-${uc.id}`,
        at,
      });
    } else {
      await q(`update user_challenges set status='completed', progress=$2, completed_at=coalesce($3::timestamptz, now()) where id=$1`, [uc.id, r.progress, at ?? null]);
      await award(userId, 'challenge_complete', uc.reward, { refId: uc.id, note: uc.name, at, day: at ? at.slice(0, 10) : today });
      await grantBadge(userId, 'challenger', at);
      await notify(userId, {
        kind: 'challenge',
        title: `${uc.emoji} Challenge complete: ${uc.name}`,
        body: `+${uc.reward} coins. Nicely done!`,
        link: '/rewards',
        dedupe: `challenge-done-${uc.id}`,
        at,
      });
      completed.push(uc);
    }
  }
  return completed;
}

/** Count-based badges checked after logging. */
export async function checkCountBadges(userId: string, at?: string) {
  const [c] = await q<{ total: number; voice: number; text: number }>(
    `select count(*)::int total,
            count(*) filter (where entry_method='voice')::int voice,
            count(*) filter (where entry_method='text')::int text
     from expenses where user_id=$1 and entry_method <> 'recurring'`,
    [userId],
  );
  const out = [];
  if (c.total >= 1) out.push(await grantBadge(userId, 'first_log', at));
  if (c.total >= 100) out.push(await grantBadge(userId, 'expenses_100', at));
  if (c.voice >= 10) out.push(await grantBadge(userId, 'voice_logger', at));
  if (c.text >= 10) out.push(await grantBadge(userId, 'sentence_smith', at));
  return out.filter(Boolean);
}
