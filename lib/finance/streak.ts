import { addDays, diffDays } from '../dates';

export interface StreakState {
  current: number;
  longest: number;
  last_log_date: string | null;
  freezes_held: number;
  had_break: boolean;
}

/**
 * Register a qualifying day (logged an expense, or marked "no spend").
 * Missed days in between are covered by streak freezes (one per day) when available.
 */
export function registerDay(state: StreakState, day: string) {
  const s = { ...state };
  const events: { type: 'continued' | 'started' | 'restarted' | 'same_day'; frozenDays: string[] } = {
    type: 'started',
    frozenDays: [],
  };
  if (s.last_log_date === day) {
    events.type = 'same_day';
    return { state: s, events, counted: false };
  }
  if (s.last_log_date && day < s.last_log_date) {
    // backfilled activity for an older day doesn't change the streak
    events.type = 'same_day';
    return { state: s, events, counted: false };
  }
  if (!s.last_log_date) {
    s.current = 1;
    events.type = 'started';
  } else {
    const gap = diffDays(day, s.last_log_date) - 1; // missed days
    if (gap <= 0) {
      s.current = s.current + 1;
      events.type = 'continued';
    } else if (gap <= s.freezes_held) {
      s.freezes_held -= gap;
      for (let i = 1; i <= gap; i++) events.frozenDays.push(addDays(s.last_log_date, i));
      s.current = s.current + 1;
      events.type = 'continued';
    } else {
      if (s.current >= 3) s.had_break = true;
      s.current = 1;
      events.type = 'restarted';
    }
  }
  s.last_log_date = day;
  s.longest = Math.max(s.longest, s.current);
  return { state: s, events, counted: true };
}

/** Streak as displayed today: 0 if the chain is already broken beyond what freezes can cover. */
export function displayStreak(state: StreakState, today: string): { current: number; atRisk: boolean } {
  if (!state.last_log_date) return { current: 0, atRisk: false };
  const missed = diffDays(today, state.last_log_date) - 1; // full days missed before today
  if (missed < 0) return { current: state.current, atRisk: false }; // logged today
  if (missed <= state.freezes_held) return { current: state.current, atRisk: true };
  return { current: 0, atRisk: false };
}
