'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/client/api';
import { Button, Chip, cn, Input, Label, Progress } from '@/components/ui';
import { Logo } from '@/components/app-shell';

const GOAL_IDEAS = [
  { name: 'Emergency fund', icon: '🛟', target: 50000 },
  { name: 'Goa trip', icon: '🏖️', target: 25000 },
  { name: 'New phone', icon: '📱', target: 15000 },
  { name: 'Diwali shopping', icon: '🪔', target: 10000 },
];

export function Onboarding({ name, occupations, incomes, personalities }: { name: string; occupations: any[]; incomes: any[]; personalities: any[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<any>({ occupation: null, monthly_income_range: null, payday: '', fixed_rent: '', fixed_emi: '', fixed_subscriptions: '', create_recurring: true, goal: null as any, spending_personality: null, reminder_time: '21:00' });
  const set = (p: any) => setD((x: any) => ({ ...x, ...p }));
  const steps = ['About you', 'Income', 'Fixed costs', 'First goal', 'Your style'];

  async function finish(skipAll = false) {
    setBusy(true);
    try {
      const body = skipAll
        ? {}
        : {
            ...d,
            payday: d.payday ? Number(d.payday) : null,
            fixed_rent: d.fixed_rent ? Number(d.fixed_rent) : null,
            fixed_emi: d.fixed_emi ? Number(d.fixed_emi) : null,
            fixed_subscriptions: d.fixed_subscriptions ? Number(d.fixed_subscriptions) : null,
          };
      const r = await api<any>('/api/onboarding', { body });
      if (r.coins) toast.success(`Welcome! +${r.coins} coins 🪙`, { description: 'Log your first expense to earn the First Log badge.' });
      router.push('/home?add=1');
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  }
  const next = () => (step < steps.length - 1 ? setStep(step + 1) : finish());

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-6">
      <div className="flex items-center gap-2">
        <Logo />
        <span className="font-bold">Wealthwise</span>
        <button className="ml-auto text-sm text-muted hover:text-fg" onClick={() => finish(true)} disabled={busy}>Skip setup</button>
      </div>
      <Progress className="mt-6" value={((step + 1) / steps.length) * 100} />
      <p className="mt-2 text-xs font-medium text-muted">Step {step + 1} of {steps.length} · {steps[step]}</p>

      <div className="mt-6 flex-1">
        {step === 0 && (
          <>
            <h1 className="text-2xl font-bold">Hi {name.split(' ')[0]} 👋 What do you do?</h1>
            <p className="mt-1 text-sm text-muted">Helps us tailor forecasts and nudges. Every step is optional.</p>
            <div className="mt-5 grid gap-2">
              {occupations.map((o) => (
                <button key={o.id} onClick={() => set({ occupation: o.id })} className={cn('rounded-xl border p-4 text-left font-medium transition', d.occupation === o.id ? 'border-primary bg-primary-soft' : 'border-border hover:bg-soft')}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="text-2xl font-bold">Roughly how much comes in each month?</h1>
            <p className="mt-1 text-sm text-muted">Salary, stipend or pocket money. Used for “cost in hours” and affordability — never shared.</p>
            <div className="mt-5 grid gap-2">
              {incomes.map((o) => (
                <button key={o.id} onClick={() => set({ monthly_income_range: o.id })} className={cn('rounded-xl border p-3.5 text-left font-medium transition', d.monthly_income_range === o.id ? 'border-primary bg-primary-soft' : 'border-border hover:bg-soft')}>
                  {o.label}
                </button>
              ))}
            </div>
            {d.monthly_income_range && d.monthly_income_range !== 'none' && (
              <div className="mt-4">
                <Label>Payday (day of month)</Label>
                <Input inputMode="numeric" placeholder="e.g. 1" value={d.payday} onChange={(e) => set({ payday: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-2xl font-bold">Any fixed monthly costs?</h1>
            <p className="mt-1 text-sm text-muted">We’ll use these for your first forecast and can auto-log them each month.</p>
            <div className="mt-5 space-y-3">
              {[
                ['fixed_rent', 'Rent / PG / hostel (₹)'],
                ['fixed_emi', 'EMIs & loan payments (₹)'],
                ['fixed_subscriptions', 'Subscriptions — Netflix, Spotify… (₹)'],
              ].map(([k, l]) => (
                <div key={k}>
                  <Label>{l}</Label>
                  <Input inputMode="numeric" placeholder="0" value={d[k]} onChange={(e) => set({ [k]: e.target.value.replace(/\D/g, '') })} />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.create_recurring} onChange={(e) => set({ create_recurring: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
                Auto-log rent and EMI every month
              </label>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="text-2xl font-bold">Pick a first savings goal</h1>
            <p className="mt-1 text-sm text-muted">Your weekly savings land here virtually. You can add more later.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {GOAL_IDEAS.map((g) => (
                <button key={g.name} onClick={() => set({ goal: { name: g.name, target_inr: g.target, icon: g.icon, deadline: '' } })} className={cn('rounded-xl border p-4 text-left transition', d.goal?.name === g.name ? 'border-primary bg-primary-soft' : 'border-border hover:bg-soft')}>
                  <span className="text-2xl">{g.icon}</span>
                  <p className="mt-1 font-medium">{g.name}</p>
                  <p className="text-xs text-muted">₹{g.target.toLocaleString('en-IN')}</p>
                </button>
              ))}
            </div>
            {d.goal && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <Label>Target (₹)</Label>
                  <Input inputMode="numeric" value={d.goal.target_inr} onChange={(e) => set({ goal: { ...d.goal, target_inr: Number(e.target.value.replace(/\D/g, '')) || 0 } })} />
                </div>
                <div>
                  <Label>By (optional)</Label>
                  <Input type="date" value={d.goal.deadline || ''} onChange={(e) => set({ goal: { ...d.goal, deadline: e.target.value } })} />
                </div>
              </div>
            )}
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="text-2xl font-bold">How would you describe your spending?</h1>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {personalities.map((p) => (
                <button key={p.id} onClick={() => set({ spending_personality: p.id })} className={cn('rounded-xl border p-4 text-left transition', d.spending_personality === p.id ? 'border-primary bg-primary-soft' : 'border-border hover:bg-soft')}>
                  <span className="text-2xl">{p.emoji}</span>
                  <p className="mt-1 font-medium">{p.label}</p>
                  <p className="text-xs text-muted">{p.blurb}</p>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <Label>Daily reminder to log (IST)</Label>
              <div className="flex flex-wrap gap-2">
                {['09:00', '13:00', '20:00', '21:00', '22:00'].map((t) => (
                  <Chip key={t} active={d.reminder_time === t} onClick={() => set({ reminder_time: t })}>{t}</Chip>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-8 flex gap-2">
        {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
        <Button variant="secondary" className="ml-auto" onClick={next} disabled={busy}>Skip</Button>
        <Button onClick={next} loading={busy && step === steps.length - 1}>{step === steps.length - 1 ? 'Finish · +50 🪙' : 'Continue'}</Button>
      </div>
    </div>
  );
}
