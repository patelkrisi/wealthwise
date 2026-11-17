import { api } from '@/lib/auth';
import { generateInsights } from '@/lib/services/insights';
import { addDays, todayIST, weekStart } from '@/lib/dates';

/** Regenerate the most recent week's insights (uses Claude when configured). */
export const POST = api(async (_req, u) => generateInsights(u.id, addDays(weekStart(todayIST()), -7)));
