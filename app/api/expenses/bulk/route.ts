import { z } from 'zod';
import { api } from '@/lib/auth';
import { bulkUpdate, deleteExpense } from '@/lib/services/expenses';

export const POST = api(async (req, u) => {
  const b = z.object({ ids: z.array(z.string().uuid()).max(500), necessity: z.enum(['necessary', 'neutral', 'unnecessary']).optional(), category_id: z.string().uuid().optional(), delete: z.boolean().optional() }).parse(await req.json());
  if (b.delete) {
    for (const id of b.ids) await deleteExpense(u.id, id).catch(() => {});
    return { deleted: b.ids.length };
  }
  return bulkUpdate(u.id, b.ids, { necessity: b.necessity, category_id: b.category_id });
});
