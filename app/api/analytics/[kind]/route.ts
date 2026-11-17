import { api, HttpError } from '@/lib/auth';
import { breakdown, dailyTrend, heatmap, microSpend, monthOverMonth, moodPattern, periodRange, periodTotals, regretWeekly, incomeTotal } from '@/lib/services/analytics';
import { monthStart, todayIST, monthEnd } from '@/lib/dates';
import { q } from '@/lib/db';
import { tools } from '@/lib/services/assistant';

type C = { params: Promise<{ kind: string }> };
export const GET = api<C>(async (req, u, { params }) => {
  const { kind } = await params;
  const s = new URL(req.url).searchParams;
  const month = s.get('month') && /^\d{4}-\d{2}$/.test(s.get('month')!) ? s.get('month')! + '-01' : monthStart(todayIST());
  const to = month === monthStart(todayIST()) ? todayIST() : monthEnd(month);
  const [p] = await q<any>(`select neutral_cut_pct, advanced_analytics from profiles where id=$1`, [u.id]);
  switch (kind) {
    case 'breakdown': {
      const r = s.get('period') ? periodRange(s.get('period')!) : { from: month, to };
      return breakdown(u.id, r.from, r.to, (s.get('by') as any) || 'category');
    }
    case 'overview':
      return {
        totals: await periodTotals(u.id, month, to, p.neutral_cut_pct),
        income: await incomeTotal(u.id, month, to),
        categories: await breakdown(u.id, month, to, 'category'),
        necessity: await breakdown(u.id, month, to, 'necessity'),
        modes: await breakdown(u.id, month, to, 'payment_mode'),
        weekdays: await breakdown(u.id, month, to, 'weekday'),
        trend: await dailyTrend(u.id, month),
        mom: await monthOverMonth(u.id, 6),
      };
    case 'trend':
      return dailyTrend(u.id, month);
    case 'heatmap':
      return heatmap(u.id, Number(s.get('days') || 120));
    case 'modes':
      return breakdown(u.id, month, to, 'payment_mode');
    case 'regret':
      return { weeks: await regretWeekly(u.id, 10) };
    case 'advanced':
      return { unlocked: p.advanced_analytics, micro: await microSpend(u.id), mood: await moodPattern(u.id) };
    case 'whatif':
      return tools.simulate_cut(u.id, { target: s.get('target') || 'unnecessary', pct: Number(s.get('pct') || 50) });
    default:
      throw new HttpError(404, 'Unknown analytics');
  }
});
