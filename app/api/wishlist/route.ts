import { api } from '@/lib/auth';
import { addWishlist, listWishlist } from '@/lib/services/resources';

export const GET = api(async (_req, u) => listWishlist(u.id));
export const POST = api(async (req, u) => addWishlist(u.id, await req.json()));
