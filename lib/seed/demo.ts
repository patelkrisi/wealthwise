// Demo account: realistic ~6 months of data for a Bengaluru professional, generated relative to today
// and pushed through the real coin / streak / savings / badge logic so every screen is consistent.
import { q } from '../db';
import { createUser } from '../auth';
import { addDays, addMonths, dayOfMonth, daysInMonth, monthEnd, monthStart, timeIST, todayIST, weekStart, weekday } from '../dates';
import { COINS, levelFor, logCoinsFor, streakCoins } from '../finance/coins';
import { registerDay, type StreakState } from '../finance/streak';
import { closeWeek } from '../services/savings';
import { closeMonth } from '../services/jobs';
import { generateInsights } from '../services/insights';
import { runRecurring } from '../services/resources';
import { checkBudgetAlerts } from '../services/expenses';
import { generateReport } from '../services/reports';

export const DEMO_EMAIL = 'demo@wealthwise.app';
export const DEMO_PASSWORD = 'Demo@1234';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Create the demo account if missing, or rebuild it when its data is more than a day old. */
export async function ensureDemoAccount() {
  const [u] = await q<{ id: string }>(`select id from users where email=$1`, [DEMO_EMAIL]);
  const [m] = await q<{ value: string }>(`select value from schema_meta where key='demo_seeded_on'`);
  if (u && m && m.value >= addDays(todayIST(), -1)) return;
  // Lease lock so only one server instance rebuilds the demo at a time (others reuse the existing data).
  const got = await q(
    `insert into schema_meta(key,value) values('demo_lock', now()::text)
     on conflict(key) do update set value = now()::text where schema_meta.value::timestamptz < now() - interval '3 minutes'
     returning key`,
  );
  if (!got.length) return;
  try {
    await seedDemo();
  } finally {
    await q(`delete from schema_meta where key='demo_lock'`);
  }
}

/** Re-create the demo account from scratch (also used by "Reset demo data"). */
export async function seedDemo() {
  const t0 = Date.now();
  await q(`delete from users where email=$1`, [DEMO_EMAIL]);
  const today = todayIST();
  const nowHM = timeIST();
  const start = addMonths(monthStart(today), -5);
  const R = rng(20261020);
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const between = (lo: number, hi: number, step = 10) => Math.round((lo + R() * (hi - lo)) / step) * step;

  const user = await createUser({ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Priya Sharma', isDemo: true });
  const uid = user.id;
  await q(`update users set created_at=$2 where id=$1`, [uid, `${start}T10:00:00+05:30`]);
  await q(
    `update profiles set occupation='professional', monthly_income_range='50k-1L', monthly_income=85000, has_income=true, payday=1,
      fixed_rent=22000, fixed_emi=0, fixed_subscriptions=1067, spending_personality='balanced', onboarded=true, reminder_time='21:00',
      default_payment_mode='upi', created_at=$2 where id=$1`,
    [uid, `${start}T10:00:00+05:30`],
  );

  const cats = await q<{ id: string; name: string }>(`select id,name from categories where user_id is null`);
  const C = (n: string) => cats.find((c) => c.name === n)!.id;
  const [plants] = await q<{ id: string }>(
    `insert into categories(user_id,name,emoji,colour,is_default,bucket,sort) values($1,'Plants','🌿','#65a30d',false,'want',200) returning id`,
    [uid],
  );

  // ---------- recurring ----------
  const firstOn = (dom: number) => {
    const d = start.slice(0, 8) + String(dom).padStart(2, '0');
    return d;
  };
  const rec = [
    ['Rent', 22000, 'Rent & Housing', 'necessary', 'netbanking', 1],
    ['Cult.fit membership', 1500, 'Health & Medical', 'neutral', 'upi', 3],
    ['SIP – Index fund', 5000, 'Investments & Savings', 'necessary', 'netbanking', 5],
    ['ACT Fibernet broadband', 799, 'Bills & Utilities', 'necessary', 'upi', 10],
    ['Netflix', 649, 'Entertainment & Subscriptions', 'neutral', 'credit_card', 12],
    ['Spotify', 119, 'Entertainment & Subscriptions', 'neutral', 'upi', 18],
    ['Jio recharge', 299, 'Bills & Utilities', 'necessary', 'upi', 22],
  ] as const;
  for (const [name, amt, cat, nec, mode, dom] of rec) {
    await q(
      `insert into recurring_rules(user_id,name,amount_inr,category_id,necessity,payment_mode,frequency,next_run,anchor_day,created_at)
       values($1,$2,$3,$4,$5,$6,'monthly',$7,$8,$9)`,
      [uid, name, amt, C(cat), nec, mode, firstOn(dom), dom, `${start}T10:00:00+05:30`],
    );
  }
  await runRecurring(uid, today);

  // ---------- day-by-day expenses ----------
  type E = { d: string; name: string; amt: number; cat: string; nec: string; mode: string; time: string; mood?: string; method?: string; raw?: string; notes?: string };
  const ex: E[] = [];
  const add = (e: E) => ex.push(e);
  const total = Math.round((Date.parse(today) - Date.parse(start)) / 86400000);
  // days with no logging at all (to make the streak history realistic); the last 16 days are unbroken
  const gaps = new Set([19, 45, 46, 70, 96, 122, 150].map((n) => addDays(start, n)).concat([addDays(today, -40), addDays(today, -17)]));
  const festival = (d: string) => {
    const md = d.slice(5);
    const out: E[] = [];
    if (d.slice(5, 7) === '08' && md === '08-27') out.push({ d, name: 'Rakhi & gifts for Arjun', amt: 2450, cat: 'Gifts & Festivals', nec: 'neutral', mode: 'upi', time: '18:20', notes: 'Raksha Bandhan' });
    if (md === '09-14') out.push({ d, name: 'Ganpati puja samagri', amt: 780, cat: 'Gifts & Festivals', nec: 'necessary', mode: 'cash', time: '09:15' }, { d, name: 'Modak & sweets', amt: 620, cat: 'Gifts & Festivals', nec: 'neutral', mode: 'upi', time: '17:40' });
    if (md === '10-12') out.push({ d, name: 'Navratri chaniya choli', amt: 2890, cat: 'Gifts & Festivals', nec: 'unnecessary', mode: 'credit_card', time: '19:10', mood: 'celebrating' });
    if (md === '10-15') out.push({ d, name: 'Garba night pass', amt: 600, cat: 'Entertainment & Subscriptions', nec: 'neutral', mode: 'upi', time: '20:05', mood: 'celebrating', notes: 'with Neha' });
    if (md === '10-20') out.push({ d, name: 'Dussehra sweets', amt: 450, cat: 'Gifts & Festivals', nec: 'neutral', mode: 'upi', time: '11:30' });
    return out;
  };
  for (let i = 0; i <= total; i++) {
    const d = addDays(start, i);
    if (gaps.has(d)) continue;
    const wd = weekday(d);
    const weekend = wd === 0 || wd === 6;
    const progress = i / total; // later = more disciplined
    const recent = d >= addDays(today, -3);
    if (!weekend) {
      if (R() < 0.82) {
        add({ d, name: 'Metro to office', amt: pick([40, 45, 50]), cat: 'Transport', nec: 'necessary', mode: 'upi', time: pick(['08:35', '08:50', '09:05', '09:20']) });
        add({ d, name: 'Metro to home', amt: pick([40, 45, 50]), cat: 'Transport', nec: 'necessary', mode: 'upi', time: pick(['18:40', '19:10', '19:35']) });
      } else {
        const m = pick(['Rapido to office', 'Ola to office', 'Uber to office']);
        add({ d, name: m, amt: between(140, 260), cat: 'Transport', nec: 'neutral', mode: 'upi', time: pick(['09:10', '09:30', '09:45']), method: R() < 0.5 ? 'voice' : 'form', raw: `aaj ${m.split(' ')[0]} se office gaya ${between(140, 260)} upi se` });
      }
      if (R() < 0.6) add({ d, name: 'Chai', amt: 20, cat: 'Food & Dining', nec: 'neutral', mode: R() < 0.7 ? 'cash' : 'upi', time: pick(['11:10', '16:30', '17:05']) });
      if (R() < 0.5) add({ d, name: pick(['Office canteen lunch', 'Tiffin', 'Darshini lunch']), amt: between(80, 160), cat: 'Food & Dining', nec: 'necessary', mode: 'upi', time: '13:15' });
      if (R() < 0.1 - progress * 0.05) add({ d, name: pick(['Starbucks', 'Third Wave Coffee', 'Blue Tokai']), amt: between(280, 420), cat: 'Food & Dining', nec: 'unnecessary', mode: 'upi', time: '16:20', mood: pick(['bored', 'tired', 'stressed']) });
    }
    // food delivery: ~4/week early, ~2/week recently; none in the last 4 days (active No Swiggy Week)
    const pDelivery = (weekend ? 0.75 : 0.5) * (1 - progress * 0.55);
    if (!recent && d < addDays(today, -3) && R() < pDelivery) {
      const late = R() < 0.35;
      const app = pick(['Swiggy', 'Zomato', 'Swiggy', 'Zomato', "Domino's"]);
      const dish = pick(['biryani', 'pizza', 'butter chicken', 'momos', 'burger', 'thali', 'rolls']);
      const amt = between(240, 680);
      add({
        d, name: `${app} ${dish}`, amt, cat: 'Food & Dining',
        nec: late ? 'unnecessary' : R() < 0.45 ? 'unnecessary' : 'neutral',
        mode: R() < 0.8 ? 'upi' : 'credit_card',
        time: late ? pick(['23:10', '23:40', '22:55']) : pick(['20:15', '20:45', '21:20', '13:30']),
        mood: late ? pick(['bored', 'stressed', 'tired']) : R() < 0.3 ? pick(['happy', 'tired']) : undefined,
        method: R() < 0.3 ? 'text' : 'form',
        raw: `${app.toLowerCase()} se ${dish} ${amt} upi`,
      });
    }
    // groceries
    if ((wd === 2 || wd === 5) && R() < 0.85) add({ d, name: pick(['Blinkit groceries', 'Zepto groceries', 'Swiggy Instamart']), amt: between(220, 950), cat: 'Groceries', nec: 'necessary', mode: 'upi', time: pick(['19:45', '20:30', '10:15']) });
    if (dayOfMonth(d) === 6 || (dayOfMonth(d) === 7 && wd === 0)) add({ d, name: 'DMart monthly kirana', amt: between(2200, 3600), cat: 'Groceries', nec: 'necessary', mode: 'debit_card', time: '11:40' });
    if (R() < 0.35) add({ d, name: 'Milk & eggs', amt: between(60, 140), cat: 'Groceries', nec: 'necessary', mode: R() < 0.5 ? 'cash' : 'upi', time: '07:50' });
    // weekends
    if (weekend) {
      if (R() < 0.55) add({ d, name: pick(['Dinner at Toit', 'Brunch at Third Wave', 'Lunch at Meghana Foods', 'Dinner with friends', 'Barbeque Nation']), amt: between(600, 1900), cat: 'Food & Dining', nec: R() < 0.35 ? 'unnecessary' : 'neutral', mode: pick(['upi', 'credit_card']), time: pick(['13:20', '20:40', '21:15']), mood: R() < 0.4 ? 'celebrating' : 'happy', notes: R() < 0.4 ? 'with Neha & Rohan' : undefined });
      if (R() < 0.28) add({ d, name: pick(['PVR movie tickets', 'BookMyShow – standup show', 'INOX movie']), amt: between(380, 950), cat: 'Entertainment & Subscriptions', nec: R() < 0.4 ? 'unnecessary' : 'neutral', mode: 'upi', time: '17:30', mood: 'happy' });
      if (R() < 0.27 - progress * 0.1) add({ d, name: pick(['Myntra kurta', 'Amazon gadget', 'Zara top', 'Ajio sneakers', 'H&M jeans', 'Amazon home decor']), amt: between(700, 3400), cat: 'Shopping', nec: R() < 0.55 ? 'unnecessary' : 'neutral', mode: 'credit_card', time: pick(['22:30', '15:10', '23:20']), mood: pick(['bored', 'stressed', 'happy', undefined as any]), method: R() < 0.3 ? 'voice' : 'form' });
      if (R() < 0.45) add({ d, name: pick(['Uber to Indiranagar', 'Ola to Koramangala', 'Rapido bike']), amt: between(110, 420), cat: 'Transport', nec: 'neutral', mode: 'upi', time: '19:30' });
      if (R() < 0.15) add({ d, name: 'Ugaoo plants & pots', amt: between(300, 900), cat: '__plants', nec: 'neutral', mode: 'upi', time: '12:00', mood: 'happy' });
    }
    // monthly-ish
    if (dayOfMonth(d) === 8) add({ d, name: 'BESCOM electricity bill', amt: between(880, 1650), cat: 'Bills & Utilities', nec: 'necessary', mode: 'upi', time: '10:05', method: 'text', raw: `electricity bill ${between(880, 1650)} phonepe se` });
    if (dayOfMonth(d) === 16) add({ d, name: 'Haircut', amt: 350, cat: 'Personal Care', nec: 'neutral', mode: 'upi', time: '11:00' });
    if (dayOfMonth(d) === 24 && R() < 0.5) add({ d, name: 'Nykaa skincare', amt: between(600, 1600), cat: 'Personal Care', nec: 'unnecessary', mode: 'credit_card', time: '22:45', mood: 'stressed' });
    if (R() < 0.04) add({ d, name: 'Apollo Pharmacy medicines', amt: between(180, 900), cat: 'Health & Medical', nec: 'necessary', mode: 'upi', time: '19:00' });
    if (dayOfMonth(d) === 20 && R() < 0.5) add({ d, name: 'Maid salary', amt: 2500, cat: 'Rent & Housing', nec: 'necessary', mode: 'cash', time: '09:00' });
    for (const f of festival(d)) add(f);
  }
  // one-offs
  const oneOff = (offset: number, e: Omit<E, 'd'>) => {
    const d = addDays(start, offset);
    if (d < today) add({ d, ...e });
  };
  oneOff(40, { name: 'Coursera – ML specialisation', amt: 3999, cat: 'Education', nec: 'necessary', mode: 'debit_card', time: '21:00' });
  oneOff(68, { name: 'Coorg trip – homestay', amt: 6800, cat: 'Travel', nec: 'neutral', mode: 'credit_card', time: '12:30', mood: 'celebrating', notes: 'with college friends' });
  oneOff(68, { name: 'KSRTC bus to Coorg', amt: 1350, cat: 'Travel', nec: 'neutral', mode: 'upi', time: '22:00' });
  oneOff(95, { name: "Birthday gift for Neha", amt: 1800, cat: 'Gifts & Festivals', nec: 'neutral', mode: 'upi', time: '18:00' });
  oneOff(118, { name: 'IndiGo flight home – Jaipur', amt: 5240, cat: 'Travel', nec: 'necessary', mode: 'credit_card', time: '23:05', notes: 'for Rakhi' });
  oneOff(130, { name: 'Air fryer', amt: 5999, cat: 'Shopping', nec: 'neutral', mode: 'credit_card', time: '20:10' });
  oneOff(150, { name: 'Dentist – cleaning', amt: 1200, cat: 'Health & Medical', nec: 'necessary', mode: 'upi', time: '18:30' });
  oneOff(160, { name: 'CFA Level 2 books', amt: 2400, cat: 'Education', nec: 'necessary', mode: 'upi', time: '20:00' });

  // only keep today's items that "already happened"
  const rows = ex.filter((e) => e.d < today || e.time <= nowHM);
  const catId = (n: string) => (n === '__plants' ? plants.id : C(n));
  const inserted: { id: string; d: string; amt: number; created: string; method: string }[] = [];
  for (let k = 0; k < rows.length; k += 80) {
    const chunk = rows.slice(k, k + 80);
    const vals: unknown[] = [];
    const ph = chunk.map((e, j) => {
      const method = e.method || (R() < 0.12 ? 'text' : R() < 0.08 ? 'voice' : 'form');
      const created = `${e.d}T${e.time}:00+05:30`;
      vals.push(uid, e.d, e.name, e.amt, catId(e.cat), e.nec, e.mode, e.notes ?? null, e.mood ?? null, method, method === 'form' ? null : e.raw ?? `${e.name} ${e.amt} ${e.mode}`, created, catId(e.cat), e.nec);
      const b = j * 14;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::necessity,$${b + 7}::payment_mode,$${b + 8},$${b + 9},$${b + 10}::entry_method,$${b + 11},$${b + 12}::timestamptz,$${b + 13},$${b + 14}::necessity)`;
    });
    const res = await q<{ id: string; spent_on: string; amount_inr: number; created_at: string; entry_method: string }>(
      `insert into expenses(user_id,spent_on,name,amount_inr,category_id,necessity,payment_mode,notes,mood,entry_method,raw_input,created_at,ai_category_id,ai_necessity)
       values ${ph.join(',')} returning id, spent_on, amount_inr, created_at, entry_method`,
      vals,
    );
    for (const r of res) inserted.push({ id: r.id, d: r.spent_on, amt: r.amount_inr, created: r.created_at, method: r.entry_method });
  }

  // ---------- coins, streaks, badges: replay day by day ----------
  const ledger: [string, number, string | null, string, string, string | null][] = []; // event, coins, ref, day, at, note
  ledger.push(['welcome', COINS.WELCOME, null, start, `${start}T10:05:00+05:30`, 'Welcome to Wealthwise']);
  const byDay = new Map<string, typeof inserted>();
  for (const e of inserted) {
    const a = byDay.get(e.d) || [];
    a.push(e);
    byDay.set(e.d, a);
  }
  let st: StreakState = { current: 0, longest: 0, last_log_date: null, freezes_held: 0, had_break: false };
  const badgeAt: Record<string, string> = {};
  const grant = (id: string, at: string) => {
    if (!badgeAt[id]) badgeAt[id] = at;
  };
  let count = 0;
  let voice = 0;
  let text = 0;
  let early = 0;
  const activity: [string, string][] = [];
  const noSpend: string[] = [];
  // the freeze bought in September covers the gap day 17 days ago
  const freezeBuyDay = addDays(today, -25);
  for (let i = 0; i <= total; i++) {
    const d = addDays(start, i);
    if (d === freezeBuyDay) st = { ...st, freezes_held: st.freezes_held + 1 };
    const items = (byDay.get(d) || []).sort((a, b) => a.created.localeCompare(b.created));
    if (!items.length) {
      // quiet day: the user marked it "No spend" (except the deliberate gap days and today)
      if (gaps.has(d) || d === today) continue;
      noSpend.push(d);
      const at = `${d}T21:30:00+05:30`;
      activity.push([d, at]);
      const r = registerDay(st, d);
      st = r.state;
      for (const f of r.events.frozenDays) activity.push([f, 'frozen']);
      for (const c of streakCoins(st.current)) ledger.push([c.event, c.coins, `streak-${d}`, d, at, `Streak day ${st.current}`]);
      if (st.current >= 7) grant('streak_7', at);
      if (st.current >= 30) grant('streak_30', at);
      continue;
    }
    let logCoins = 0;
    for (const e of items) {
      const c = logCoinsFor(e.amt, logCoins);
      if (c) ledger.push(['log_expense', c, e.id, d, e.created, null]);
      logCoins += c;
      count++;
      if (e.method === 'voice') voice++;
      if (e.method === 'text') text++;
      if (count === 1) grant('first_log', e.created);
      if (count === 100) grant('expenses_100', e.created);
      if (voice === 10) grant('voice_logger', e.created);
      if (text === 10) grant('sentence_smith', e.created);
    }
    const lastAt = items[items.length - 1].created;
    ledger.push(['tag_all_day', COINS.TAG_ALL_DAY, null, d, lastAt, null]);
    const firstAt = items[0].created;
    activity.push([d, firstAt]);
    if (Number(timeOf(firstAt).slice(0, 2)) < 10) early++;
    if (early === 7) grant('early_bird', firstAt);
    const r = registerDay(st, d);
    st = r.state;
    for (const f of r.events.frozenDays) activity.push([f, 'frozen']);
    for (const c of streakCoins(st.current)) ledger.push([c.event, c.coins, `streak-${d}`, d, firstAt, `Streak day ${st.current}`]);
    if (st.current >= 7) grant('streak_7', firstAt);
    if (st.current >= 30) grant('streak_30', firstAt);
    if (st.had_break && st.current >= 3) grant('comeback_kid', firstAt);
  }

  // ---------- income ----------
  for (let m = start; m <= today; m = addMonths(m, 1)) {
    await q(`insert into income(user_id,source,kind,amount_inr,received_on,created_at) values($1,'Salary – Infosys','salary',85000,$2,$3)`, [uid, m, `${m}T09:00:00+05:30`]);
  }
  const inc = async (off: number, source: string, kind: string, amt: number) => {
    const d = addDays(start, off);
    if (d < today) await q(`insert into income(user_id,source,kind,amount_inr,received_on) values($1,$2,$3,$4,$5)`, [uid, source, kind, amt, d]);
  };
  await inc(75, 'Freelance – data dashboard', 'freelance', 12000);
  await inc(125, 'Amazon refund', 'refund', 1299);
  await inc(160, 'Freelance – ML consulting', 'freelance', 8000);

  // ---------- goals ----------
  const [goa] = await q<{ id: string }>(
    `insert into goals(user_id,name,target_inr,saved_inr,deadline,icon,created_at) values($1,'Goa trip',45000,3000,$2,'🏖️',$3) returning id`,
    [uid, addMonths(monthStart(today), 5).slice(0, 8) + '15', `${start}T10:10:00+05:30`],
  );
  await q(
    `insert into goals(user_id,name,target_inr,saved_inr,deadline,icon,created_at) values($1,'Emergency fund',100000,42000,$2,'🛟',$3)`,
    [uid, addMonths(monthStart(today), 8).slice(0, 8) + '30', `${start}T10:12:00+05:30`],
  );
  const phoneDone = addDays(start, 108);
  const [phone] = await q<{ id: string }>(
    `insert into goals(user_id,name,target_inr,saved_inr,deadline,icon,status,completed_at,created_at) values($1,'New phone',15000,15000,$2,'📱','completed',$3,$4) returning id`,
    [uid, addDays(start, 120), `${phoneDone}T20:00:00+05:30`, `${start}T10:15:00+05:30`],
  );
  ledger.push(['goal_complete', COINS.GOAL_COMPLETE, phone.id, phoneDone, `${phoneDone}T20:00:00+05:30`, 'New phone']);
  grant('goal_getter', `${phoneDone}T20:00:00+05:30`);
  await q(`update profiles set weekly_goal_id=$2 where id=$1`, [uid, goa.id]);

  // ---------- challenges ----------
  const chDone = addDays(today, -40);
  const [c1] = await q<{ id: string }>(
    `insert into user_challenges(user_id,challenge_id,status,progress,started_on,ends_on,completed_at) values($1,'zero_regret_3','completed',3,$2,$3,$4) returning id`,
    [uid, addDays(chDone, -3), addDays(chDone, -1), `${chDone}T00:10:00+05:30`],
  );
  ledger.push(['challenge_complete', 150, c1.id, chDone, `${chDone}T00:10:00+05:30`, '3 Days, Zero Regret']);
  grant('challenger', `${chDone}T00:10:00+05:30`);
  await q(
    `insert into user_challenges(user_id,challenge_id,status,progress,started_on,ends_on) values($1,'cab_free_week','failed',3,$2,$3)`,
    [uid, addDays(today, -75), addDays(today, -69)],
  );
  await q(
    `insert into user_challenges(user_id,challenge_id,status,progress,started_on,ends_on) values($1,'no_swiggy_week','active',4,$2,$3)`,
    [uid, addDays(today, -3), addDays(today, 3)],
  );

  // ---------- rewards bought ----------
  const buy = async (rid: string, cost: number, day: string, note: string) => {
    await q(`insert into redemptions(user_id,reward_id,redeemed_at) values($1,$2,$3)`, [uid, rid, `${day}T21:00:00+05:30`]);
    ledger.push(['redeem', -cost, rid, day, `${day}T21:00:00+05:30`, note]);
  };
  await buy('frame_silver', 150, addDays(start, 70), 'Silver avatar frame');
  await buy('advanced_analytics', 800, addDays(start, 130), 'Advanced analytics');
  await buy('freeze', 200, freezeBuyDay, 'Streak Freeze');
  await q(`update profiles set avatar_frame='silver', advanced_analytics=true where id=$1`, [uid]);

  // ---------- wishlist ----------
  const wish = async (item: string, amt: number, cat: string, createdH: number, coolH: number, status: string, decidedH?: number) => {
    await q(
      `insert into wishlist(user_id,item,amount_inr,category_id,cool_off_until,status,created_at,decided_at)
       values($1,$2,$3,$4, now() - ($5::text||' hours')::interval + ($6::text||' hours')::interval, $7, now() - ($5::text||' hours')::interval,
              case when $8::text is null then null else now() - ($8::text||' hours')::interval end)`,
      [uid, item, amt, C(cat), String(createdH), String(coolH), status, decidedH != null ? String(decidedH) : null],
    );
  };
  await wish('Sony WH-1000XM5 headphones', 24990, 'Shopping', 6, 24 * 7, 'waiting');
  await wish('Smartwatch (Noise)', 3499, 'Shopping', 72, 24, 'waiting');
  await wish('Nike Pegasus sneakers', 6495, 'Shopping', 24 * 16, 24, 'skipped', 24 * 14);
  await wish('Mechanical keyboard', 4200, 'Shopping', 24 * 40, 24 * 7, 'skipped', 24 * 32);
  await wish('Air fryer', 5999, 'Shopping', 24 * 62, 24, 'bought', 24 * 60);
  ledger.push(['wishlist_skip', COINS.WISHLIST_SKIP, null, addDays(today, -14), `${addDays(today, -14)}T21:30:00+05:30`, 'Nike Pegasus sneakers']);
  ledger.push(['wishlist_skip', COINS.WISHLIST_SKIP, null, addDays(today, -32), `${addDays(today, -32)}T21:30:00+05:30`, 'Mechanical keyboard']);

  // ---------- write ledger, streak, activity, badges ----------
  for (let k = 0; k < ledger.length; k += 150) {
    const chunk = ledger.slice(k, k + 150);
    const vals: unknown[] = [];
    const ph = chunk.map((l, j) => {
      vals.push(uid, l[0], l[1], l[2], l[3], l[4], l[5]);
      const b = j * 7;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::timestamptz,$${b + 7})`;
    });
    await q(`insert into coin_ledger(user_id,event_type,coins,ref_id,event_day,created_at,note) values ${ph.join(',')}`, vals);
  }
  for (let k = 0; k < activity.length; k += 150) {
    const chunk = activity.slice(k, k + 150);
    const vals: unknown[] = [];
    const ph = chunk.map(([d, at], j) => {
      vals.push(uid, d, at === 'frozen' ? `${d}T23:59:00+05:30` : at, at === 'frozen');
      const b = j * 4;
      return `($${b + 1},$${b + 2},$${b + 3}::timestamptz,$${b + 4})`;
    });
    await q(`insert into activity_days(user_id,day,first_at,frozen) values ${ph.join(',')} on conflict do nothing`, vals);
  }
  for (const d of noSpend) await q(`insert into day_marks(user_id,day,kind) values($1,$2,'no_spend') on conflict do nothing`, [uid, d]);
  await q(`update streaks set current=$2, longest=$3, last_log_date=$4, freezes_held=$5, had_break=$6 where user_id=$1`, [
    uid, st.current, st.longest, st.last_log_date, st.freezes_held, st.had_break,
  ]);
  for (const [bid, at] of Object.entries(badgeAt)) {
    await q(`insert into user_badges(user_id,badge_id,earned_at) values($1,$2,$3) on conflict do nothing`, [uid, bid, at]);
  }
  await recomputeCoins(uid);

  // ---------- budgets ----------
  const pastBudgets: [string, number][] = [
    ['Food & Dining', 6500], ['Groceries', 5500], ['Transport', 2800], ['Shopping', 3500],
    ['Entertainment & Subscriptions', 2400], ['Personal Care', 1500], ['Bills & Utilities', 2800],
  ];
  for (let m = start; m < monthStart(today); m = addMonths(m, 1)) {
    for (const [c, l] of pastBudgets) await q(`insert into budgets(user_id,category_id,month,limit_inr) values($1,$2,$3,$4)`, [uid, C(c), m, l]);
  }
  // current month: tuned so Food is near its limit and Shopping has crossed — shows alerts & early warnings
  const cm = monthStart(today);
  const mtd = await q<{ name: string; s: number }>(
    `select c.name, sum(e.amount_inr) s from expenses e join categories c on c.id=e.category_id where e.user_id=$1 and e.spent_on >= $2 group by c.name`,
    [uid, cm],
  );
  const spent = (n: string) => mtd.find((x) => x.name === n)?.s ?? 0;
  const frac = dayOfMonth(today) / daysInMonth(today);
  const round100 = (n: number) => Math.max(500, Math.round(n / 100) * 100);
  // Early in a month there is too little spending to tune against, so the demo keeps last month's sensible limits.
  const earlyMonth = dayOfMonth(today) < 10;
  const curBudgets: [string, number][] = earlyMonth
    ? pastBudgets.map(([c, l]) => [c, c === 'Food & Dining' ? 7000 : c === 'Personal Care' ? 1800 : l] as [string, number])
    : [
    ['Food & Dining', round100(spent('Food & Dining') / 0.84)],
    ['Shopping', round100(Math.max(spent('Shopping'), 2000) / 1.06)],
    ['Groceries', round100(Math.max(5500, (spent('Groceries') / Math.max(frac, 0.2)) * 1.1))],
    ['Transport', round100(Math.max(3200, (spent('Transport') / Math.max(frac, 0.2)) * 1.15))],
    ['Entertainment & Subscriptions', round100(Math.max(2600, spent('Entertainment & Subscriptions') * 1.4))],
    ['Personal Care', 1800],
    ['Bills & Utilities', round100(Math.max(2800, spent('Bills & Utilities') * 1.3))],
  ];
  if (!earlyMonth && spent('Shopping') < 1500) {
    await q(
      `insert into expenses(user_id,spent_on,name,amount_inr,category_id,necessity,payment_mode,entry_method,mood,created_at) values($1,$2,'Myntra festive kurta',2190,$3,'unnecessary','credit_card','form','bored',$4)`,
      [uid, addDays(today, -5), C('Shopping'), `${addDays(today, -5)}T22:40:00+05:30`],
    );
    curBudgets[1][1] = round100((spent('Shopping') + 2190) / 1.06);
  }
  for (const [c, l] of curBudgets) await q(`insert into budgets(user_id,category_id,month,limit_inr) values($1,$2,$3,$4)`, [uid, C(c), cm, l]);

  // ---------- close past weeks and months through the real jobs ----------
  for (let ws = addDays(weekStart(start), 7); ws < weekStart(today); ws = addDays(ws, 7)) {
    await closeWeek(uid, ws, { at: `${addDays(ws, 6)}T23:00:00+05:30` });
  }
  for (let m = start; m < monthStart(today); m = addMonths(m, 1)) {
    await closeMonth(uid, m, `${addMonths(m, 1)}T06:00:00+05:30`);
    await q(`insert into job_runs(user_id,job,period_key) values($1,'month',$2) on conflict do nothing`, [uid, m.slice(0, 7)]);
    await q(
      `insert into notifications(user_id,kind,title,body,link,dedupe_key,read,created_at) values($1,'report',$2,$3,$4,$5,true,$6)`,
      [uid, `📄 Your ${m.slice(0, 7)} report is ready`, 'Review it for +30 coins.', `/reports/${m.slice(0, 7)}`, `report-${m.slice(0, 7)}`, `${addMonths(m, 1)}T06:00:00+05:30`],
    );
  }
  // weekly insights for the last 6 closed weeks (rule-based, no API cost)
  for (let k = 1; k <= 6; k++) {
    const ws = addDays(weekStart(today), -7 * k);
    await generateInsights(uid, ws, { at: `${addDays(ws, 6)}T23:00:00+05:30` });
    await q(`insert into job_runs(user_id,job,period_key) values($1,'insights',$2) on conflict do nothing`, [uid, ws]);
  }
  // previous months' reports reviewed (+30 each), last month's left for the user to review
  for (let m = start; m < addMonths(monthStart(today), -1); m = addMonths(m, 1)) {
    await generateReport(uid, m.slice(0, 7));
    await q(`update reports set reviewed=true where user_id=$1 and month=$2`, [uid, m]);
    await q(`insert into coin_ledger(user_id,event_type,coins,ref_id,event_day,note,created_at) values($1,'monthly_report',30,$2,$3,$4,$5)`, [
      uid, m.slice(0, 7), addMonths(m, 1), 'Monthly report', `${addMonths(m, 1)}T09:00:00+05:30`,
    ]);
  }
  await generateReport(uid, addMonths(monthStart(today), -1).slice(0, 7));
  await recomputeCoins(uid);

  // learned rules (learning loop)
  await q(`insert into category_rules(user_id,keyword,category_id,category_hits,necessity,necessity_hits) values($1,'rapido',$2,3,'neutral',3),($1,'zomato',$3,4,'unnecessary',3)`, [uid, C('Transport'), C('Food & Dining')]);

  // kirana list
  for (const [item, qty, est] of [['Atta (Aashirvaad)', '5 kg', 290], ['Toor dal', '1 kg', 160], ['Basmati rice', '5 kg', 650], ['Sunflower oil', '1 L', 165], ['Tea leaves', '500 g', 260], ['Onions', '2 kg', 90]] as const) {
    await q(`insert into kirana_items(user_id,item,qty,est_inr) values($1,$2,$3,$4)`, [uid, item, qty, est]);
  }

  // mark old notifications read, then raise current budget alerts
  await q(`update notifications set read=true where user_id=$1`, [uid]);
  await checkBudgetAlerts(uid, today);
  await q(`insert into job_runs(user_id,job,period_key) values($1,'insights',$2) on conflict do nothing`, [uid, addDays(weekStart(today), -7)]);

  await q(`insert into schema_meta(key,value) values('demo_seeded_on',$1) on conflict(key) do update set value=excluded.value`, [today]);
  console.log(`[demo] seeded ${inserted.length} expenses for ${DEMO_EMAIL} in ${Date.now() - t0} ms (streak ${st.current}, longest ${st.longest})`);
  void monthEnd;
}

function timeOf(iso: string) {
  // iso like 2026-10-20T08:35:00+05:30 (as inserted) or normalised UTC — convert to IST HH:MM
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

async function recomputeCoins(uid: string) {
  const [t] = await q<{ balance: number; lifetime: number }>(
    `select coalesce(sum(coins),0)::int balance, coalesce(sum(coins) filter (where event_type <> 'redeem'),0)::int lifetime from coin_ledger where user_id=$1`,
    [uid],
  );
  await q(`update profiles set coin_balance=$2, lifetime_coins=$3, level=$4 where id=$1`, [uid, t.balance, t.lifetime, levelFor(t.lifetime).level]);
}
