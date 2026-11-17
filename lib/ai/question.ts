// Understanding a chat question without AI: which time period it is about, and which words could be a shop or merchant.
// Pure functions (no database) so they are unit-tested in tests/question.test.ts.
import { addMonths, monthStart } from '../dates';

const MONTHS: [RegExp, number][] = [
  [/\bjan(uary)?\b/, 1],
  [/\bfeb(ruary)?\b/, 2],
  [/\bmar(ch)?\b/, 3],
  [/\bapr(il)?\b/, 4],
  [/\bmay\b/, 5],
  [/\bjune?\b/, 6],
  [/\bjuly?\b/, 7],
  [/\baug(ust)?\b/, 8],
  [/\bsep(t|tember)?\b/, 9],
  [/\boct(ober)?\b/, 10],
  [/\bnov(ember)?\b/, 11],
  [/\bdec(ember)?\b/, 12],
];

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fifteen: 15, thirty: 30, sixty: 60, ninety: 90 };

/**
 * The period a question is about, as a key understood by periodRange():
 * today | yesterday | this_week | last_week | this_month | last_month | last_N_days | YYYY-MM | YYYY | this_year.
 * Returns null when the question names no period (the caller picks a sensible default).
 */
export function detectPeriod(raw: string, today: string): string | null {
  const t = ' ' + raw.toLowerCase().replace(/[?.,!]/g, ' ') + ' ';
  if (/\b(today|aaj)\b/.test(t)) return 'today';
  if (/\b(yesterday)\b/.test(t) || (/\bkal\b/.test(t) && !/\bkal (se|tak)\b/.test(t))) return 'yesterday';

  const n = t.match(/\b(?:last|past|pichle|pichhle)\s+(\d{1,3}|[a-z]+)\s+(day|days|din|week|weeks|hafte|month|months|mahine)\b/);
  if (n) {
    const count = /^\d+$/.test(n[1]) ? Number(n[1]) : NUM_WORDS[n[1]];
    if (count) {
      const unit = n[2];
      const days = /^(week|weeks|hafte)$/.test(unit) ? count * 7 : /^(month|months|mahine)$/.test(unit) ? count * 30 : count;
      return `last_${Math.min(days, 366)}_days`;
    }
  }
  if (/\b(last|previous|pichle|pichhle) (week|hafte)\b/.test(t)) return 'last_week';
  if (/\b(this|is|iss) (week|hafte)\b|\bweekly\b|\bthis week\b/.test(t)) return 'this_week';
  if (/\b(last|previous|pichle|pichhle) (month|mahine)\b/.test(t)) return 'last_month';
  if (/\b(this|is|iss) (month|mahine)\b/.test(t)) return 'this_month';
  if (/\b(last|previous|pichle) (year|saal)\b/.test(t)) return String(Number(today.slice(0, 4)) - 1);
  if (/\b(this|is) (year|saal)\b/.test(t)) return 'this_year';

  // a named month ("in September", "sept 2026")
  for (const [re, m] of MONTHS) {
    if (!re.test(t)) continue;
    // "may" is also an English verb: only treat it as the month when it looks like a date
    if (m === 5 && !/\b(in|during|for|of|since|from) may\b|\bmay (\d{4}|month|mahine)\b/.test(t)) continue;
    const year = t.match(/\b(20\d{2})\b/);
    let y = year ? Number(year[1]) : Number(today.slice(0, 4));
    // a month later than the current one without a year means last year's
    if (!year && m > Number(today.slice(5, 7))) y -= 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  if (/\b(week|hafte|hafta)\b/.test(t)) return 'this_week';
  if (/\b(month|mahine|mahina)\b/.test(t)) return 'this_month';
  if (/\b(year|saal)\b/.test(t)) return 'this_year';
  return null;
}

/** "this month" → "this month"; "September 2026" → "in September 2026"; "the last 30 days" → "in the last 30 days". */
export function when(label: string): string {
  if (/^(today|yesterday|this |last week)/.test(label)) return label;
  return 'in ' + label;
}

export function nextMonthKey(today: string) {
  return addMonths(monthStart(today), 1).slice(0, 7);
}

const STOP = new Set(
  `a an the i me my mine we our you your it its is are was were be been am do does did done have has had will would can could should
   how what which where when who whom why much many more most less least much total spend spent spending spends expense expenses
   cost costs paid pay paying payment payments money rupees rs inr on in at to for from of by with and or vs versus than compare compared
   this that these those last past previous next week weeks month months year years day days today yesterday tomorrow so far till until
   since during between per average avg daily kitna kitne kitni kya mera meri mere maine kharcha kharch kahan kaha mahine mahina hafte hafta
   din saal par pe ka ki ke ko se mein me hai tha thi the hua hui kiya kiye aur ya sabse zyada jyada bata batao please tell show give
   about around approx approximately roughly only just also all any every each some category categories budget budgets goal goals
   unnecessary necessary neutral upi cash card cards credit debit netbanking cheque bank food delivery recurring subscription subscriptions
   jan january feb february mar march apr april may jun june jul july aug august sep sept september oct october nov november dec december
   biggest largest highest top most single purchase purchases transaction transactions order orders bought buy`
    .split(/\s+/)
    .filter(Boolean),
);

/** Words in the question that could name a merchant or item ("uber", "netflix", "petrol"). */
export function candidateKeywords(raw: string): string[] {
  const words = raw
    .toLowerCase()
    .replace(/[₹]/g, ' ')
    .replace(/[^a-z0-9ऀ-ॿ\s.&'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w) && !/^20\d{2}$/.test(w));
  return [...new Set(words)];
}

/** The thing after "on …" in "how much on uber rides in september" — used to say "no expenses matching X". */
export function onWhat(raw: string): string | null {
  const m = raw.toLowerCase().match(/\b(?:on|for|par|pe)\s+([a-z][a-z0-9 .&'-]{1,30}?)(?=\s+(?:in|this|last|during|for|today|yesterday|since|so far|till|is|pichle|mein)\b|[?.!]|$)/);
  if (!m) return null;
  const w = m[1].trim();
  return STOP.has(w) ? null : w;
}
