import { api } from '@/lib/auth';
import { budgetOverview, upsertBudget } from '@/lib/services/resources';

export const GET = api(async (req, u) => {
  const m = new URL(req.url).searchParams.get('month');
  return budgetOverview(u.id, m && /^\d{4}-\d{2}$/.test(m) ? m + '-01' : undefined);
});
export const POST = api(async (req, u) => upsertBudget(u.id, await req.json()));
