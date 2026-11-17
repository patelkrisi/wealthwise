import { api } from '@/lib/auth';
import { contributeGoal, deleteGoal, updateGoal } from '@/lib/services/resources';

type C = { params: Promise<{ id: string }> };
export const PATCH = api<C>(async (req, u, { params }) => updateGoal(u.id, (await params).id, await req.json()));
export const DELETE = api<C>(async (_req, u, { params }) => deleteGoal(u.id, (await params).id));
/** Add money to the jar */
export const POST = api<C>(async (req, u, { params }) => {
  const { amount } = await req.json();
  return contributeGoal(u.id, (await params).id, Number(amount));
});
