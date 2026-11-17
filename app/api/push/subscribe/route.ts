import { api, HttpError } from '@/lib/auth';
import { q } from '@/lib/db';
import { vapidKeys } from '@/lib/services/notifications';

export const GET = api(async (_req, u) => {
  const { publicKey } = await vapidKeys();
  const [r] = await q<{ n: number }>(`select count(*)::int n from push_subscriptions where user_id=$1`, [u.id]);
  return { publicKey, devices: r.n };
});
/** Save a web-push subscription */
export const POST = api(async (req, u) => {
  const sub = await req.json();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new HttpError(400, 'Invalid subscription');
  await q(
    `insert into push_subscriptions(user_id,endpoint,keys) values($1,$2,$3::jsonb) on conflict(endpoint) do update set user_id=excluded.user_id, keys=excluded.keys`,
    [u.id, String(sub.endpoint).slice(0, 1000), JSON.stringify({ p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) })],
  );
  return { ok: true };
});
export const DELETE = api(async (req, u) => {
  const { endpoint } = await req.json().catch(() => ({}));
  await q(`delete from push_subscriptions where user_id=$1 and ($2::text is null or endpoint=$2)`, [u.id, endpoint ?? null]);
  return { ok: true };
});
