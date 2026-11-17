// Rule-based parser for one-sentence expense entry in Hindi (romanised), English or Hinglish.
// Used when no ANTHROPIC_API_KEY is configured, and as a validator/fallback for Claude's output.
// Never invents values: anything it can't find comes back as null.

import { addDays, dayOfMonth, isValidISODate, weekday } from '../dates';
import type { Necessity, PaymentMode } from '../format';

export interface ParsedExpense {
  date: string | null;
  name: string | null;
  amount_inr: number | null;
  category: string | null;
  necessity_suggestion: Necessity | null;
  payment_mode: PaymentMode | null;
  notes: string | null;
  confidence: number;
}
export interface ParseResult {
  expenses: ParsedExpense[];
  clarifications: string[];
}

// ---------- numbers ----------
const UNITS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, five: 5,
  chhe: 6, chhah: 6, chah: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10,
  gyarah: 11, eleven: 11, barah: 12, baarah: 12, twelve: 12, pandrah: 15, fifteen: 15, bees: 20, twenty: 20,
  pachees: 25, pachchis: 25, tees: 30, thirty: 30, chalis: 40, chaalis: 40, forty: 40, pachas: 50, pachaas: 50,
  fifty: 50, sixty: 60, sattar: 70, seventy: 70, assi: 80, eighty: 80, nabbe: 90, ninety: 90,
};
const FRACTIONS: Record<string, number> = { dedh: 1.5, dhai: 2.5, adhai: 2.5, derh: 1.5 };
const MODIFIERS: Record<string, (n: number) => number> = {
  sawa: (n) => n + 0.25,
  saade: (n) => n + 0.5,
  sadhe: (n) => n + 0.5,
  paune: (n) => n - 0.25,
};
const MULTIPLIERS: Record<string, number> = {
  sau: 100, so: 100, hundred: 100, hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000, thousand: 1000, k: 1000,
  lakh: 100000, lac: 100000, lakhs: 100000, l: 100000, crore: 10000000, cr: 10000000,
};
const CURRENCY_AFTER = /^(?:rs\.?|rupees?|rupaye|rupay|rupaiye|rupiya|rupaiya|bucks|inr|\/-|₹)$/;

/** Parse a run of number words like "dhai sau", "sawa lakh", "do hazaar paanch sau", "paune do sau". */
export function parseNumberWords(tokens: string[]): { value: number; used: number } | null {
  let total = 0;
  let current = 0;
  let used = 0;
  let sawMultiplier = false;
  let pendingMod: ((n: number) => number) | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in MODIFIERS) {
      pendingMod = MODIFIERS[t];
      used = i + 1;
      continue;
    }
    if (t in FRACTIONS) {
      current += FRACTIONS[t];
      used = i + 1;
      continue;
    }
    if (t in UNITS) {
      let v = UNITS[t];
      if (pendingMod) {
        v = pendingMod(v);
        pendingMod = null;
      }
      current += v;
      used = i + 1;
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(t) && i === 0) {
      current += Number(t);
      used = i + 1;
      continue;
    }
    if (t in MULTIPLIERS && t !== 'l' && t !== 'k' && t !== 'so') {
      const m = MULTIPLIERS[t];
      if (pendingMod) {
        // "sawa lakh" = 1.25 lakh, "paune sau" = 75
        current = pendingMod(current || 1);
        pendingMod = null;
      }
      current = (current || 1) * m;
      if (m >= 1000) {
        total += current;
        current = 0;
      }
      sawMultiplier = true;
      used = i + 1;
      continue;
    }
    break;
  }
  const value = total + current;
  if (!used || value <= 0) return null;
  // bare number words are only trusted with a multiplier or a currency word right after
  const next = tokens[used];
  if (!sawMultiplier && !(next && CURRENCY_AFTER.test(next))) return null;
  return { value, used };
}

// ---------- vocab ----------
const PAYMENT_PATTERNS: [RegExp, PaymentMode | 'card'][] = [
  [/\b(?:credit\s*card|cc)\b/, 'credit_card'],
  [/\b(?:debit\s*card|dc|atm\s*card)\b/, 'debit_card'],
  [/\b(?:upi|gpay|g\s?pay|google\s*pay|phonepe|phone\s*pe|paytm|bhim|scan\s*(?:kar|kiya|karke)?|qr)\b/, 'upi'],
  [/\b(?:cash|nakad|naqad|nagad|nakd|haath\s*se)\b/, 'cash'],
  [/\b(?:net\s*banking|netbanking|neft|imps|rtgs|bank\s*transfer)\b/, 'netbanking'],
  [/\b(?:cheque|check)\b/, 'cheque'],
  [/\bcard\b/, 'card'],
];

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, ravivaar: 0, raviwar: 0, itwaar: 0, itvaar: 0, itwar: 0,
  monday: 1, mon: 1, somvaar: 1, somwar: 1, somvar: 1,
  tuesday: 2, tue: 2, mangalvaar: 2, mangalwar: 2, mangalvar: 2,
  wednesday: 3, wed: 3, budhvaar: 3, budhwar: 3, budhvar: 3,
  thursday: 4, thu: 4, guruvaar: 4, guruwar: 4, guruvar: 4, brihaspativar: 4,
  friday: 5, fri: 5, shukravaar: 5, shukrawar: 5, shukravar: 5,
  saturday: 6, sat: 6, shanivaar: 6, shaniwar: 6, shanivar: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const FILLER = new Set(
  `ka ki ke ko se me mein main pe par ne liya liye li lia kiya kiye kia diya diye diye dia kharcha kharch kharche spent spend
   paid pay payed payment bought buy kharida kharidi kharide kharid ordered order of the a an rs rs. rupees rupee rupaye rupay
   rupaiye rupiya rupaiya inr worth hai tha thi the hua hui hue gaya gayi gaye gya gyi maine humne mera meri mere i we my was
   is am total bhi wala wali wale via using by through spent on for kar karke karna kiya hai lagaya lagaye laga lage
   aaya aayi aaye bill: hua. tk to`.split(/\s+/),
);
// "to" is only filler at the edges; handled specially below

const NOTE_PATTERNS: RegExp[] = [
  /\b([a-z][a-z]+(?:\s+[a-z]+)?)\s+(?:ke|ki)\s+saath\b/i, // "Rohit ke saath"
  /\bwith\s+([a-z][a-z]+(?:\s+(?:and|aur)\s+[a-z]+)?)\b/i, // "with Rohit"
  /\b(?:for|ke\s+liye|ke\s+lie)\s+(mom|mummy|mummi|maa|papa|dad|bhai|didi|sister|brother|wife|husband|beta|beti|friend|friends|dost|office|team)\b/i,
  /\b(mom|mummy|maa|papa|dad|bhai|didi|wife|husband|dost|friends)\s+ke\s+liye\b/i,
];

// ---------- helpers ----------
interface Span {
  start: number;
  end: number;
}
function blank(s: string, sp: Span) {
  return s.slice(0, sp.start) + ' '.repeat(sp.end - sp.start) + s.slice(sp.end);
}

interface Amount extends Span {
  value: number;
  strong: boolean;
}

function toNum(s: string) {
  return Number(s.replace(/,/g, ''));
}

/** Find amounts in a (lower-cased) string. */
export function findAmounts(s: string): Amount[] {
  const out: Amount[] = [];
  const taken = (st: number, en: number) => out.some((a) => !(en <= a.start || st >= a.end));
  const push = (st: number, en: number, value: number, strong: boolean) => {
    if (value > 0 && !taken(st, en)) out.push({ start: st, end: en, value: Math.round(value * 100) / 100, strong });
  };
  let m: RegExpExecArray | null;
  // ₹ / rs prefix
  const reA = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|lakh|lac|l|hazaar|hazar|thousand|sau|hundred)?\b/g;
  while ((m = reA.exec(s))) push(m.index, m.index + m[0].length, toNum(m[1]) * (m[2] ? MULTIPLIERS[m[2]] : 1), true);
  // number + multiplier: 1.5k, 2 lakh, 5 hazaar
  const reB = /\b(\d+(?:\.\d+)?)\s*(k|lakh|lakhs|lac|hazaar|hazar|hajar|thousand|sau|hundred|cr|crore)\b(\s*(?:rs\.?|rupees?|rupaye|rupay|rupiya|\/-))?/g;
  while ((m = reB.exec(s))) push(m.index, m.index + m[0].length, Number(m[1]) * MULTIPLIERS[m[2]], true);
  // number + currency suffix: 250 rupees, 250rs, 250/-
  const reC = /\b(\d[\d,]*(?:\.\d+)?)\s*(?:rs\b\.?|rupees?\b|rupaye\b|rupay\b|rupaiye\b|rupiya\b|rupaiya\b|bucks\b|inr\b|\/-)/g;
  while ((m = reC.exec(s))) push(m.index, m.index + m[0].length, toNum(m[1]), true);
  // number words
  const tokRe = /[a-z]+|\d+(?:\.\d+)?|\/-|₹/g;
  const toks: { t: string; i: number }[] = [];
  while ((m = tokRe.exec(s))) toks.push({ t: m[0], i: m.index });
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t;
    if (!(t in UNITS || t in FRACTIONS || t in MODIFIERS || t in MULTIPLIERS) || t === 'l' || t === 'k' || t === 'so') continue;
    const res = parseNumberWords(toks.slice(i).map((x) => x.t));
    if (res) {
      let endTok = i + res.used - 1;
      const next = toks[i + res.used];
      if (next && CURRENCY_AFTER.test(next.t)) endTok++;
      const st = toks[i].i;
      const en = toks[endTok].i + toks[endTok].t.length;
      push(st, en, res.value, true);
      i = endTok;
    }
  }
  // bare numbers (weak)
  const reE = /(?<![\d/.:-])(\d[\d,]*(?:\.\d+)?)(?![\d/.:-]|\s*(?:st|nd|rd|th|tarikh|tareekh|baje|am|pm|kg|km|kms|ltr|litre|liter|litres|gm|g|ml|pcs|pc|piece|pieces|plate|plates|cup|cups|din|days?|hours?|hrs?|ghante|ghanta|minutes?|mins?|%|x|people|log|bje)\b)/g;
  while ((m = reE.exec(s))) {
    const st = m.index;
    const en = m.index + m[1].length;
    // skip numbers that are part of a date like 15/10 or 15 oct
    const after = s.slice(en, en + 12);
    if (/^\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.test(after)) continue;
    const before = s.slice(Math.max(0, st - 3), st);
    if (/(?:^|\s)[x×]\s*$/.test(before)) continue;
    push(st, en, toNum(m[1]), false);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Resolve date words. Returns the ISO date (IST) and spans to remove. */
export function findDate(s: string, today: string, hour = 12): { date: string | null; spans: Span[]; future?: boolean } {
  const spans: Span[] = [];
  let date: string | null = null;
  const set = (d: string, m: RegExpExecArray) => {
    if (!date) date = d;
    spans.push({ start: m.index, end: m.index + m[0].length });
  };
  let m: RegExpExecArray | null;
  const rules: [RegExp, (m: RegExpExecArray) => string | null][] = [
    [/\b(?:day before yesterday|parso|parson|parsoon|parsun)\b/g, () => addDays(today, -2)],
    [/\b(?:kal\s+raat|kal\s+subah|kal\s+shaam|kal\s+sham|kal|yesterday|yday|kal\s+ko)\b/g, () => addDays(today, -1)],
    [/\blast\s+night\b/g, () => (hour < 12 ? addDays(today, -1) : today)],
    [/\b(?:aaj\s+subah|aaj\s+shaam|aaj\s+raat|aaj|aj|today|abhi|tonight|this\s+morning|this\s+evening)\b/g, () => today],
    [/\b(\d+)\s+(?:din|days?)\s+(?:pehle|pahle|ago|back)\b/g, (m) => addDays(today, -Number(m[1]))],
    [/\b(?:ek|one)\s+(?:din|day)\s+(?:pehle|pahle|ago)\b/g, () => addDays(today, -1)],
    [
      /\b(?:(last|pichle|pichhle|pichla|previous)\s+)?([a-z]+)(?:\s+(?:ko|wale\s+din))?\b/g,
      (m) => {
        const wd = WEEKDAYS[m[2]];
        if (wd === undefined) return null;
        const cur = weekday(today);
        let back = (cur - wd + 7) % 7;
        if (m[1] && back === 0) back = 7;
        return addDays(today, -back);
      },
    ],
    // 15/10, 15-10-2026, 15/10/26
    [
      /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g,
      (m) => {
        const d = Number(m[1]);
        const mo = Number(m[2]);
        let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
        if (y < 100) y += 2000;
        const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!isValidISODate(iso)) return null;
        if (!m[3] && iso > today) return `${y - 1}${iso.slice(4)}`;
        return iso;
      },
    ],
    // 15 oct, 3rd march
    [
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/g,
      (m) => {
        const y = Number(today.slice(0, 4));
        const iso = `${y}-${String(MONTHS[m[2]]).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
        if (!isValidISODate(iso)) return null;
        return iso > today ? `${y - 1}${iso.slice(4)}` : iso;
      },
    ],
    // "on 15th", "15 tarikh"
    [
      /\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th|\s+(?:tarikh|tareekh|taarikh)(?:\s+ko)?)\b/g,
      (m) => {
        const d = Number(m[1]);
        if (d < 1 || d > 31) return null;
        let iso = `${today.slice(0, 8)}${String(d).padStart(2, '0')}`;
        if (d > dayOfMonth(today) || !isValidISODate(iso)) {
          // most recent past occurrence: last month
          const y = Number(today.slice(0, 4));
          const mo = Number(today.slice(5, 7));
          const pm = mo === 1 ? 12 : mo - 1;
          const py = mo === 1 ? y - 1 : y;
          iso = `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          if (!isValidISODate(iso)) return null;
        }
        return iso;
      },
    ],
  ];
  for (const [re, fn] of rules) {
    re.lastIndex = 0;
    while ((m = re.exec(s))) {
      const d = fn(m);
      if (d) set(d, m);
    }
  }
  const dt = date as string | null;
  if (dt && dt > today) return { date: null, spans, future: true };
  return { date: dt, spans };
}

function findPayment(s: string): { mode: PaymentMode | 'card' | null; spans: Span[] } {
  for (const [re, mode] of PAYMENT_PATTERNS) {
    const r = new RegExp(re.source + String.raw`(?:\s+(?:se|via|through|by|using|kiya|kia|pe|par|me|mein|payment))*`, 'g');
    const m = r.exec(s);
    if (m) {
      // also eat a preceding "by/via/through/using/paid with/from"
      let start = m.index;
      const pre = s.slice(0, start).match(/(?:\b(?:by|via|through|using|paid\s+with|with|from|pay\s+by|paid\s+by)\s*)$/);
      if (pre) start -= pre[0].length;
      return { mode, spans: [{ start, end: m.index + m[0].length }] };
    }
  }
  return { mode: null, spans: [] };
}

function findNotes(original: string): { notes: string | null; spans: Span[] } {
  for (const re of NOTE_PATTERNS) {
    const m = re.exec(original);
    if (m) {
      const who = m[1]
        .trim()
        .split(/\s+/)
        .filter((w) => !/^(kal|aaj|parso|maine|mere|mera|meri|apne|apni|raat|subah|shaam|yesterday|today|ko|ne)$/i.test(w))
        .join(' ');
      if (!who) continue;
      const lower = m[0].toLowerCase();
      let notes: string;
      if (lower.includes('saath') || lower.startsWith('with')) notes = `with ${cap(who)}`;
      else notes = `for ${who.toLowerCase()}`;
      // don't treat merchants as companions ("with UPI")
      if (/^(upi|cash|card|gpay|paytm|phonepe)$/i.test(who)) continue;
      return { notes, spans: [{ start: m.index, end: m.index + m[0].length }] };
    }
  }
  return { notes: null, spans: [] };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cleanName(original: string, removed: Span[]): string | null {
  let s = original;
  for (const sp of removed) s = blank(s, sp);
  // "Ola se office gaya" -> "Ola to office"
  s = s.replace(/\b(\S+)\s+se\s+(\S+)\s+(?:tak\s+)?(?:gaya|gayi|gaye|gya|gyi|went|aaya|aayi|aya|ayi|aaye)\b/i, '$1 to $2');
  s = s.replace(/[,;!?.]+/g, ' ');
  const words = s
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FILLER.has(w.toLowerCase()) || w.toLowerCase() === 'to');
  // trim dangling "to" at the edges
  while (words.length && /^(to|and|aur|&)$/i.test(words[0])) words.shift();
  while (words.length && /^(to|and|aur|&)$/i.test(words[words.length - 1])) words.pop();
  if (!words.length) return null;
  const name = words.join(' ').replace(/\s+/g, ' ').trim();
  return name ? cap(name) : null;
}

const SEP = /\s*(?:(?<!\d),|,(?!\d)|;|\n|\s&\s|\band\b|\baur\b|\bplus\b|\bphir\b|\bthen\b|\btatha\b|\bevam\b|\bva\b)\s*/i;

/** Main entry. `today` is the IST date (YYYY-MM-DD); `hour` the IST hour (for "last night"). */
export function parseSentence(text: string, today: string, hour = 12): ParseResult {
  const clarifications: string[] = [];
  const original = text.replace(/\s+/g, ' ').trim();
  if (!original) return { expenses: [], clarifications: ['Type or say what you spent, e.g. "200 chai aur 500 petrol"'] };

  // global modifiers (apply to every expense unless a segment has its own)
  const lowerAll = original.toLowerCase();
  const gDate = findDate(lowerAll, today, hour);
  const gPay = findPayment(lowerAll);
  if (gDate.future) clarifications.push('That date is in the future — please pick the date.');

  // split into segments, then merge segments that carry no amount into their neighbour
  const rawSegs = original.split(SEP).map((x) => x.trim()).filter(Boolean);
  type Seg = { text: string; amounts: Amount[] };
  let segs: Seg[] = rawSegs.map((t) => ({ text: t, amounts: findAmounts(t.toLowerCase()) }));
  const merged: Seg[] = [];
  let carry = '';
  for (const sg of segs) {
    if (!sg.amounts.length) {
      if (merged.length) merged[merged.length - 1].text += ' ' + sg.text;
      else carry += (carry ? ' ' : '') + sg.text;
      continue;
    }
    const t = carry ? carry + ' ' + sg.text : sg.text;
    carry = '';
    merged.push({ text: t, amounts: findAmounts(t.toLowerCase()) });
  }
  if (!merged.length) merged.push({ text: carry || original, amounts: [] });

  // a segment with several strong amounts ("chai 20 rs samosa 30 rs") splits further
  segs = [];
  for (const sg of merged) {
    const strong = sg.amounts.filter((a) => a.strong);
    if (strong.length < 2) {
      segs.push(sg);
      continue;
    }
    const lower = sg.text.toLowerCase();
    const leadingAmount = !/[a-z]/i.test(lower.slice(0, strong[0].start).replace(/\b(?:aaj|kal|today|yesterday|parso)\b/g, ''));
    for (let i = 0; i < strong.length; i++) {
      const st = leadingAmount ? strong[i].start : i === 0 ? 0 : strong[i - 1].end;
      const en = leadingAmount ? (i + 1 < strong.length ? strong[i + 1].start : sg.text.length) : i + 1 < strong.length ? strong[i].end : sg.text.length;
      const piece = sg.text.slice(st, en);
      segs.push({ text: piece, amounts: findAmounts(piece.toLowerCase()) });
    }
  }

  let sawCard = false;
  const expenses: ParsedExpense[] = segs.map((sg) => {
    const lower = sg.text.toLowerCase();
    const removed: Span[] = [];
    // amount
    let amount: Amount | null = null;
    const strong = sg.amounts.filter((a) => a.strong);
    if (strong.length) amount = strong[0];
    else if (sg.amounts.length) amount = [...sg.amounts].sort((a, b) => b.value - a.value)[0];
    if (amount) removed.push(amount);
    // date
    const d = findDate(lower, today, hour);
    removed.push(...d.spans);
    // payment
    const p = findPayment(lower);
    removed.push(...p.spans);
    let mode = p.mode ?? gPay.mode;
    if (mode === 'card') {
      sawCard = true;
      mode = null;
    }
    // notes
    const n = findNotes(sg.text);
    removed.push(...n.spans);
    const name = cleanName(sg.text, removed.sort((a, b) => a.start - b.start));
    const date = d.date ?? (d.future ? null : gDate.date);
    const amt = amount ? amount.value : null;
    let confidence = 0.4;
    if (amt) confidence += 0.3;
    if (name) confidence += 0.2;
    if (amount?.strong) confidence += 0.05;
    if (date) confidence += 0.05;
    return {
      date,
      name,
      amount_inr: amt && amt > 0 ? amt : null,
      category: null,
      necessity_suggestion: null,
      payment_mode: mode as PaymentMode | null,
      notes: n.notes,
      confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
    };
  });

  if (sawCard) clarifications.push('Card — credit or debit?');
  if (expenses.some((e) => e.amount_inr == null)) clarifications.push("I couldn't find an amount — please enter it.");
  if (expenses.some((e) => !e.name)) clarifications.push('What was this expense for?');
  return { expenses, clarifications };
}
