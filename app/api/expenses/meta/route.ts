import { api } from '@/lib/auth';
import { mostUsedMode, quickAddTiles } from '@/lib/services/expenses';
import { listCategories } from '@/lib/services/categories';
import { q } from '@/lib/db';

export const GET = api(async (_req, u) => {
  const [p] = await q<any>(`select extra_icons from profiles where id=$1`, [u.id]);
  return { defaultMode: await mostUsedMode(u.id), quickAdd: await quickAddTiles(u.id), categories: await listCategories(u.id), extraIcons: p?.extra_icons ?? false };
});
