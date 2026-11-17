import { addDays, diffDays, eachDay, weekday } from '../dates';

export interface ChallengeExpense {
  spent_on: string;
  name: string;
  amount_inr: number;
  category: string | null;
  necessity: string | null;
}

export type ChallengeRule =
  | { type: 'no_keyword'; keywords: string[] }
  | { type: 'daily_cap'; cap: number; exclude?: string[] }
  | { type: 'no_necessity'; necessity: string }
  | { type: 'category_cap'; category: string; cap: number }
  | { type: 'no_category'; category: string }
  | { type: 'no_spend_weekend'; exclude?: string[] };

export function matchesKeyword(name: string, kw: string) {
  const n = ` ${name.toLowerCase().replace(/[^a-z0-9.' ]+/g, ' ')} `;
  return n.includes(` ${kw.toLowerCase()} `) || n.includes(` ${kw.toLowerCase()}`);
}

/**
 * Evaluate a challenge window. Completed once the window has fully passed with no violation.
 */
export function evaluateChallenge(
  rule: ChallengeRule,
  startedOn: string,
  endsOn: string,
  today: string,
  expenses: ChallengeExpense[],
): { status: 'active' | 'completed' | 'failed'; progress: number; violation?: string } {
  const until = today < endsOn ? today : endsOn;
  const inWindow = expenses.filter((e) => e.spent_on >= startedOn && e.spent_on <= until);
  const duration = diffDays(endsOn, startedOn) + 1;
  const progress = Math.max(0, Math.min(duration, diffDays(until, startedOn) + 1));
  let violation: string | undefined;

  switch (rule.type) {
    case 'no_keyword': {
      const hit = inWindow.find((e) => rule.keywords.some((k) => matchesKeyword(e.name, k)));
      if (hit) violation = `${hit.name} on ${hit.spent_on}`;
      break;
    }
    case 'daily_cap': {
      const byDay = new Map<string, number>();
      for (const e of inWindow) {
        if (rule.exclude?.includes(e.category || '')) continue;
        byDay.set(e.spent_on, (byDay.get(e.spent_on) || 0) + e.amount_inr);
      }
      for (const [d, v] of byDay) if (v > rule.cap) { violation = `₹${Math.round(v)} on ${d}`; break; }
      break;
    }
    case 'no_necessity': {
      const hit = inWindow.find((e) => e.necessity === rule.necessity);
      if (hit) violation = `${hit.name} on ${hit.spent_on}`;
      break;
    }
    case 'category_cap': {
      const sum = inWindow.filter((e) => e.category === rule.category).reduce((s, e) => s + e.amount_inr, 0);
      if (sum > rule.cap) violation = `₹${Math.round(sum)} on ${rule.category}`;
      break;
    }
    case 'no_category': {
      const hit = inWindow.find((e) => e.category === rule.category);
      if (hit) violation = `${hit.name} on ${hit.spent_on}`;
      break;
    }
    case 'no_spend_weekend': {
      const hit = inWindow.find((e) => [0, 6].includes(weekday(e.spent_on)) && !rule.exclude?.includes(e.category || ''));
      if (hit) violation = `${hit.name} on ${hit.spent_on}`;
      break;
    }
  }
  if (violation) return { status: 'failed', progress, violation };
  if (today > endsOn) return { status: 'completed', progress: duration };
  return { status: 'active', progress };
}

export function challengeWindow(today: string, durationDays: number, rule: ChallengeRule) {
  if (rule.type === 'no_spend_weekend') {
    // next Saturday (or today if Saturday) through Sunday
    const wd = weekday(today);
    const sat = wd === 6 ? today : wd === 0 ? addDays(today, 6) : addDays(today, 6 - wd);
    return { start: sat, end: addDays(sat, 1) };
  }
  return { start: today, end: addDays(today, durationDays - 1) };
}

export function windowDays(start: string, end: string) {
  return eachDay(start, end);
}
