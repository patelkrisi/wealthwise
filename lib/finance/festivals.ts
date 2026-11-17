// Indian festival / seasonal calendar used by the forecast and the festival planner.
// Dates are approximate observance dates (they follow the lunar calendar).

export interface Festival {
  name: string;
  date: string;
  emoji: string;
  /** multiplicative effect on category spend in that month */
  effects: Record<string, number>;
}

const F = (name: string, date: string, emoji: string, effects: Record<string, number>): Festival => ({ name, date, emoji, effects });

const DIWALI = { 'Gifts & Festivals': 2.5, Shopping: 1.35, 'Food & Dining': 1.1, Groceries: 1.1, Travel: 1.25, 'Personal Care': 1.15 };
const HOLI = { 'Gifts & Festivals': 1.6, 'Food & Dining': 1.1, Groceries: 1.05 };
const RAKHI = { 'Gifts & Festivals': 2.0, Shopping: 1.1 };
const EID = { 'Gifts & Festivals': 1.8, 'Food & Dining': 1.15, Shopping: 1.2 };
const NAVRATRI = { 'Gifts & Festivals': 1.7, Shopping: 1.25, 'Personal Care': 1.15 };
const GANESH = { 'Gifts & Festivals': 1.5, 'Food & Dining': 1.05 };
const XMAS = { 'Gifts & Festivals': 1.5, 'Food & Dining': 1.2, Travel: 1.4, 'Entertainment & Subscriptions': 1.1 };
const WEDDING = { 'Gifts & Festivals': 1.3, Shopping: 1.1, Travel: 1.1, 'Personal Care': 1.05 };
const SCHOOL = { Education: 1.8 };

export const FESTIVALS: Festival[] = [
  F('Makar Sankranti / Pongal', '2026-01-14', '🪁', { 'Gifts & Festivals': 1.3 }),
  F('Holi', '2026-03-04', '🎨', HOLI),
  F('Eid al-Fitr', '2026-03-20', '🌙', EID),
  F('New school year fees', '2026-04-01', '🎒', SCHOOL),
  F('School fees (term 2)', '2026-06-15', '🎒', { Education: 1.4 }),
  F('Raksha Bandhan', '2026-08-28', '🧵', RAKHI),
  F('Ganesh Chaturthi', '2026-09-14', '🐘', GANESH),
  F('Navratri', '2026-10-11', '💃', NAVRATRI),
  F('Dussehra', '2026-10-20', '🏹', { 'Gifts & Festivals': 1.3, Shopping: 1.1 }),
  F('Diwali', '2026-11-08', '🪔', DIWALI),
  F('Wedding season', '2026-11-25', '💍', WEDDING),
  F('Christmas & New Year', '2026-12-25', '🎄', XMAS),
  F('Makar Sankranti / Pongal', '2027-01-14', '🪁', { 'Gifts & Festivals': 1.3 }),
  F('Wedding season', '2027-02-10', '💍', WEDDING),
  F('Eid al-Fitr', '2027-03-10', '🌙', EID),
  F('Holi', '2027-03-22', '🎨', HOLI),
  F('New school year fees', '2027-04-01', '🎒', SCHOOL),
  F('Raksha Bandhan', '2027-08-17', '🧵', RAKHI),
  F('Ganesh Chaturthi', '2027-09-04', '🐘', GANESH),
  F('Navratri', '2027-09-30', '💃', NAVRATRI),
  F('Diwali', '2027-10-29', '🪔', DIWALI),
  F('Christmas & New Year', '2027-12-25', '🎄', XMAS),
  // past year, for "same month last year" adjustments
  F('Diwali', '2025-10-20', '🪔', DIWALI),
  F('Raksha Bandhan', '2025-08-09', '🧵', RAKHI),
  F('Christmas & New Year', '2025-12-25', '🎄', XMAS),
];

export function festivalsInMonth(month: string): Festival[] {
  const key = month.slice(0, 7);
  return FESTIVALS.filter((f) => f.date.slice(0, 7) === key);
}

/** Combined multiplier for a category in a month (multiplicative, capped). */
export function festivalMultiplier(month: string, category: string): number {
  let m = 1;
  for (const f of festivalsInMonth(month)) m *= f.effects[category] ?? 1;
  return Math.min(m, 4);
}

export function upcomingFestivals(today: string, limit = 5): Festival[] {
  return FESTIVALS.filter((f) => f.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
