// Sentence & voice parsing (PRD §5.2): Claude Haiku with a strict tool schema, validated with Zod;
// falls back to the rule-based Hinglish parser when no API key is set or Claude fails.
import { z } from 'zod';
import { callTool, FAST_MODEL, hasClaude } from '../ai/claude';
import { parseSentence, type ParsedExpense } from '../ai/hinglish';
import { dayName, hourIST, isValidISODate, todayIST } from '../dates';
import { NECESSITIES, PAYMENT_MODES } from '../format';
import { listCategories } from './categories';
import { categorize, suggestNecessity } from './categorize';
import { mostUsedMode, topMerchants } from './expenses';

const ParsedSchema = z.object({
  expenses: z
    .array(
      z.object({
        date: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
        amount_inr: z.union([z.number(), z.string()]).nullable().optional(),
        category: z.string().nullable().optional(),
        necessity_suggestion: z.enum(NECESSITIES).nullable().optional().catch(null),
        payment_mode: z.enum(PAYMENT_MODES).nullable().optional().catch(null),
        notes: z.string().nullable().optional(),
        confidence: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .max(20),
  clarifications: z.array(z.string()).optional().default([]),
});

export interface FilledExpense extends ParsedExpense {
  category_id: string | null;
  category_emoji?: string;
  category_confidence?: number;
  necessity_reason?: string;
  missing: string[];
}

export async function parseExpenseText(userId: string, text: string, language: 'en-IN' | 'hi-IN' = 'en-IN') {
  const today = todayIST();
  const cats = await listCategories(userId);
  const names = cats.map((c) => c.name);
  let parsed: { expenses: ParsedExpense[]; clarifications: string[] } | null = null;
  let source: 'claude' | 'rules' = 'rules';

  if (hasClaude()) {
    try {
      const merchants = await topMerchants(userId, 12);
      const raw = await callTool<unknown>({
        model: FAST_MODEL,
        system: [
          'You extract Indian personal expenses from ONE sentence written or spoken in English, Hindi (romanised or Devanagari) or Hinglish.',
          `Today's date in IST is ${today} (${dayName(today)}). Resolve relative dates in IST: aaj/today = today; kal/yesterday = yesterday (expenses are in the past);`,
          'parso = 2 days ago; "last Sunday" = the most recent past Sunday. Never return a future date.',
          'Understand Hindi numbers and shorthand: "dhai sau" = 250, "dedh sau" = 150, "sawa lakh" = 125000, "paune do sau" = 175, "1.5k" = 1500, "2 hazaar" = 2000.',
          'One sentence can hold several expenses ("200 chai aur 500 petrol") — return each separately.',
          'Return null for anything not stated. NEVER invent an amount, date, or payment mode. If the user says just "card", set payment_mode null and add the clarification "Card — credit or debit?".',
          'name: a short, clean expense name in the user\'s words (e.g. "Chai samosa", "Ola to office"). notes: who it was with / for, if mentioned.',
          'UPI apps (GPay, PhonePe, Paytm, BHIM) mean payment_mode "upi".',
        ].join('\n'),
        user: `Categories: ${names.join(' | ')}\nPayment modes: ${PAYMENT_MODES.join(' | ')}\nUser's frequent merchants: ${merchants.join(', ') || 'none yet'}\nSpeech/typing language: ${language}\n\nSentence: """${text.slice(0, 500)}"""`,
        tool: {
          name: 'record_expenses',
          description: 'Record the expenses found in the sentence',
          input_schema: {
            type: 'object',
            properties: {
              expenses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
                    name: { type: ['string', 'null'] },
                    amount_inr: { type: ['number', 'null'] },
                    category: { type: ['string', 'null'], enum: [...names, null] },
                    necessity_suggestion: { type: ['string', 'null'], enum: ['necessary', 'neutral', 'unnecessary', null] },
                    payment_mode: { type: ['string', 'null'], enum: [...PAYMENT_MODES, null] },
                    notes: { type: ['string', 'null'] },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                  },
                  required: ['date', 'name', 'amount_inr', 'category', 'necessity_suggestion', 'payment_mode', 'notes', 'confidence'],
                },
              },
              clarifications: { type: 'array', items: { type: 'string' } },
            },
            required: ['expenses', 'clarifications'],
          },
        },
        maxTokens: 800,
      });
      const v = ParsedSchema.parse(raw);
      parsed = {
        clarifications: v.clarifications,
        expenses: v.expenses.map((e) => {
          const amt = e.amount_inr == null ? null : Number(e.amount_inr);
          const date = e.date && isValidISODate(e.date) && e.date <= today ? e.date : null;
          return {
            date,
            name: e.name?.trim() || null,
            amount_inr: amt != null && Number.isFinite(amt) && amt > 0 ? Math.round(amt * 100) / 100 : null,
            category: e.category && names.includes(e.category) ? e.category : null,
            necessity_suggestion: e.necessity_suggestion ?? null,
            payment_mode: e.payment_mode ?? null,
            notes: e.notes?.trim() || null,
            confidence: Math.max(0, Math.min(1, Number(e.confidence) || 0.7)),
          };
        }),
      };
      if (!parsed.expenses.length) parsed = null;
      else source = 'claude';
    } catch (e) {
      console.warn('[parse] Claude failed, using rule parser:', (e as Error).message);
      parsed = null;
    }
  }
  if (!parsed) parsed = parseSentence(text, today, hourIST());

  const defaultMode = await mostUsedMode(userId);
  const byName = new Map(cats.map((c) => [c.name, c]));
  const filled: FilledExpense[] = [];
  for (const e of parsed.expenses) {
    let category_id: string | null = null;
    let emoji: string | undefined;
    let catConf: number | undefined;
    let catName = e.category;
    if (catName && byName.has(catName)) {
      category_id = byName.get(catName)!.id;
      emoji = byName.get(catName)!.emoji;
      catConf = e.confidence;
    } else if (e.name) {
      const g = await categorize(userId, e.name);
      category_id = g.category_id;
      catName = g.category;
      emoji = g.emoji;
      catConf = g.confidence;
    }
    let necessity = e.necessity_suggestion;
    let reason: string | undefined;
    if (e.name && catName) {
      const s = await suggestNecessity(userId, e.name, catName, e.amount_inr);
      if (!necessity) necessity = s.necessity;
      reason = s.reason;
    }
    const missing: string[] = [];
    if (!e.name) missing.push('name');
    if (e.amount_inr == null) missing.push('amount_inr');
    if (!e.date) missing.push('date');
    if (!e.payment_mode) missing.push('payment_mode');
    if (!category_id) missing.push('category');
    filled.push({
      ...e,
      category: catName ?? null,
      category_id,
      category_emoji: emoji,
      category_confidence: catConf,
      necessity_suggestion: necessity ?? null,
      necessity_reason: reason,
      missing,
    });
  }
  return { expenses: filled, clarifications: [...new Set(parsed.clarifications)], source, defaultMode, today };
}
