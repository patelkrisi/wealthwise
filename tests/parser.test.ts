import { describe, expect, it } from 'vitest';
import { parseSentence, parseNumberWords } from '../lib/ai/hinglish';

const TODAY = '2026-10-20'; // a Tuesday
const p = (s: string) => parseSentence(s, TODAY, 10);

describe('Hindi numbers', () => {
  it.each([
    [['dhai', 'sau'], 250],
    [['dedh', 'sau'], 150],
    [['sawa', 'lakh'], 125000],
    [['paune', 'do', 'sau'], 175],
    [['saade', 'teen', 'sau'], 350],
    [['do', 'hazaar', 'paanch', 'sau'], 2500],
  ])('%j → %d', (tokens, v) => expect(parseNumberWords(tokens as string[])?.value).toBe(v));
  it('does not treat "do" (verb) or "saath" as numbers without a multiplier', () => {
    expect(parseNumberWords(['do', 'it'])).toBeNull();
  });
});

describe('PRD examples', () => {
  it('kal Rohit ke saath 250 ka chai samosa, UPI se', () => {
    const r = p('kal Rohit ke saath 250 ka chai samosa, UPI se');
    expect(r.expenses).toHaveLength(1);
    expect(r.expenses[0]).toMatchObject({ date: '2026-10-19', name: 'Chai samosa', amount_inr: 250, payment_mode: 'upi', notes: 'with Rohit' });
  });
  it('Aaj Ola se office gaya, 180 rupees, card se → asks credit or debit', () => {
    const r = p('Aaj Ola se office gaya, 180 rupees, card se');
    expect(r.expenses[0]).toMatchObject({ date: TODAY, name: 'Ola to office', amount_inr: 180, payment_mode: null });
    expect(r.clarifications).toContain('Card — credit or debit?');
  });
  it('200 chai aur 500 petrol → two rows', () => {
    const r = p('200 chai aur 500 petrol');
    expect(r.expenses.map((e) => [e.name, e.amount_inr])).toEqual([
      ['Chai', 200],
      ['Petrol', 500],
    ]);
  });
});

describe('20 sentences (English, Hindi, Hinglish)', () => {
  const cases: [string, Partial<Record<string, unknown>>[]][] = [
    ['dhai sau ka pizza zomato se, gpay', [{ amount_inr: 250, payment_mode: 'upi' }]],
    ['sawa lakh ka laptop credit card pe liya', [{ name: 'Laptop', amount_inr: 125000, payment_mode: 'credit_card' }]],
    ['1.5k groceries from DMart by debit card', [{ amount_inr: 1500, payment_mode: 'debit_card' }]],
    ['Netflix 649 netbanking', [{ name: 'Netflix', amount_inr: 649, payment_mode: 'netbanking' }]],
    ['Paid 40 for metro today', [{ name: 'Metro', amount_inr: 40, date: TODAY }]],
    ['parso 3 coffee 450 rs cash', [{ amount_inr: 450, date: '2026-10-18', payment_mode: 'cash' }]],
    ['last sunday movie tickets 600 with friends', [{ name: 'Movie tickets', amount_inr: 600, date: '2026-10-18', notes: 'with Friends' }]],
    ['bees rupaye ki chai', [{ name: 'Chai', amount_inr: 20 }]],
    ['Swiggy biryani 320 and Uber 210 yesterday via UPI', [{ name: 'Swiggy biryani', amount_inr: 320, date: '2026-10-19', payment_mode: 'upi' }, { name: 'Uber', amount_inr: 210 }]],
    ['maine kal raat dominos se 499 ka order kiya', [{ name: 'Dominos', amount_inr: 499, date: '2026-10-19' }]],
    ['electricity bill 1,240 paid via phonepe', [{ name: 'Electricity bill', amount_inr: 1240, payment_mode: 'upi' }]],
    ['mummy ke liye saree 2 hazaar cash', [{ name: 'Saree', amount_inr: 2000, payment_mode: 'cash', notes: 'for mummy' }]],
    ['15 tarikh ko rent 22000 netbanking', [{ name: 'Rent', amount_inr: 22000, date: '2026-10-15' }]],
    ['chai 20 rs samosa 30 rs', [{ name: 'Chai', amount_inr: 20 }, { name: 'Samosa', amount_inr: 30 }]],
    ['Apollo pharmacy medicines ₹860', [{ amount_inr: 860 }]],
    ['do hazaar paanch sau ka shopping myntra', [{ amount_inr: 2500 }]],
    ['bought headphones', [{ name: 'Headphones', amount_inr: null }]],
  ];
  it.each(cases)('%s', (s, expected) => {
    const r = p(s);
    expect(r.expenses).toHaveLength(expected.length);
    expected.forEach((e, i) => expect(r.expenses[i]).toMatchObject(e));
  });
  it('never returns a future date', () => {
    const r = p('25 tarikh ko 300 ka gift');
    expect(r.expenses[0].date! <= TODAY).toBe(true);
  });
});
