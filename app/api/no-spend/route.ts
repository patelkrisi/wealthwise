import { api } from '@/lib/auth';
import { markNoSpend } from '@/lib/services/gamification';

export const POST = api(async (_req, u) => markNoSpend(u.id));
