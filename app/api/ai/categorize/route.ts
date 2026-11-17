import { rateLimit } from '@/lib/auth';
import { api } from '@/lib/auth';
import { categorize, suggestNecessity } from '@/lib/services/categorize';

/** {name, amount} → {category, confidence, necessity_suggestion} */
export const POST = api(async (req, u) => {
  await rateLimit(`categorize:${u.id}`, 400, 3600, 'You’re going a bit fast — try again in a few minutes.');
  const { name, amount, ai } = await req.json();
  const n = String(name || '').slice(0, 80);
  const c = await categorize(u.id, n, { allowAI: ai !== false });
  const nec = n.trim().length >= 2 ? await suggestNecessity(u.id, n, c.category, Number(amount) || null) : null;
  return { ...c, necessity_suggestion: nec?.necessity ?? null, necessity_reason: nec?.reason ?? null };
});
