import { api, HttpError, rateLimit } from '@/lib/auth';
import { sendPush } from '@/lib/services/notifications';

/** "Send me a test notification" from Settings. */
export const POST = api(async (_req, u) => {
  await rateLimit(`push-test:${u.id}`, 5, 600, 'Please wait a few minutes before sending another test.');
  const n = await sendPush(u.id, { title: 'Wealthwise 🔔', body: 'Push notifications are working on this device.', url: '/settings' }, { force: true });
  if (!n) throw new HttpError(400, 'No device is subscribed yet — tap “Turn on” first.');
  return { sent: n };
});
