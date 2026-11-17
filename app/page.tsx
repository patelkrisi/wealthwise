import Link from 'next/link';
import { ArrowRight, Brain, CalendarDays, Coins, Mic, PiggyBank, ShieldCheck, Sparkles, Tags, TrendingUp } from 'lucide-react';
import { currentUser } from '@/lib/auth';
import { DemoButton } from '@/components/demo-button';
import { Logo } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

const FEATURES = [
  { icon: Mic, title: 'Log in 5 seconds', text: 'Fill a short form, type one sentence, or just say it — in Hindi, English or Hinglish. AI fills every field; you confirm.' },
  { icon: Tags, title: 'Necessary or not?', text: 'Tag each expense Necessary, Neutral or Unnecessary and see your real “avoidable spend” every week.' },
  { icon: TrendingUp, title: 'Next month, predicted', text: 'A forecast per category with a likely range — Diwali, Rakhi and wedding season included.' },
  { icon: Brain, title: 'Ask Wealthwise', text: '“Where did I spend the most?” “Can I afford a ₹15,000 phone?” Answers from your own numbers.' },
  { icon: PiggyBank, title: 'Savings that stick', text: 'Weekly targets, goal jars, a 24-hour cool-off list and challenges like “No Swiggy Week”.' },
  { icon: Coins, title: 'Coins, streaks, badges', text: 'Rewards for good habits — never for how much you earn. Level up from Paisa Starter to Wealth Wizard.' },
];

export default async function Landing() {
  const user = await currentUser();
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-5">
        <Logo />
        <span className="text-lg font-bold tracking-tight">Wealthwise</span>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link href="/home" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">Open app</Link>
          ) : (
            <>
              <Link href="/auth" className="rounded-xl px-3 py-2 text-sm font-medium hover:bg-soft">Log in</Link>
              <Link href="/auth?mode=signup" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">Get started</Link>
            </>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-[1.1fr_.9fr] lg:pt-16">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI personal finance, made for India · ₹
          </span>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Track.
            <br />
            Tag. <span className="text-primary">Save.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Log what you spent, tag whether you needed it, and Wealthwise shows how much you could have saved — then rewards you for actually saving it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={user ? '/home' : '/auth?mode=signup'} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-fg shadow-sm hover:opacity-90">
              Get started — it’s free <ArrowRight className="h-4 w-4" />
            </Link>
            {!user && <DemoButton />}
          </div>
          <p className="mt-4 text-sm text-muted">Demo login: <b className="text-fg">demo@wealthwise.app</b> · <b className="text-fg">Demo@1234</b></p>
        </div>
        <PhoneDemo />
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-4 rounded-3xl bg-primary p-8 text-primary-fg sm:grid-cols-3">
          {[
            ['5 sec', 'to log an expense, three ways'],
            ['₹4.6 lakh', '₹2,000/month of avoidable spend, invested at 12% for 10 years'],
            ['0', 'bank passwords asked for. Ever.'],
          ].map(([a, b]) => (
            <div key={a}>
              <p className="text-3xl font-extrabold">{a}</p>
              <p className="mt-1 text-sm opacity-85">{b}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 flex items-center justify-center gap-2 text-center text-xs text-muted">
          <ShieldCheck className="h-4 w-4" /> Your data stays yours: export or delete it any time (DPDP Act 2023). Wealthwise gives spending insights, not investment, tax or financial advice.
        </p>
        <p className="mt-3 flex justify-center gap-4 text-xs text-muted">
          <Link href="/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/terms" className="hover:text-fg">Terms</Link>
        </p>
      </section>
    </div>
  );
}

/** Animated "demo" of sentence → filled form (stands in for the demo GIF). */
function PhoneDemo() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/25 via-primary-2/10 to-transparent blur-2xl" />
      <div className="rounded-[2.2rem] border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between text-xs text-muted">
          <span>Add expense · Speak</span>
          <span className="flex items-center gap-1 rounded-full bg-bad/10 px-2 py-0.5 font-medium text-bad"><CalendarDays className="h-3 w-3" />Listening</span>
        </div>
        <div className="rounded-2xl bg-soft p-3 text-sm">
          <span className="text-muted">“</span>kal Rohit ke saath <b>250</b> ka chai samosa, <b>UPI</b> se<span className="text-muted">”</span>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {[
            ['Date', '19/10/2026 (kal)'],
            ['Name', 'Chai samosa'],
            ['Amount', '₹250'],
            ['Category', '🍽️ Food & Dining · 92%'],
            ['Necessity', 'Neutral (suggested)'],
            ['Mode', 'UPI'],
            ['Notes', 'with Rohit'],
          ].map(([k, v], i) => (
            <div key={k} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 opacity-0" style={{ animation: `fadein .4s ease ${0.3 + i * 0.25}s forwards` }}>
              <span className="text-muted">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-primary py-2.5 text-center text-sm font-semibold text-primary-fg opacity-0" style={{ animation: 'fadein .4s ease 2.2s forwards' }}>
          Saved · +2 🪙 · 🔥 39-day streak
        </div>
      </div>
      <style>{`@keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
