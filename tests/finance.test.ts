import { describe, expect, it } from 'vitest';
import { avoidableSpend, nextCutPct, nextWeekTarget, opportunityCost, regretScore, simulateCut, weeklyResult, costInHours } from '../lib/finance/savings';
import { budgetStatus, projectOverspend } from '../lib/finance/budget';
import { COINS, levelFor, logCoinsFor, shouldRevokeForEdits, streakCoins } from '../lib/finance/coins';
import { displayStreak, registerDay } from '../lib/finance/streak';
import { evaluateChallenge } from '../lib/finance/challenges';
import { forecastNextMonth, backtest } from '../lib/finance/forecast';
import { inr } from '../lib/format';
import { addDays, weekStart, fmtDate } from '../lib/dates';

describe('formatting', () => {
  it('uses Indian digit grouping', () => {
    expect(inr(125000)).toBe('₹1,25,000');
    expect(inr(1500)).toBe('₹1,500');
    expect(inr(12345678)).toBe('₹1,23,45,678');
    expect(inr(99.5)).toBe('₹99.50');
    expect(inr(-2000)).toBe('-₹2,000');
  });
  it('formats dates as DD/MM/YYYY and weeks start Monday', () => {
    expect(fmtDate('2026-10-20')).toBe('20/10/2026');
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday → Monday before
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
  });
});

describe('savings logic (PRD 5.5)', () => {
  it('avoidable = unnecessary + neutral cut % of neutral', () => {
    expect(avoidableSpend(1000, 2000)).toBe(1500); // default 25%
    expect(avoidableSpend(1000, 2000, 50)).toBe(2000);
    expect(avoidableSpend(0, 0)).toBe(0);
  });
  it('target = min(cut% × avoidable, goal gap ÷ weeks left), capped', () => {
    expect(nextWeekTarget({ avoidableThisWeek: 4000, cutPct: 50 })).toBe(2000);
    expect(nextWeekTarget({ avoidableThisWeek: 4000, cutPct: 80, capPct: 50 })).toBe(2000); // cap
    expect(nextWeekTarget({ avoidableThisWeek: 4000, cutPct: 50, goalGap: 6000, weeksLeft: 10 })).toBe(600);
    expect(nextWeekTarget({ avoidableThisWeek: 4000, cutPct: 30 })).toBe(1200);
  });
  it('raises the cut 10 points per hit, resets on a miss', () => {
    expect(nextCutPct(30, true)).toBe(40);
    expect(nextCutPct(50, true, 50)).toBe(50);
    expect(nextCutPct(50, false)).toBe(30);
  });
  it('weekly result compares avoidable week over week', () => {
    expect(weeklyResult(3000, 2000, 800)).toEqual({ saved: 1000, achieved: true, beatBy20: true });
    expect(weeklyResult(3000, 2500, 800)).toEqual({ saved: 500, achieved: false, beatBy20: false });
  });
  it('regret score, cost in hours, opportunity cost, what-if', () => {
    expect(regretScore(250, 1000)).toBe(25);
    expect(regretScore(0, 0)).toBe(0);
    expect(costInHours(1200, 85000)).toBeCloseTo(2.5, 1);
    expect(opportunityCost(2000, 0.12, 10)).toBeGreaterThan(450000); // ≈ ₹4.6 lakh (PRD example)
    expect(opportunityCost(2000, 0.12, 10)).toBeLessThan(470000);
    expect(simulateCut(1000, 50)).toEqual({ week: 500, month: 2167, year: 26000 });
  });
});

describe('budgets', () => {
  it('flags 80% and 100%', () => {
    expect(budgetStatus(1000, 500).state).toBe('ok');
    expect(budgetStatus(1000, 850).state).toBe('warn');
    expect(budgetStatus(1000, 1000).state).toBe('over');
  });
  it('projects overspend and the crossing date', () => {
    const p = projectOverspend({ limit: 6000, spent: 4000, today: '2026-10-15', last7Spend: 2100 });
    expect(p.over).toBeGreaterThan(0);
    expect(p.crossDate! > '2026-10-15').toBe(true);
    expect(p.crossDate! <= '2026-10-31').toBe(true);
    const ok = projectOverspend({ limit: 10000, spent: 2000, today: '2026-10-15', last7Spend: 700 });
    expect(ok.over).toBeLessThan(0);
    expect(ok.crossDate).toBeNull();
  });
});

describe('coins (PRD 4)', () => {
  it('2 coins per log, max 20/day, nothing under ₹1', () => {
    expect(logCoinsFor(50, 0)).toBe(2);
    expect(logCoinsFor(50, 19)).toBe(1);
    expect(logCoinsFor(50, 20)).toBe(0);
    expect(logCoinsFor(0.5, 0)).toBe(0);
  });
  it('streak bonuses at 7 and 30', () => {
    expect(streakCoins(3).map((e) => e.coins)).toEqual([10]);
    expect(streakCoins(7).map((e) => e.coins)).toEqual([10, 50]);
    expect(streakCoins(210).map((e) => e.event)).toEqual(['streak_day', 'streak_7', 'streak_30']);
  });
  it('levels by lifetime coins', () => {
    expect(levelFor(0).name).toBe('Paisa Starter');
    expect(levelFor(1500).name).toBe('Smart Saver');
    expect(levelFor(12000).name).toBe('Wealth Wizard');
  });
  it('revokes coins after >3 edits within 5 minutes', () => {
    const created = '2026-10-20T10:00:00Z';
    expect(shouldRevokeForEdits(4, created, new Date('2026-10-20T10:03:00Z'))).toBe(true);
    expect(shouldRevokeForEdits(3, created, new Date('2026-10-20T10:03:00Z'))).toBe(false);
    expect(shouldRevokeForEdits(5, created, new Date('2026-10-20T10:09:00Z'))).toBe(false);
    expect(COINS.FREEZE_COST).toBe(200);
  });
});

describe('streaks', () => {
  const s0 = { current: 0, longest: 0, last_log_date: null, freezes_held: 0, had_break: false };
  it('continues, breaks and uses freezes', () => {
    let s = registerDay(s0, '2026-10-01').state;
    s = registerDay(s, '2026-10-02').state;
    expect(s.current).toBe(2);
    const same = registerDay(s, '2026-10-02');
    expect(same.counted).toBe(false);
    const withFreeze = registerDay({ ...s, freezes_held: 1 }, '2026-10-04');
    expect(withFreeze.state.current).toBe(3);
    expect(withFreeze.events.frozenDays).toEqual(['2026-10-03']);
    const broken = registerDay({ ...s, current: 5 }, '2026-10-05');
    expect(broken.state.current).toBe(1);
    expect(broken.state.had_break).toBe(true);
  });
  it('displays 0 once the chain is broken', () => {
    const s = { ...s0, current: 9, last_log_date: '2026-10-10' };
    expect(displayStreak(s, '2026-10-11').current).toBe(9);
    expect(displayStreak(s, '2026-10-13').current).toBe(0);
  });
});

describe('challenges', () => {
  const ex = (d: string, name: string, amt: number, category = 'Food & Dining', necessity = 'neutral') => ({ spent_on: d, name, amount_inr: amt, category, necessity });
  it('No Swiggy Week fails on an order, completes after the window', () => {
    const rule = { type: 'no_keyword' as const, keywords: ['swiggy', 'zomato'] };
    expect(evaluateChallenge(rule, '2026-10-01', '2026-10-07', '2026-10-04', [ex('2026-10-02', 'Swiggy biryani', 300)]).status).toBe('failed');
    expect(evaluateChallenge(rule, '2026-10-01', '2026-10-07', '2026-10-04', [ex('2026-10-02', 'Chai', 20)]).status).toBe('active');
    expect(evaluateChallenge(rule, '2026-10-01', '2026-10-07', '2026-10-08', []).status).toBe('completed');
  });
  it('daily cap excludes bills', () => {
    const rule = { type: 'daily_cap' as const, cap: 500, exclude: ['Rent & Housing'] };
    expect(evaluateChallenge(rule, '2026-10-01', '2026-10-07', '2026-10-03', [ex('2026-10-02', 'Rent', 22000, 'Rent & Housing')]).status).toBe('active');
    expect(evaluateChallenge(rule, '2026-10-01', '2026-10-07', '2026-10-03', [ex('2026-10-02', 'Dinner', 600)]).status).toBe('failed');
  });
});

describe('forecast ladder (PRD 5.4)', () => {
  const cats = ['Food & Dining', 'Groceries', 'Rent & Housing', 'Gifts & Festivals'];
  it('cold start uses fixed costs + persona', () => {
    const f = forecastNextMonth({ targetMonth: '2026-07-01', history: [], categories: cats, fixed: { rent: 20000 }, persona: 'student' });
    expect(f.method).toBe('cold_start');
    expect(f.categories.find((c) => c.category === 'Rent & Housing')!.predicted).toBe(20000);
  });
  it('weighted average for 1–3 months, regression after, with an 80% range and festival lift', () => {
    const mk = (m: string, food: number) => ({ month: m, byCategory: { 'Food & Dining': food, Groceries: 5000, 'Rent & Housing': 22000, 'Gifts & Festivals': 500 } });
    const two = forecastNextMonth({ targetMonth: '2026-07-01', history: [mk('2026-05-01', 8000), mk('2026-06-01', 7000)], categories: cats, recurringMonthly: { 'Rent & Housing': 22000 } });
    expect(two.method).toBe('weighted_average');
    const six = [mk('2026-04-01', 9000), mk('2026-05-01', 8500), mk('2026-06-01', 8000), mk('2026-07-01', 7600), mk('2026-08-01', 7400), mk('2026-09-01', 7000)];
    const f = forecastNextMonth({ targetMonth: '2026-11-01', history: [...six, mk('2026-10-01', 7000)], categories: cats, recurringMonthly: { 'Rent & Housing': 22000 } });
    expect(f.method).toBe('regression');
    expect(f.total.low).toBeLessThan(f.total.predicted);
    expect(f.total.high).toBeGreaterThan(f.total.predicted);
    // Diwali in November lifts festival spend
    expect(f.categories.find((c) => c.category === 'Gifts & Festivals')!.predicted).toBeGreaterThan(600); // flat ₹500 history
    expect(f.categories.find((c) => c.category === 'Rent & Housing')!.predicted).toBeGreaterThanOrEqual(22000);
    const bt = backtest({ history: six, categories: cats });
    expect(bt.rows.length).toBe(5);
    expect(bt.mape).not.toBeNull();
  });
  it('addDays works across months', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});
