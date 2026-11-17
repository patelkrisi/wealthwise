import { api } from '@/lib/auth';
import { createRecurring, listRecurring } from '@/lib/services/resources';

export const GET = api(async (_req, u) => listRecurring(u.id));
export const POST = api(async (req, u) => createRecurring(u.id, await req.json()));
