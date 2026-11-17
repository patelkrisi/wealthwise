import { api } from '@/lib/auth';
import { listExpenses, toCSV } from '@/lib/services/expenses';
import { todayIST } from '@/lib/dates';

export const GET = api(async (_req, u) => {
  const { rows } = await listExpenses(u.id, { limit: 1000 });
  let all = rows;
  for (let off = 1000; all.length === off; off += 1000) all = all.concat((await listExpenses(u.id, { limit: 1000, offset: off })).rows);
  return new Response(toCSV(all), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="wealthwise-expenses-${todayIST()}.csv"` },
  });
});
