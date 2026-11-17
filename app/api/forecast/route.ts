import { api } from '@/lib/auth';
import { getForecast, overspendWarnings } from '@/lib/services/forecast';

export const GET = api(async (req, u) => {
  const m = new URL(req.url).searchParams.get('month');
  const f = await getForecast(u.id, m && /^\d{4}-\d{2}$/.test(m) ? m + '-01' : undefined);
  return { ...f, warnings: await overspendWarnings(u.id) };
});
