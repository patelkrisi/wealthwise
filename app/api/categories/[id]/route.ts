import { api } from '@/lib/auth';
import { deleteCategory, updateCategory } from '@/lib/services/categories';

type C = { params: Promise<{ id: string }> };
export const PATCH = api<C>(async (req, u, { params }) => updateCategory(u.id, (await params).id, await req.json()));
export const DELETE = api<C>(async (_req, u, { params }) => deleteCategory(u.id, (await params).id));
