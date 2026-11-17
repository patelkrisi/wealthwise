import { api } from '@/lib/auth';
import { weekDetail, weeklyHistory, weeklyStatus } from '@/lib/services/savings';
import { latestInsights } from '@/lib/services/insights';

export const GET = api(async (req, u) => {
  const ws = new URL(req.url).searchParams.get('week');
  if (ws) return { detail: await weekDetail(u.id, ws), insights: (await latestInsights(u.id)).find((i: any) => i.week_start === ws) ?? null };
  return { current: await weeklyStatus(u.id), history: await weeklyHistory(u.id), insights: await latestInsights(u.id) };
});
