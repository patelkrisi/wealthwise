import { api } from '@/lib/auth';
import { deleteIncome, updateIncome } from '@/lib/services/resources';

type C = { params: Promise<{ id: string }> };
export const PATCH = api<C>(async (req, u, { params }) => updateIncome(u.id, (await params).id, await req.json()));
export const DELETE = api<C>(async (_req, u, { params }) => deleteIncome(u.id, (await params).id));
