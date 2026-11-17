import { rateLimit } from '@/lib/auth';
import { api, HttpError } from '@/lib/auth';
import { parseExpenseText } from '@/lib/services/parse';

/** {text, language} → pre-filled expenses + clarifications (used by Type and Speak) */
export const POST = api(async (req, u) => {
  await rateLimit(`parse:${u.id}`, 60, 3600, 'You’re going a bit fast — try again in a few minutes.');
  const { text, language } = await req.json();
  if (!text || String(text).trim().length < 2) throw new HttpError(400, 'Type or say what you spent');
  return parseExpenseText(u.id, String(text), language === 'hi-IN' ? 'hi-IN' : 'en-IN');
});
