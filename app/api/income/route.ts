import { api } from '@/lib/auth';
import { createIncome, listIncome } from '@/lib/services/resources';

export const GET = api(async (req, u) => {
  const s = new URL(req.url).searchParams;
  return listIncome(u.id, s.get('from') || undefined, s.get('to') || undefined);
});
export const POST = api(async (req, u) => createIncome(u.id, await req.json()));
