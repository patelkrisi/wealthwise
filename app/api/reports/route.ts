import { api } from '@/lib/auth';
import { availableMonths } from '@/lib/services/reports';

export const GET = api(async (_req, u) => availableMonths(u.id));
