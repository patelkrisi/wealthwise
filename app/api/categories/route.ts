import { api } from '@/lib/auth';
import { createCategory, listCategories } from '@/lib/services/categories';

export const GET = api(async (_req, u) => listCategories(u.id));
export const POST = api(async (req, u) => createCategory(u.id, await req.json()));
