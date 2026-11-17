import { api } from '@/lib/auth';
import { createExpenses, listExpenses } from '@/lib/services/expenses';

export const GET = api(async (req, u) => {
  const s = new URL(req.url).searchParams;
  const num = (k: string) => (s.get(k) ? Number(s.get(k)) : undefined);
  return listExpenses(u.id, {
    from: s.get('from') || undefined, to: s.get('to') || undefined, category: s.get('category') || undefined,
    necessity: s.get('necessity') || undefined, mode: s.get('mode') || undefined, q: s.get('q') || undefined,
    min: num('min'), max: num('max'), limit: num('limit'), offset: num('offset'),
  });
});
/** Create one or more expenses; awards coins and updates the streak. */
export const POST = api(async (req, u) => {
  const body = await req.json();
  return createExpenses(u.id, Array.isArray(body) ? body : Array.isArray(body.expenses) ? body.expenses : [body]);
});
