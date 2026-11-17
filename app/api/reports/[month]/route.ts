import { api } from '@/lib/auth';
import { generateReport, reportData } from '@/lib/services/reports';

type C = { params: Promise<{ month: string }> };
export const GET = api<C>(async (_req, u, { params }) => reportData(u.id, (await params).month));
/** Generate the AI summary (and mark reviewed → +30 coins once per finished month). */
export const POST = api<C>(async (req, u, { params }) => {
  const body = await req.json().catch(() => ({}));
  return generateReport(u.id, (await params).month, { review: body.review !== false });
});
