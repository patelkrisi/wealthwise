import { api } from '@/lib/auth';
import { completeOnboarding } from '@/lib/services/profile';

export const POST = api(async (req, u) => completeOnboarding(u.id, await req.json().catch(() => ({}))));
