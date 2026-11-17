import { ACCENT_IDS } from '../theme';
import { z } from 'zod';
import { q } from '../db';
import { HttpError, hashPassword, passwordProblem, verifyPassword } from '../auth';
import { PAYMENT_MODES } from '../format';
import { COINS } from '../finance/coins';
import { award } from './gamification';
import { createGoal, createRecurring } from './resources';
import { todayIST, addMonths, monthStart } from '../dates';

export const INCOME_RANGES = [
  { id: 'none', label: 'No regular income', mid: 0 },
  { id: '<10k', label: 'Under ₹10,000', mid: 7000 },
  { id: '10k-25k', label: '₹10,000 – ₹25,000', mid: 17500 },
  { id: '25k-50k', label: '₹25,000 – ₹50,000', mid: 37500 },
  { id: '50k-1L', label: '₹50,000 – ₹1,00,000', mid: 75000 },
  { id: '1L-2L', label: '₹1,00,000 – ₹2,00,000', mid: 150000 },
  { id: '2L+', label: 'Above ₹2,00,000', mid: 250000 },
];

export const OCCUPATIONS = [
  { id: 'student', label: 'Student' },
  { id: 'professional', label: 'Salaried professional' },
  { id: 'self_employed', label: 'Self-employed / freelancer' },
  { id: 'homemaker', label: 'Household manager' },
  { id: 'other', label: 'Other' },
];

export const PERSONALITIES = [
  { id: 'saver', label: 'Saver', emoji: '🐢', blurb: 'I think twice before spending' },
  { id: 'balanced', label: 'Balanced', emoji: '⚖️', blurb: 'Some treats, mostly sensible' },
  { id: 'spender', label: 'Spontaneous', emoji: '🦋', blurb: 'If I like it, I buy it' },
  { id: 'unsure', label: 'Not sure', emoji: '🤔', blurb: 'That’s what I want to find out' },
];

export async function getProfile(userId: string) {
  const [p] = await q<any>(`select p.*, u.is_demo, (u.password_hash is not null) as has_password, (u.google_id is not null) as has_google from profiles p join users u on u.id=p.id where p.id=$1`, [userId]);
  if (!p) throw new HttpError(404, 'Profile not found');
  return p;
}

export const ProfilePatch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  occupation: z.enum(OCCUPATIONS.map((o) => o.id) as [string, ...string[]]).optional().nullable(),
  monthly_income_range: z.string().max(20).optional().nullable(),
  monthly_income: z.coerce.number().min(0).max(100000000).optional().nullable(),
  payday: z.coerce.number().int().min(1).max(31).optional().nullable(),
  neutral_cut_pct: z.coerce.number().int().min(0).max(100).optional(),
  savings_cap_pct: z.coerce.number().int().min(10).max(100).optional(),
  default_payment_mode: z.enum(PAYMENT_MODES).optional().nullable(),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notifications_enabled: z.boolean().optional(),
  email_summaries: z.boolean().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  accent: z.enum(ACCENT_IDS).optional(),
  avatar_frame: z.string().max(20).optional().nullable(),
  weekly_goal_id: z.string().uuid().optional().nullable(),
  fixed_rent: z.coerce.number().min(0).optional(),
  fixed_emi: z.coerce.number().min(0).optional(),
  fixed_subscriptions: z.coerce.number().min(0).optional(),
  spending_personality: z.string().max(20).optional().nullable(),
});

export async function updateProfile(userId: string, raw: unknown) {
  const p = ProfilePatch.parse(raw);
  if (p.avatar_frame) {
    const owned = await q(`select 1 from redemptions r join rewards w on w.id=r.reward_id where r.user_id=$1 and w.type='frame' and w.value=$2`, [userId, p.avatar_frame]);
    if (!owned.length) throw new HttpError(400, 'Unlock this frame in the Rewards store first');
  }
  if (p.weekly_goal_id) {
    const own = await q(`select 1 from goals where id=$1 and user_id=$2 and status='active'`, [p.weekly_goal_id, userId]);
    if (!own.length) throw new HttpError(400, 'Pick one of your active goals');
  }
  const sets: string[] = [];
  const vals: unknown[] = [userId];
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${k}=$${vals.length}`);
  }
  if (p.monthly_income_range !== undefined && p.monthly_income === undefined) {
    const r = INCOME_RANGES.find((x) => x.id === p.monthly_income_range);
    vals.push(r?.mid || null);
    sets.push(`monthly_income=$${vals.length}`);
  }
  if (p.monthly_income !== undefined || p.monthly_income_range !== undefined) {
    const inc = p.monthly_income ?? INCOME_RANGES.find((x) => x.id === p.monthly_income_range)?.mid ?? 0;
    vals.push(!!inc && inc > 0);
    sets.push(`has_income=$${vals.length}`);
  }
  if (sets.length) await q(`update profiles set ${sets.join(', ')} where id=$1`, vals);
  return getProfile(userId);
}

export const OnboardingInput = z.object({
  occupation: z.string().optional().nullable(),
  monthly_income_range: z.string().optional().nullable(),
  payday: z.coerce.number().int().min(1).max(31).optional().nullable(),
  fixed_rent: z.coerce.number().min(0).optional().nullable(),
  fixed_emi: z.coerce.number().min(0).optional().nullable(),
  fixed_subscriptions: z.coerce.number().min(0).optional().nullable(),
  create_recurring: z.boolean().optional(),
  goal: z.object({ name: z.string().min(1).max(60), target_inr: z.coerce.number().positive(), deadline: z.string().optional().nullable(), icon: z.string().optional() }).optional().nullable(),
  spending_personality: z.string().optional().nullable(),
  reminder_time: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

export async function completeOnboarding(userId: string, raw: unknown) {
  const o = OnboardingInput.parse(raw ?? {});
  const [p] = await q<{ onboarded: boolean }>(`select onboarded from profiles where id=$1`, [userId]);
  const patch: Record<string, unknown> = {};
  if (o.occupation) patch.occupation = o.occupation;
  if (o.monthly_income_range) patch.monthly_income_range = o.monthly_income_range;
  if (o.payday) patch.payday = o.payday;
  if (o.fixed_rent != null) patch.fixed_rent = o.fixed_rent;
  if (o.fixed_emi != null) patch.fixed_emi = o.fixed_emi;
  if (o.fixed_subscriptions != null) patch.fixed_subscriptions = o.fixed_subscriptions;
  if (o.spending_personality) patch.spending_personality = o.spending_personality;
  if (o.reminder_time) patch.reminder_time = o.reminder_time;
  if (Object.keys(patch).length) await updateProfile(userId, patch);
  if (o.create_recurring) {
    const cats = await q<{ id: string; name: string }>(`select id,name from categories where user_id is null`);
    const id = (n: string) => cats.find((c) => c.name === n)!.id;
    const today = todayIST();
    const nextFirst = addMonths(monthStart(today), 1);
    if (o.fixed_rent) await createRecurring(userId, { name: 'Rent', amount_inr: o.fixed_rent, category_id: id('Rent & Housing'), necessity: 'necessary', payment_mode: 'netbanking', frequency: 'monthly', next_run: nextFirst });
    if (o.fixed_emi) await createRecurring(userId, { name: 'EMI', amount_inr: o.fixed_emi, category_id: id('EMI & Loans'), necessity: 'necessary', payment_mode: 'netbanking', frequency: 'monthly', next_run: nextFirst.slice(0, 8) + '05' });
  }
  if (o.goal) await createGoal(userId, { name: o.goal.name, target_inr: o.goal.target_inr, deadline: o.goal.deadline || null, icon: o.goal.icon || '🎯' });
  await q(`update profiles set onboarded=true where id=$1`, [userId]);
  let coins = 0;
  if (!p?.onboarded) {
    const got = await q(`select 1 from coin_ledger where user_id=$1 and event_type='welcome'`, [userId]);
    if (!got.length) {
      await award(userId, 'welcome', COINS.WELCOME, { note: 'Welcome to Wealthwise' });
      coins = COINS.WELCOME;
    }
  }
  return { coins };
}

export async function changePassword(userId: string, current: string, next: string) {
  const [u] = await q<{ password_hash: string | null }>(`select password_hash from users where id=$1`, [userId]);
  if (u.password_hash && !(await verifyPassword(current, u.password_hash))) throw new HttpError(400, 'Current password is wrong');
  const prob = passwordProblem(next);
  if (prob) throw new HttpError(400, prob);
  await q(`update users set password_hash=$2, session_version=session_version+1 where id=$1`, [userId, await hashPassword(next)]);
  const [r] = await q<{ session_version: number }>(`select session_version from users where id=$1`, [userId]);
  return r.session_version;
}

export async function deleteAccount(userId: string) {
  await q(`delete from users where id=$1`, [userId]); // cascades to every user table
}
