import { api } from '@/lib/auth';
import { deleteBudget } from '@/lib/services/resources';

type C = { params: Promise<{ id: string }> };
export const DELETE = api<C>(async (_req, u, { params }) => deleteBudget(u.id, (await params).id));
