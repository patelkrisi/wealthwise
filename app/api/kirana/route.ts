import { api } from '@/lib/auth';
import { addKirana, deleteKirana, listKirana } from '@/lib/services/resources';

export const GET = api(async (_req, u) => listKirana(u.id));
export const POST = api(async (req, u) => addKirana(u.id, await req.json()));
/** clear checked items */
export const DELETE = api(async (_req, u) => deleteKirana(u.id));
