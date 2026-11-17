// Next-month spend forecast (PRD §5.4). Pure statistics — no LLM touches these numbers.
import { addMonths, daysInMonth } from '../dates';
import { festivalMultiplier, festivalsInMonth } from './festivals';

export interface MonthHistory {
  month: string; // YYYY-MM-01 (completed months only)
  byCategory: Record<string, number>;
}

export interface ForecastInput {
  targetMonth: string; // YYYY-MM-01
  history: MonthHistory[];
  categories: string[];
  recurringMonthly?: Record<string, number>;
  fixed?: { rent?: number; emi?: number; subscriptions?: number };
  persona?: string | null; // student | professional | homemaker | ...
}

export interface CategoryForecast {
  category: string;
  predicted: number;
  low: number;
  high: number;
  lastMonth: number;
}

export interface ForecastResult {
  month: string;
  method: 'cold_start' | 'weighted_average' | 'regression';
  modelVersion: string;
  total: { predicted: number; low: number; high: number };
  categories: CategoryForecast[];
  drivers: { category: string; delta: number; reason: string }[];
  festivals: string[];
}

const PERSONA_AVG: Record<string, Record<string, number>> = {
  student: {
    'Food & Dining': 3500, Groceries: 1200, Transport: 1200, Shopping: 1500, 'Entertainment & Subscriptions': 600,
    'Bills & Utilities': 500, 'Personal Care': 400, Education: 1000, Others: 500,
  },
  professional: {
    'Food & Dining': 6000, Groceries: 4000, Transport: 3000, Shopping: 4000, 'Entertainment & Subscriptions': 1200,
    'Bills & Utilities': 2500, 'Health & Medical': 1000, 'Personal Care': 1000, Others: 1000,
  },
  homemaker: {
    Groceries: 9000, 'Food & Dining': 3000, 'Bills & Utilities': 4000, Transport: 3000, Education: 4000,
    'Health & Medical': 2000, Shopping: 3000, Others: 1500,
  },
};

const r100 = (n: number) => Math.max(0, Math.round(n / 10) * 10);

function quantile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** de-seasonalised value of a category in a month */
function deseason(h: MonthHistory, cat: string) {
  const v = h.byCategory[cat] ?? 0;
  const m = festivalMultiplier(h.month, cat);
  const dimScale = 30.4 / daysInMonth(h.month);
  return (v / m) * dimScale;
}

/** base prediction for month index t using up to 3 lags (weights 3:2:1, newest highest) */
function lagBlend(hist: MonthHistory[], t: number, cat: string): number | null {
  const lags: number[] = [];
  for (let k = 1; k <= 3 && t - k >= 0; k++) lags.push(deseason(hist[t - k], cat));
  if (!lags.length) return null;
  const w = [3, 2, 1].slice(0, lags.length);
  const sw = w.reduce((a, b) => a + b, 0);
  return lags.reduce((s, v, i) => s + v * w[i], 0) / sw;
}

function reseason(v: number, month: string, cat: string) {
  return v * festivalMultiplier(month, cat) * (daysInMonth(month) / 30.4);
}

export function forecastNextMonth(input: ForecastInput): ForecastResult {
  const { targetMonth, categories } = input;
  const hist = [...input.history].sort((a, b) => a.month.localeCompare(b.month));
  const n = hist.length;
  const fest = festivalsInMonth(targetMonth).map((f) => f.name);
  const recurring = input.recurringMonthly || {};
  const last = hist[n - 1];

  const cats: CategoryForecast[] = [];
  let method: ForecastResult['method'];
  let totalVarianceHalf = 0;

  if (n === 0) {
    method = 'cold_start';
    const persona = PERSONA_AVG[input.persona || ''] || PERSONA_AVG.professional;
    for (const c of categories) {
      let base = persona[c] ?? 0;
      if (c === 'Rent & Housing') base = input.fixed?.rent ?? 0;
      if (c === 'EMI & Loans') base = input.fixed?.emi ?? 0;
      if (c === 'Entertainment & Subscriptions') base = Math.max(base, input.fixed?.subscriptions ?? 0);
      base = Math.max(base * festivalMultiplier(targetMonth, c), recurring[c] ?? 0);
      if (base <= 0) continue;
      const fixedish = ['Rent & Housing', 'EMI & Loans'].includes(c);
      const w = fixedish ? 0.02 : 0.25;
      cats.push({ category: c, predicted: r100(base), low: r100(base * (1 - w)), high: r100(base * (1 + w)), lastMonth: 0 });
      totalVarianceHalf += (base * w) ** 2;
    }
  } else {
    method = n <= 3 ? 'weighted_average' : 'regression';
    for (const c of categories) {
      const anySpend = hist.some((h) => (h.byCategory[c] ?? 0) > 0) || (recurring[c] ?? 0) > 0;
      if (!anySpend) continue;

      // base: weighted moving average of de-seasonalised months (most recent weighted higher)
      let pred = lagBlend(hist, n, c) ?? 0;

      let errs: number[] = [];
      if (method === 'regression') {
        // fit pred_t = beta * base_t on past months (ridge-shrunk toward 1), plus same-month-last-year
        let sxy = 0;
        let sxx = 0;
        for (let t = 3; t < n; t++) {
          const b = lagBlend(hist, t, c) ?? 0;
          const y = deseason(hist[t], c);
          sxy += b * y;
          sxx += b * b;
        }
        const lambda = sxx * 0.5 + 1; // shrinkage strength
        const beta = Math.min(1.5, Math.max(0.6, (sxy + lambda * 1) / (sxx + lambda)));
        pred = pred * beta;
        const sameMonthLastYear = hist.find((h) => h.month === addMonths(targetMonth, -12));
        if (sameMonthLastYear) pred = 0.75 * pred + 0.25 * deseason(sameMonthLastYear, c);
        // backtest errors for the range
        for (let t = 3; t < n; t++) {
          const b = (lagBlend(hist, t, c) ?? 0) * beta;
          const actual = deseason(hist[t], c);
          if (b > 0) errs.push(actual / b - 1);
        }
      } else {
        for (let t = 1; t < n; t++) {
          const b = lagBlend(hist, t, c) ?? 0;
          const actual = deseason(hist[t], c);
          if (b > 0) errs.push(actual / b - 1);
        }
      }

      pred = reseason(pred, targetMonth, c);
      const rec = recurring[c] ?? 0;
      pred = Math.max(pred, rec);

      // 80% range from the spread of past errors (10th–90th percentile), with sane minimums
      errs = errs.filter((e) => Number.isFinite(e)).sort((a, b) => a - b);
      let lo = errs.length >= 3 ? quantile(errs, 0.1) : -0.15;
      let hi = errs.length >= 3 ? quantile(errs, 0.9) : 0.15;
      const fixedShare = pred > 0 ? rec / pred : 0;
      const minW = fixedShare > 0.9 ? 0.02 : 0.08;
      lo = Math.min(lo, -minW);
      hi = Math.max(hi, minW);
      lo = Math.max(lo, -0.6);
      hi = Math.min(hi, 0.8);
      if (pred <= 0) continue;
      cats.push({
        category: c,
        predicted: r100(pred),
        low: r100(Math.max(rec, pred * (1 + lo))),
        high: r100(pred * (1 + hi)),
        lastMonth: Math.round(last?.byCategory[c] ?? 0),
      });
      totalVarianceHalf += ((pred * (hi - lo)) / 2) ** 2;
    }
  }

  cats.sort((a, b) => b.predicted - a.predicted);
  const total = cats.reduce((s, c) => s + c.predicted, 0);
  const half = Math.max(Math.sqrt(totalVarianceHalf), total * 0.05);
  const drivers = cats
    .map((c) => {
      const delta = c.predicted - c.lastMonth;
      const fx = festivalsInMonth(targetMonth).filter((f) => (f.effects[c.category] ?? 1) > 1).map((f) => f.name);
      let reason: string;
      if (fx.length && delta > 0) reason = `${fx.join(' & ')} next month`;
      else if ((recurring[c.category] ?? 0) >= c.predicted * 0.8) reason = 'mostly recurring payments';
      else if (delta > 0) reason = 'trending up over recent months';
      else if (delta < 0) reason = 'trending down over recent months';
      else reason = 'steady';
      return { category: c.category, delta: Math.round(delta), reason };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  return {
    month: targetMonth,
    method,
    modelVersion: `ww-forecast-1.${method === 'cold_start' ? 0 : method === 'weighted_average' ? 1 : 2}`,
    total: { predicted: r100(total), low: r100(total - half), high: r100(total + half) },
    categories: cats,
    drivers,
    festivals: fest,
  };
}

/** Rolling backtest of the total forecast: returns per-month predicted vs actual and MAPE. */
export function backtest(input: Omit<ForecastInput, 'targetMonth' | 'history'> & { history: MonthHistory[] }) {
  const hist = [...input.history].sort((a, b) => a.month.localeCompare(b.month));
  const rows: { month: string; predicted: number; actual: number; ape: number }[] = [];
  for (let t = 1; t < hist.length; t++) {
    const f = forecastNextMonth({ ...input, targetMonth: hist[t].month, history: hist.slice(0, t) });
    const actual = Object.values(hist[t].byCategory).reduce((s, v) => s + v, 0);
    if (actual <= 0) continue;
    rows.push({ month: hist[t].month, predicted: f.total.predicted, actual: Math.round(actual), ape: Math.abs(f.total.predicted - actual) / actual });
  }
  const mape = rows.length ? rows.reduce((s, r) => s + r.ape, 0) / rows.length : null;
  return { rows, mape };
}
