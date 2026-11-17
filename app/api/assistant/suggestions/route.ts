import { api } from '@/lib/auth';
import { suggestions } from '@/lib/services/assistant';
import { hasClaude } from '@/lib/ai/claude';

export const GET = api(async (_req, u) => ({ ...(await suggestions(u.id)), ai: hasClaude() }));
