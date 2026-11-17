import { q } from '../db';
import { addMonths, fmtMonth, monthEnd, monthStart, todayIST, hourIST, addDays } from '../dates';
import { costInHours, opportunityCost } from '../finance/savings';
import { periodTotals } from './analytics';
import { quickAddTiles, inPaydayMode } from './expenses';
import { gamificationStatus } from './gamification';
import { weeklyStatus } from './savings';
import { budgetOverview } from './resources';
import { getForecast, projectMonth, warningsFrom } from './forecast';
import { insightOfTheDay } from './insights';
import { getProfile } from './profile';
import { upcomingFestivals } from '../finance/festivals';

export async function dashboard(userId: string) {
  const today = todayIST();
  const month = monthStart(today);
  const p = await getProfile(userId);
  // Independent reads run side by side instead of one after another.
  const [totals, budgets, recent, [due], [rec], forecast, g, last30, [largestUnnec], week, insight, quickAdd, paydayMode, marks] = await Promise.all([
    periodTotals(userId, month, today, p.neutral_cut_pct),
    budgetOverview(userId, month),
    q(
      `select e.*, c.name as category, c.emoji as category_emoji, c.colour as category_colour from expenses e
       left join categories c on c.id=e.category_id where e.user_id=$1 order by e.spent_on desc, e.created_at desc limit 5`,
      [userId],
    ),
    q<{ s: number }>(
      `select coalesce(sum(amount_inr),0) s from recurring_rules where user_id=$1 and active and frequency='monthly' and next_run between $2 and $3`,
      [userId, addDays(today, 1), monthEnd(today)],
    ),
    q<{ s: number }>(`select coalesce(sum(amount_inr),0) s from expenses where user_id=$1 and is_recurring and spent_on between $2 and $3`, [userId, month, today]),
    getForecast(userId, addMonths(month, 1)),
    gamificationStatus(userId),
    // monthly avoidable over last 30 days → opportunity cost nudge
    periodTotals(userId, addDays(today, -29), today, p.neutral_cut_pct),
    q<any>(
      `select name, amount_inr from expenses where user_id=$1 and spent_on >= $2 and necessity='unnecessary' order by amount_inr desc limit 1`,
      [userId, addDays(today, -6)],
    ),
    weeklyStatus(userId, today),
    insightOfTheDay(userId, today),
    quickAddTiles(userId),
    inPaydayMode(userId, today),
    q(`select 1 from day_marks where user_id=$1 and day=$2`, [userId, today]),
  ]);
  const budgetedSpent = budgets.items.reduce((s: number, i: any) => s + i.spent, 0);
  const showMoneyNudges = p.has_income && p.occupation !== 'student';
  const h = hourIST();
  return {
    profile: { name: p.name, occupation: p.occupation, has_income: p.has_income, onboarded: p.onboarded, avatar_frame: p.avatar_frame, is_demo: p.is_demo },
    greeting: h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening',
    today,
    monthLabel: fmtMonth(month),
    month: {
      spent: totals.total,
      count: totals.n,
      budget: budgets.totalLimit,
      projected: Math.round(rec.s + projectMonth(totals.total - rec.s, today, due.s)),
      budgetedSpent,
      fixedSpent: rec.s,
      avoidable: totals.avoidable,
      unnecessary: totals.unnecessary,
      regret: totals.regret,
    },
    week,
    gamification: g,
    forecast: { month: forecast.monthLabel, total: forecast.total, explanation: forecast.explanation, festivals: forecast.festivals },
    insight,
    recent,
    quickAdd,
    warnings: warningsFrom(budgets.items).slice(0, 2),
    budgetsNear: budgets.items.filter((i: any) => i.state !== 'ok').slice(0, 3),
    paydayMode,
    nudges: showMoneyNudges
      ? {
          opportunity: { monthlyAvoidable: Math.round(last30.avoidable), in10y: opportunityCost(Math.round(last30.avoidable), 0.12, 10) },
          costInHours: largestUnnec ? { name: largestUnnec.name, amount: largestUnnec.amount_inr, hours: costInHours(largestUnnec.amount_inr, p.monthly_income) } : null,
        }
      : null,
    festivals: upcomingFestivals(today, 2),
    noSpendToday: marks.length > 0,
  };
}
