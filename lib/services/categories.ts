import { q } from '../db';
import { HttpError } from '../auth';

export interface Category {
  id: string;
  name: string;
  emoji: string;
  colour: string;
  is_default: boolean;
  bucket: string;
  user_id: string | null;
}

export async function listCategories(userId: string): Promise<Category[]> {
  return q<Category>(
    `select id,name,emoji,colour,is_default,bucket,user_id from categories
     where user_id is null or user_id=$1 order by (user_id is not null), sort, name`,
    [userId],
  );
}

export async function categoryMap(userId: string) {
  const cats = await listCategories(userId);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
  return { cats, byId, byName };
}

export async function assertCategory(userId: string, id: string) {
  const r = await q(`select 1 from categories where id=$1 and (user_id is null or user_id=$2)`, [id, userId]);
  if (!r.length) throw new HttpError(400, 'Unknown category');
}

export async function createCategory(userId: string, input: { name: string; emoji: string; colour: string; bucket?: string }) {
  const name = input.name.trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Name is required');
  const clash = await q(`select 1 from categories where lower(name)=lower($1) and (user_id is null or user_id=$2)`, [name, userId]);
  if (clash.length) throw new HttpError(400, 'A category with that name already exists');
  const [c] = await q<Category>(
    `insert into categories(user_id,name,emoji,colour,is_default,bucket,sort) values($1,$2,$3,$4,false,$5,200)
     returning id,name,emoji,colour,is_default,bucket,user_id`,
    [userId, name, input.emoji || '🏷️', input.colour || '#64748b', input.bucket || 'want'],
  );
  return c;
}

export async function updateCategory(userId: string, id: string, input: { name?: string; emoji?: string; colour?: string; bucket?: string }) {
  const [c] = await q<Category>(
    `update categories set name=coalesce($3,name), emoji=coalesce($4,emoji), colour=coalesce($5,colour), bucket=coalesce($6,bucket)
     where id=$1 and user_id=$2 returning id,name,emoji,colour,is_default,bucket,user_id`,
    [id, userId, input.name?.trim() || null, input.emoji || null, input.colour || null, input.bucket || null],
  );
  if (!c) throw new HttpError(404, 'Only your own categories can be edited');
  return c;
}

export async function deleteCategory(userId: string, id: string) {
  const others = await q<{ id: string }>(`select id from categories where user_id is null and name='Others'`);
  await q(`update expenses set category_id=$3 where user_id=$1 and category_id=$2`, [userId, id, others[0]?.id]);
  const r = await q(`delete from categories where id=$1 and user_id=$2 returning id`, [id, userId]);
  if (!r.length) throw new HttpError(404, 'Only your own categories can be deleted');
}
