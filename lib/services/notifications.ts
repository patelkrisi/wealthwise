import { getOrCreateSecret, q } from '../db';

export async function notify(
  userId: string,
  n: { kind: string; title: string; body: string; link?: string; dedupe?: string; at?: string },
) {
  const rows = await q<{ id: string }>(
    `insert into notifications(user_id,kind,title,body,link,dedupe_key,created_at)
     values($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()))
     on conflict (user_id, dedupe_key) do nothing returning id`,
    [userId, n.kind, n.title, n.body, n.link ?? null, n.dedupe ?? null, n.at ?? null],
  );
  if (rows.length && !n.at) await sendPush(userId, { title: n.title, body: n.body, url: n.link || '/home' }).catch(() => {});
  return rows.length > 0;
}

export async function listNotifications(userId: string) {
  return q(
    `select id,kind,title,body,link,read,created_at from notifications where user_id=$1 order by created_at desc limit 40`,
    [userId],
  );
}

export async function markRead(userId: string, id?: string) {
  if (id) await q(`update notifications set read=true where user_id=$1 and id=$2`, [userId, id]);
  else await q(`update notifications set read=true where user_id=$1`, [userId]);
}

/**
 * Keys that identify this server to browsers' push services. Taken from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set;
 * otherwise generated once and kept in the database, so push works with no setup.
 */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const webpush = (await import('web-push')).default;
  const raw = await getOrCreateSecret('vapid_keys', () => JSON.stringify(webpush.generateVAPIDKeys()));
  return JSON.parse(raw);
}

function vapidSubject() {
  const s = process.env.VAPID_SUBJECT || process.env.SUPPORT_EMAIL || process.env.GMAIL_USER || 'hello@wealthwise.app';
  return /^(mailto:|https:)/.test(s) ? s : `mailto:${s}`;
}

export async function sendPush(userId: string, payload: { title: string; body: string; url: string }, opts: { force?: boolean } = {}) {
  const subs = await q<{ id: string; endpoint: string; keys: any }>(
    `select id, endpoint, keys from push_subscriptions where user_id=$1`,
    [userId],
  );
  if (!subs.length) return 0;
  const [p] = await q<{ notifications_enabled: boolean }>(`select notifications_enabled from profiles where id=$1`, [userId]);
  if (p && !p.notifications_enabled && !opts.force) return 0;
  const webpush = (await import('web-push')).default;
  const keys = await vapidKeys();
  webpush.setVapidDetails(vapidSubject(), keys.publicKey, keys.privateKey);
  let sent = 0;
  for (const s of subs) {
    try {
      const k = typeof s.keys === 'string' ? JSON.parse(s.keys) : s.keys;
      await webpush.sendNotification({ endpoint: s.endpoint, keys: k }, JSON.stringify(payload), { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410 || e?.statusCode === 403) await q(`delete from push_subscriptions where id=$1`, [s.id]);
      else console.warn('[push]', e?.statusCode, e?.body || e?.message);
    }
  }
  return sent;
}
