import { api } from '@/lib/auth';
import { deleteKirana, updateKirana } from '@/lib/services/resources';

type C = { params: Promise<{ id: string }> };
export const PATCH = api<C>(async (req, u, { params }) => updateKirana(u.id, (await params).id, await req.json()));
export const DELETE = api<C>(async (_req, u, { params }) => deleteKirana(u.id, (await params).id));
