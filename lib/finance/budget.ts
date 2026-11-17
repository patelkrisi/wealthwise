import { addDays, dayOfMonth, daysInMonth, monthStart } from '../dates';

export type BudgetState = 'ok' | 'warn' | 'over';

export function budgetStatus(limit: number, spent: number, warnPct = 80) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const state: BudgetState = pct >= 100 ? 'over' : pct >= warnPct ? 'warn' : 'ok';
  return { pct: Math.round(pct * 10) / 10, state, remaining: Math.round((limit - spent) * 100) / 100 };
}

/**
 * Overspend early warning.
 * Pace blends the month-to-date average with the last-7-day average (recent behaviour matters more).
 * Returns the projected month-end spend and, if it crosses the limit, the date it will cross.
 */
export function projectOverspend(input: {
  limit: number;
  spent: number;
  today: string; // IST date within the month
  last7Spend?: number;
}) {
  const day = dayOfMonth(input.today);
  const dim = daysInMonth(input.today);
  const mtdPace = input.spent / day;
  // last7Spend always covers 7 calendar days (it can reach back into last month), so it is divided by 7.
  const recentPace = input.last7Spend != null ? input.last7Spend / 7 : mtdPace;
  const pace = 0.5 * mtdPace + 0.5 * recentPace;
  const remainingDays = dim - day;
  const projected = Math.round(input.spent + pace * remainingDays);
  const over = Math.round(projected - input.limit);
  let crossDate: string | null = null;
  if (input.spent >= input.limit) {
    crossDate = null; // already crossed
  } else if (pace > 0 && over > 0) {
    const daysToCross = Math.ceil((input.limit - input.spent) / pace);
    crossDate = addDays(input.today, daysToCross);
    if (crossDate > addDays(monthStart(input.today), dim - 1)) crossDate = null;
  }
  return { projected, over, crossDate, pace: Math.round(pace), alreadyOver: input.spent >= input.limit };
}
