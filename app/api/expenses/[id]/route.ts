import { api } from '@/lib/auth';
import { deleteExpense, getExpense, updateExpense } from '@/lib/services/expenses';

type C = { params: Promise<{ id: string }> };
export const GET = api<C>(async (_req, u, { params }) => getExpense(u.id, (await params).id));
export const PATCH = api<C>(async (req, u, { params }) => updateExpense(u.id, (await params).id, await req.json()));
export const DELETE = api<C>(async (_req, u, { params }) => deleteExpense(u.id, (await params).id));
