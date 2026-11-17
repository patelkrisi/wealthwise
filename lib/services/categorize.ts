// Auto-categorisation cascade (PRD §5.1) and necessity suggestion (§5.3).
import { q } from '../db';
import { callTool, FAST_MODEL, hasClaude } from '../ai/claude';
import { CATEGORY_DEFAULT_NECESSITY } from '../seed/catalog';
import { hourIST, todayIST, diffDays, dayOfMonth } from '../dates';
import type { Necessity } from '../format';
import { categoryMap, type Category } from './categories';

type Dict = { keyword: string; category_name: string; default_necessity: Necessity | null }[];
const g = globalThis as typeof globalThis & { __ww_dict?: Dict };

async function dictionary(): Promise<Dict> {
  if (!g.__ww_dict) {
    const rows = await q<Dict[number]>(`select keyword, category_name, default_necessity from merchant_dictionary`);
    // longest keywords first so "swiggy instamart" beats "swiggy"
    g.__ww_dict = rows.sort((a, b) => b.keyword.length - a.keyword.length);
  }
  return g.__ww_dict;
}

export function normalise(name: string) {
  return ` ${name.toLowerCase().replace(/[^a-z0-9&.'\- ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

export async function dictionaryMatch(name: string) {
  const n = normalise(name);
  for (const row of await dictionary()) {
    if (n.includes(` ${row.keyword} `)) return row;
  }
  return null;
}

/** The keyword a user correction is remembered under: the merchant/keyword if known, else the first word. */
export async function ruleKeyword(name: string): Promise<string> {
  const hit = await dictionaryMatch(name);
  if (hit) return hit.keyword;
  const first = normalise(name).trim().split(' ')[0] || name.toLowerCase().trim();
  return first.slice(0, 40);
}

export interface CategoryGuess {
  category_id: string;
  category: string;
  emoji: string;
  colour: string;
  confidence: number;
  source: 'user_rule' | 'history' | 'dictionary' | 'ai' | 'ai_cache' | 'default';
}

export async function categorize(userId: string, name: string, opts: { allowAI?: boolean } = {}): Promise<CategoryGuess> {
  const { cats, byId, byName } = await categoryMap(userId);
  const others = byName.get('others')!;
  const out = (c: Category, confidence: number, source: CategoryGuess['source']): CategoryGuess => ({
    category_id: c.id,
    category: c.name,
    emoji: c.emoji,
    colour: c.colour,
    confidence,
    source,
  });
  const trimmed = name.trim();
  if (trimmed.length < 2) return out(others, 0, 'default');

  const keyword = await ruleKeyword(trimmed);
  const [rule] = await q<{ category_id: string; category_hits: number }>(
    `select category_id, category_hits from category_rules where user_id=$1 and keyword=$2 and category_id is not null`,
    [userId, keyword],
  );
  // Tier 1a: a user rule confirmed by 3+ consistent corrections overrides everything.
  if (rule && rule.category_hits >= 3 && byId.has(rule.category_id)) return out(byId.get(rule.category_id)!, 0.97, 'user_rule');

  // Tier 1b: the user's own history for this exact name.
  const [hist] = await q<{ category_id: string; n: number }>(
    `select category_id, count(*)::int n from expenses where user_id=$1 and lower(name)=lower($2) and category_id is not null
     group by category_id order by n desc limit 1`,
    [userId, trimmed],
  );
  if (hist && hist.n >= 2 && byId.has(hist.category_id)) return out(byId.get(hist.category_id)!, 0.9, 'history');

  // Tier 2: merchant / keyword dictionary.
  const dict = await dictionaryMatch(trimmed);
  if (dict) {
    const c = byName.get(dict.category_name.toLowerCase());
    if (c) return out(c, 0.92, 'dictionary');
  }
  if (rule && byId.has(rule.category_id)) return out(byId.get(rule.category_id)!, 0.8, 'user_rule');
  if (hist && byId.has(hist.category_id)) return out(byId.get(hist.category_id)!, 0.75, 'history');

  // Tier 3: Claude Haiku fallback (cached per keyword).
  const key = normalise(trimmed).trim().slice(0, 60);
  const [cached] = await q<{ category_name: string; confidence: number }>(
    `select category_name, confidence from ai_category_cache where keyword=$1`,
    [key],
  );
  if (cached) {
    const c = byName.get(cached.category_name.toLowerCase());
    if (c) return out(c, cached.confidence, 'ai_cache');
  }
  if (opts.allowAI !== false && hasClaude()) {
    try {
      const names = cats.map((c) => c.name);
      const res = await callTool<{ category: string; confidence: number }>({
        model: FAST_MODEL,
        system:
          'You categorise Indian personal expenses. Pick exactly one category from the provided list for the expense name. ' +
          'Indian merchants, Hinglish and abbreviations are common. Return a confidence between 0 and 1.',
        user: `Expense name: "${trimmed.slice(0, 80)}"\nCategories: ${names.join(' | ')}`,
        tool: {
          name: 'set_category',
          description: 'Return the single best category for this expense',
          input_schema: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: names },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['category', 'confidence'],
          },
        },
        maxTokens: 200,
      });
      const c = byName.get(String(res.category).toLowerCase());
      if (c) {
        const conf = Math.max(0, Math.min(1, Number(res.confidence) || 0.6));
        if (c.user_id == null) {
          await q(
            `insert into ai_category_cache(keyword,category_name,confidence) values($1,$2,$3) on conflict(keyword) do update set category_name=excluded.category_name, confidence=excluded.confidence`,
            [key, c.name, conf],
          );
        }
        return out(c, conf, 'ai');
      }
    } catch (e) {
      console.warn('[categorize] Claude fallback failed:', (e as Error).message);
    }
  }
  return out(others, 0.3, 'default');
}

export interface NecessityGuess {
  necessity: Necessity;
  reason: string;
}

/** Suggest a necessity tag from the user's history, the dictionary and simple signals. Never auto-saved. */
export async function suggestNecessity(
  userId: string,
  name: string,
  categoryName: string,
  amount?: number | null,
  at: Date = new Date(),
): Promise<NecessityGuess> {
  const keyword = await ruleKeyword(name);
  const [rule] = await q<{ necessity: Necessity; necessity_hits: number }>(
    `select necessity, necessity_hits from category_rules where user_id=$1 and keyword=$2 and necessity is not null`,
    [userId, keyword],
  );
  if (rule && rule.necessity_hits >= 3) return { necessity: rule.necessity, reason: 'You always tag this the same way' };

  const [hist] = await q<{ necessity: Necessity; n: number }>(
    `select necessity, count(*)::int n from expenses
     where user_id=$1 and necessity is not null and (lower(name)=lower($2) or lower(name) like $3)
     group by necessity order by n desc limit 1`,
    [userId, name.trim(), `%${keyword}%`],
  );
  let base: NecessityGuess;
  if (hist && hist.n >= 2) base = { necessity: hist.necessity, reason: 'Based on how you tagged this before' };
  else {
    const dict = await dictionaryMatch(name);
    if (dict?.default_necessity) base = { necessity: dict.default_necessity, reason: 'Typical for this merchant' };
    else base = { necessity: CATEGORY_DEFAULT_NECESSITY[categoryName] ?? 'neutral', reason: `Typical for ${categoryName}` };
  }

  const discretionary = ['Food & Dining', 'Shopping', 'Entertainment & Subscriptions', 'Personal Care', 'Travel'].includes(categoryName);
  // Late-night spikes lean Unnecessary.
  const h = hourIST(at);
  if (discretionary && (h >= 23 || h < 4) && base.necessity !== 'necessary') {
    return { necessity: 'unnecessary', reason: 'Late-night spend often turns out avoidable' };
  }
  // Unusually large vs the user's median for the category.
  if (amount && discretionary && base.necessity === 'neutral') {
    const [med] = await q<{ m: number | null }>(
      `select percentile_cont(0.5) within group (order by e.amount_inr)::float8 m
       from expenses e join categories c on c.id=e.category_id where e.user_id=$1 and c.name=$2`,
      [userId, categoryName],
    );
    if (med?.m && amount > med.m * 2.5) return { necessity: 'unnecessary', reason: `Much higher than your usual ${categoryName} spend` };
  }
  // Payday proximity.
  if (discretionary && base.necessity === 'neutral') {
    const [p] = await q<{ payday: number | null; has_income: boolean }>(`select payday, has_income from profiles where id=$1`, [userId]);
    if (p?.has_income && p.payday) {
      const today = todayIST(at);
      const d = dayOfMonth(today);
      const since = d >= p.payday ? d - p.payday : d + 30 - p.payday;
      if (since <= 2) return { necessity: base.necessity, reason: 'Payday mode: impulse spend peaks right after salary' };
    }
  }
  void diffDays;
  return base;
}

/** Learning loop: store a correction for this merchant/keyword. 3 consistent corrections create an override. */
export async function learnFromLabel(
  userId: string,
  name: string,
  label: { category_id?: string | null; necessity?: Necessity | null },
  corrected: { category: boolean; necessity: boolean },
) {
  if (!corrected.category && !corrected.necessity) return;
  const keyword = await ruleKeyword(name);
  const [existing] = await q<{ category_id: string | null; category_hits: number; necessity: Necessity | null; necessity_hits: number }>(
    `select category_id, category_hits, necessity, necessity_hits from category_rules where user_id=$1 and keyword=$2`,
    [userId, keyword],
  );
  let catId = existing?.category_id ?? null;
  let catHits = existing?.category_hits ?? 0;
  let nec = existing?.necessity ?? null;
  let necHits = existing?.necessity_hits ?? 0;
  if (corrected.category && label.category_id) {
    if (catId === label.category_id) catHits += 1;
    else {
      catId = label.category_id;
      catHits = 1;
    }
  }
  if (corrected.necessity && label.necessity) {
    if (nec === label.necessity) necHits += 1;
    else {
      nec = label.necessity;
      necHits = 1;
    }
  }
  await q(
    `insert into category_rules(user_id,keyword,category_id,category_hits,necessity,necessity_hits,updated_at)
     values($1,$2,$3,$4,$5,$6,now())
     on conflict(user_id,keyword) do update set category_id=excluded.category_id, category_hits=excluded.category_hits,
       necessity=excluded.necessity, necessity_hits=excluded.necessity_hits, updated_at=now()`,
    [userId, keyword, catId, catHits, nec, necHits],
  );
}
