import { upcomingFestivals } from '@/lib/finance/festivals';
export { fmtDate, fmtMonth } from '@/lib/dates';

const BUDGET: Record<string, number> = { Diwali: 15000, 'Wedding season': 10000, 'Raksha Bandhan': 3000, 'Christmas & New Year': 6000, Holi: 2500, 'Eid al-Fitr': 5000, Navratri: 4000 };

export function upcomingFestivalsClient(n: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return upcomingFestivals(today, n).map((f) => ({ ...f, budget: BUDGET[f.name] ?? 3000 }));
}
