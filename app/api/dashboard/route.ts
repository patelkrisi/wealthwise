import { api } from '@/lib/auth';
import { dashboard } from '@/lib/services/dashboard';
import { runDueJobs } from '@/lib/services/jobs';

export const GET = api(async (_req, u) => {
  await runDueJobs(u.id);
  return dashboard(u.id);
});
