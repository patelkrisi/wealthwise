import { api } from '@/lib/auth';
import { deleteRecurring, updateRecurring } from '@/lib/services/resources';

type C = { params: Promise<{ id: string }> };
export const PATCH = api<C>(async (req, u, { params }) => updateRecurring(u.id, (await params).id, await req.json()));
export const DELETE = api<C>(async (_req, u, { params }) => deleteRecurring(u.id, (await params).id));
