import { api } from '@/lib/auth';
import { listNotifications, markRead } from '@/lib/services/notifications';

export const GET = api(async (_req, u) => listNotifications(u.id));
export const POST = api(async (req, u) => {
  const { id } = await req.json().catch(() => ({}));
  await markRead(u.id, id);
  return { ok: true };
});
