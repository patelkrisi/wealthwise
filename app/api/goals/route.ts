import { api } from '@/lib/auth';
import { createGoal, listGoals } from '@/lib/services/resources';

export const GET = api(async (_req, u) => listGoals(u.id));
export const POST = api(async (req, u) => createGoal(u.id, await req.json()));
