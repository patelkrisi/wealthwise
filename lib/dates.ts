// Date helpers. Every "day" in Wealthwise is an Asia/Kolkata (IST) calendar day,
// represented as an ISO string 'YYYY-MM-DD'. Arithmetic is done in UTC on those strings.

export const TZ = 'Asia/Kolkata';

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const tf = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** Today in IST, or the IST date of a given instant. */
export function todayIST(now: Date = nowDate()): string {
  return dtf.format(now);
}

/** Current hour/minute in IST as 'HH:MM'. */
export function timeIST(now: Date = nowDate()): string {
  return tf.format(now);
}

export function hourIST(now: Date = nowDate()): number {
  return Number(timeIST(now).slice(0, 2));
}

/** Allows a fixed clock for tests via WW_NOW. */
export function nowDate(): Date {
  const fixed = typeof process !== 'undefined' ? process.env?.WW_NOW : undefined;
  return fixed ? new Date(fixed) : new Date();
}

function toUTC(d: string): Date {
  return new Date(d + 'T00:00:00Z');
}
function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86400000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: string): number {
  return toUTC(d).getUTCDay();
}

/** Monday of the week containing d. */
export function weekStart(d: string): string {
  const wd = weekday(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

export function monthStart(d: string): string {
  return d.slice(0, 8) + '01';
}

export function addMonths(d: string, n: number): string {
  const x = toUTC(monthStart(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return fromUTC(x);
}

export function daysInMonth(d: string): number {
  const x = toUTC(monthStart(d));
  x.setUTCMonth(x.getUTCMonth() + 1);
  x.setUTCDate(0);
  return x.getUTCDate();
}

export function monthEnd(d: string): string {
  return d.slice(0, 8) + String(daysInMonth(d)).padStart(2, '0');
}

export function dayOfMonth(d: string): number {
  return Number(d.slice(8, 10));
}

export function monthKey(d: string): string {
  return d.slice(0, 7);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** DD/MM/YYYY */
export function fmtDate(d: string): string {
  if (!d) return '';
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export function fmtMonth(d: string, long = true): string {
  const m = Number(d.slice(5, 7)) - 1;
  return `${(long ? MONTHS_LONG : MONTHS)[m]} ${d.slice(0, 4)}`;
}

export function fmtDayHeading(d: string, today = todayIST()): string {
  if (d === today) return 'Today';
  if (d === addDays(today, -1)) return 'Yesterday';
  return `${DAYS[weekday(d)]}, ${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
}

export function dayName(d: string): string {
  return DAYS[weekday(d)];
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function isValidISODate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(toUTC(d).getTime()) && fromUTC(toUTC(d)) === d;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
