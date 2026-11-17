import { api } from '@/lib/auth';
import { applySuggestedBudgets, suggestBudgetsFor } from '@/lib/services/resources';

export const GET = api(async (_req, u) => suggestBudgetsFor(u.id));
export const POST = api(async (req, u) => {
  const { items } = await req.json();
  await applySuggestedBudgets(u.id, (items || []).filter((i: any) => i.category_id && i.limit_inr > 0));
  return { ok: true };
});
