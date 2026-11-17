import { describe, expect, it } from 'vitest';
import { candidateKeywords, detectPeriod, onWhat, when } from '../lib/ai/question';
import { periodRange } from '../lib/services/analytics';

const T = '2026-10-24';

describe('detectPeriod', () => {
  it.each([
    ['How much did I spend today?', 'today'],
    ['What did I spend yesterday', 'yesterday'],
    ['Food delivery this week?', 'this_week'],
    ['spend last week', 'last_week'],
    ['Where did I spend the most this month?', 'this_month'],
    ['compare with last month', 'last_month'],
    ['How much did I spend on Uber in September?', '2026-09'],
    ['spending in sept 2025', '2025-09'],
    ['What about November?', '2025-11'],
    ['last 30 days total', 'last_30_days'],
    ['past two weeks', 'last_14_days'],
    ['last 3 months', 'last_90_days'],
    ['this year so far', 'this_year'],
    ['pichle mahine kitna kharch hua', 'last_month'],
    ['is hafte swiggy par kitna', 'this_week'],
    ['How much did I spend on food?', null],
    ['I may want to cut shopping', null],
  ])('%s → %s', (q, p) => expect(detectPeriod(q, T)).toBe(p));
});

describe('periodRange', () => {
  it('handles last N days and months', () => {
    expect(periodRange('last_14_days', T)).toEqual({ from: '2026-10-11', to: T, label: 'the last 14 days' });
    expect(periodRange('2026-09', T)).toEqual({ from: '2026-09-01', to: '2026-09-30', label: 'September 2026' });
    expect(periodRange('2026-10', T).to).toBe(T);
    expect(periodRange('2025', T)).toEqual({ from: '2025-01-01', to: '2025-12-31', label: '2025' });
  });
  it('phrases labels', () => {
    expect(when('this month')).toBe('this month');
    expect(when('September 2026')).toBe('in September 2026');
    expect(when('the last 30 days')).toBe('in the last 30 days');
  });
});

describe('keywords', () => {
  it('finds merchant words, not filler', () => {
    expect(candidateKeywords('How much did I spend on Uber in September?')).toEqual(['uber']);
    expect(candidateKeywords('Netflix kitna hua is mahine')).toEqual(['netflix']);
    expect(candidateKeywords('Where did I spend the most this month?')).toEqual([]);
  });
  it('reads "on X"', () => {
    expect(onWhat('How much did I spend on uber rides in September?')).toBe('uber rides');
    expect(onWhat('how much on coffee?')).toBe('coffee');
  });
});
