// Savings maths (PRD §5.5). Pure functions — covered by tests/finance.test.ts.

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Avoidable spend = Σ Unnecessary + (neutralCutPct / 100) × Σ Neutral */
export function avoidableSpend(unnecessary: number, neutral: number, neutralCutPct = 25): number {
  const pct = clamp(neutralCutPct, 0, 100);
  return round2(Math.max(0, unnecessary) + (pct / 100) * Math.max(0, neutral));
}

export const START_CUT_PCT = 30;
export const CUT_STEP_PCT = 10;

/**
 * Next week's savings target (a reduction in avoidable spend, in ₹).
 *   target = min( cutPct% × avoidable this week , goal gap ÷ weeks left )
 * cutPct starts at 30%, rises by 10 points after each week the target is hit,
 * and never exceeds the user's cap (default 50%) — so users aren't set up to fail.
 * With no active goal the goal term is ignored.
 */
export function nextWeekTarget(input: {
  avoidableThisWeek: number;
  cutPct: number;
  capPct?: number;
  goalGap?: number | null;
  weeksLeft?: number | null;
}): number {
  const cap = clamp(input.capPct ?? 50, 0, 100);
  const pct = Math.min(clamp(input.cutPct, 0, 100), cap);
  const byCut = (pct / 100) * Math.max(0, input.avoidableThisWeek);
  let t = byCut;
  if (input.goalGap != null && input.goalGap > 0 && input.weeksLeft && input.weeksLeft > 0) {
    t = Math.min(byCut, input.goalGap / input.weeksLeft);
  }
  return Math.round(t);
}

/** cut % for the following week: +10 points on a hit (capped), back to start on a miss. */
export function nextCutPct(current: number, hit: boolean, capPct = 50): number {
  if (hit) return Math.min(current + CUT_STEP_PCT, capPct);
  return Math.min(START_CUT_PCT, capPct);
}

/** Weekly result: how much avoidable spend went down vs the previous week. */
export function weeklyResult(prevAvoidable: number, thisAvoidable: number, target: number) {
  const saved = round2(Math.max(0, prevAvoidable - thisAvoidable));
  const achieved = target <= 0 ? thisAvoidable <= prevAvoidable : saved >= target;
  const beatBy20 = target > 0 && saved >= target * 1.2;
  return { saved, achieved, beatBy20 };
}

/** Regret score 0–100: share of the week's spend tagged Unnecessary. Lower is better. */
export function regretScore(unnecessary: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round(clamp((unnecessary / total) * 100, 0, 100));
}

/** Hours of work an amount represents, from a monthly income (22 working days × 8 h). */
export function costInHours(amount: number, monthlyIncome: number | null | undefined): number | null {
  if (!monthlyIncome || monthlyIncome <= 0) return null;
  const hourly = monthlyIncome / (22 * 8);
  return Math.round((amount / hourly) * 10) / 10;
}

/** Future value of investing a monthly amount at an annual rate for N years (monthly compounding). */
export function opportunityCost(monthly: number, annualRate = 0.12, years = 10): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return Math.round(monthly * ((Math.pow(1 + r, n) - 1) / r));
}

/** What-if: cutting a weekly amount by pct% saves this much per week / month / year. */
export function simulateCut(weeklyAmount: number, pct: number) {
  const week = (Math.max(0, weeklyAmount) * clamp(pct, 0, 100)) / 100;
  return {
    week: Math.round(week),
    month: Math.round((week * 52) / 12),
    year: Math.round(week * 52),
  };
}

/** Weeks left until a deadline (at least 1). */
export function weeksUntil(today: string, deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const days = (Date.parse(deadline) - Date.parse(today)) / 86400000;
  return Math.max(1, Math.ceil(days / 7));
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** 50/30/20 rule adapted to necessity tags and category buckets. */
export function suggestBudgets(
  monthlyIncome: number | null,
  history: { category: string; bucket: string; avgMonthly: number; unnecessaryShare: number }[],
) {
  // Base each category on its 3-month average, trimming the avoidable part.
  const out = history.map((h) => {
    let trim = 0;
    if (h.bucket === 'want') trim = 0.5 * h.unnecessaryShare + 0.05; // cut half the regret + 5%
    else if (h.bucket === 'need') trim = 0.25 * h.unnecessaryShare;
    const suggested = Math.max(100, roundTo(h.avgMonthly * (1 - trim), 100));
    return { category: h.category, bucket: h.bucket, current: Math.round(h.avgMonthly), suggested };
  });
  if (monthlyIncome && monthlyIncome > 0) {
    // keep "wants" within 30% of income
    const wants = out.filter((o) => o.bucket === 'want');
    const wantTotal = wants.reduce((s, o) => s + o.suggested, 0);
    const wantCap = 0.3 * monthlyIncome;
    if (wantTotal > wantCap) {
      const f = wantCap / wantTotal;
      wants.forEach((o) => (o.suggested = Math.max(100, roundTo(o.suggested * f, 100))));
    }
  }
  const needs = out.filter((o) => o.bucket === 'need').reduce((s, o) => s + o.suggested, 0);
  const wants = out.filter((o) => o.bucket === 'want').reduce((s, o) => s + o.suggested, 0);
  const save = monthlyIncome ? Math.max(0, monthlyIncome - needs - wants) : null;
  return { items: out, split: { needs, wants, save, income: monthlyIncome } };
}

export function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}
