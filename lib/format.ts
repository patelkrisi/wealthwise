/** ₹ with Indian digit grouping: 125000 -> ₹1,25,000 */
export function inr(amount: number | null | undefined, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  if (amount == null || Number.isNaN(amount)) return '₹0';
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const decimals = opts.decimals ?? (abs < 100 && !Number.isInteger(Math.round(abs * 100) / 100));
  const fixed = decimals ? abs.toFixed(2) : Math.round(abs).toString();
  const [int, frac] = fixed.split('.');
  const s = groupIndian(int) + (frac && frac !== '00' ? '.' + frac : '');
  return (neg ? '-' : opts.sign ? '+' : '') + '₹' + s;
}

export function groupIndian(int: string): string {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** Compact: ₹4.6L, ₹1.2Cr, ₹18.4k */
export function inrCompact(amount: number): string {
  const a = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}
function trim(n: number) {
  return n.toFixed(1).replace(/\.0$/, '');
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

export const PAYMENT_MODES = ['upi', 'cash', 'credit_card', 'debit_card', 'netbanking', 'cheque'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  cheque: 'Cheque',
  netbanking: 'Netbanking',
};

export const NECESSITIES = ['necessary', 'neutral', 'unnecessary'] as const;
export type Necessity = (typeof NECESSITIES)[number];
export const NECESSITY_LABELS: Record<Necessity, string> = {
  necessary: 'Necessary',
  neutral: 'Neutral',
  unnecessary: 'Unnecessary',
};
export const NECESSITY_COLOURS: Record<Necessity, string> = {
  necessary: '#0d9488',
  neutral: '#d97706',
  unnecessary: '#e11d48',
};

export const MOODS = [
  { id: 'happy', label: 'Happy', emoji: '😊' },
  { id: 'celebrating', label: 'Celebrating', emoji: '🎉' },
  { id: 'bored', label: 'Bored', emoji: '😐' },
  { id: 'stressed', label: 'Stressed', emoji: '😣' },
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'sad', label: 'Sad', emoji: '😔' },
] as const;
