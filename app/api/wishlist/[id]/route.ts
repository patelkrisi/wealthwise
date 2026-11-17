import { api, HttpError } from '@/lib/auth';
import { decideWishlist, deleteWishlist } from '@/lib/services/resources';

type C = { params: Promise<{ id: string }> };
export const POST = api<C>(async (req, u, { params }) => {
  const { decision, goal_id } = await req.json();
  if (!['bought', 'skipped'].includes(decision)) throw new HttpError(400, 'decision must be bought or skipped');
  return decideWishlist(u.id, (await params).id, decision, goal_id);
});
export const DELETE = api<C>(async (_req, u, { params }) => deleteWishlist(u.id, (await params).id));
