import { LEVELS } from '../seed/catalog';

/** Coin rules (PRD §4). Coins reward behaviour, never spend amounts. */
export const COINS = {
  LOG_EXPENSE: 2,
  LOG_DAILY_MAX: 20,
  TAG_ALL_DAY: 5,
  STREAK_DAY: 10,
  STREAK_7: 50,
  STREAK_30: 300,
  WEEKLY_TARGET: 100,
  WEEKLY_BEAT_20: 50,
  BUDGET_KEPT: 75,
  BUDGET_KEPT_MAX_CATEGORIES: 5,
  GOAL_COMPLETE: 500,
  WISHLIST_SKIP: 25,
  MONTHLY_REPORT: 30,
  WELCOME: 50,
  FREEZE_COST: 200,
  FREEZE_MAX: 2,
} as const;

export const EVENT_LABELS: Record<string, string> = {
  log_expense: 'Logged an expense',
  log_revoked: 'Coins reversed (anti-gaming)',
  tag_all_day: 'Tagged every expense today',
  streak_day: 'Daily streak',
  streak_7: '7-day streak bonus',
  streak_30: '30-day streak bonus',
  weekly_target: 'Hit weekly savings target',
  weekly_beat_20: 'Beat weekly target by 20%+',
  budget_kept: 'Stayed within a budget',
  goal_complete: 'Completed a savings goal',
  challenge_complete: 'Completed a challenge',
  wishlist_skip: 'Skipped a cool-off item',
  monthly_report: 'Reviewed monthly report',
  welcome: 'Welcome bonus',
  redeem: 'Redeemed in store',
  no_spend_day: 'Marked a no-spend day',
};

/** How many logging coins an expense earns given what was already earned today. */
export function logCoinsFor(amount: number, earnedTodayFromLogging: number): number {
  if (amount < 1) return 0; // anti-gaming: under ₹1 earns nothing
  const room = COINS.LOG_DAILY_MAX - earnedTodayFromLogging;
  return Math.max(0, Math.min(COINS.LOG_EXPENSE, room));
}

/** Streak coins earned on the day the streak reaches `current`. */
export function streakCoins(current: number): { event: string; coins: number }[] {
  const out: { event: string; coins: number }[] = [{ event: 'streak_day', coins: COINS.STREAK_DAY }];
  if (current > 0 && current % 7 === 0) out.push({ event: 'streak_7', coins: COINS.STREAK_7 });
  if (current > 0 && current % 30 === 0) out.push({ event: 'streak_30', coins: COINS.STREAK_30 });
  return out;
}

export function levelFor(lifetime: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (lifetime >= l.min) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1) || null;
  const progress = next ? (lifetime - cur.min) / (next.min - cur.min) : 1;
  return { ...cur, next, progress: Math.max(0, Math.min(1, progress)), toNext: next ? next.min - lifetime : 0 };
}

/** Anti-gaming: an expense edited more than 3 times within 5 minutes of creation loses its coins. */
export function shouldRevokeForEdits(editCount: number, createdAt: string, now: Date): boolean {
  const withinWindow = now.getTime() - new Date(createdAt).getTime() <= 5 * 60 * 1000;
  return withinWindow && editCount > 3;
}
