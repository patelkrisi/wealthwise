'use client';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, CalendarHeart, ChevronRight, Clock, Moon, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { api } from '@/lib/client/api';
import { inr, inrCompact } from '@/lib/format';
import { Button, Card, CardTitle, cn, Progress, Rich, Ring, Skeleton, Empty } from '@/components/ui';
import { ExpenseRow } from '@/components/expense-row';
import { useAddExpense, celebrate } from '@/components/add-expense';
import { fmtDate, ordinal } from '@/lib/dates';

export default function HomePage() {
  const { data: d, isLoading } = useQuery<any>({ queryKey: ['dashboard'], queryFn: () => api('/api/dashboard') });
  const { open } = useAddExpense();
  const qc = useQueryClient();
  if (isLoading || !d) return <HomeSkeleton />;
  const m = d.month;
  const used = m.budget ? (m.budgetedSpent / m.budget) * 100 : 0;
  const w = d.week;
  const g = d.gamification;

  async function quick(t: any) {
    try {
      const r = await api<any>('/api/expenses', {
        body: { spent_on: d.today, name: t.name, amount_inr: t.amount_inr, category_id: t.category_id, necessity: t.necessity, payment_mode: t.payment_mode, entry_method: 'quick', ai_category_id: t.category_id, ai_necessity: t.necessity },
      });
      celebrate(r);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function noSpend() {
    try {
      const r = await api<any>('/api/no-spend', { method: 'POST' });
      toast.success(`No-spend day marked · 🔥 ${r.streak}-day streak`, { description: r.events.length ? `+${r.events.reduce((s: number, e: any) => s + e.coins, 0)} coins` : undefined });
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      {/* greeting */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{d.greeting},</p>
          <h1 className="text-2xl font-bold tracking-tight">{d.profile.name.split(' ')[0]} 👋</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/rewards" className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
            <span className="text-2xl"><span className={g.streak.current ? 'flame' : ''}>🔥</span></span>
            <span>
              <span className="num block text-lg font-bold leading-none">{g.streak.current}</span>
              <span className="text-[11px] text-muted">day streak</span>
            </span>
          </Link>
          <Link href="/rewards" className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
            <span className="text-2xl">🪙</span>
            <span>
              <span className="num block text-lg font-bold leading-none">{g.coins.toLocaleString('en-IN')}</span>
              <span className="text-[11px] text-muted">{g.level.name}</span>
            </span>
          </Link>
        </div>
      </div>

      {/* banners */}
      {g.streak.atRisk && !g.streak.loggedToday && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-coin/40 bg-coin/10 px-4 py-3 text-sm">
          <span>🔥 Your {g.streak.current}-day streak is waiting for today’s log.</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => open()}>Log expense</Button>
            {!d.noSpendToday && <Button size="sm" variant="outline" onClick={noSpend}>Spent nothing today</Button>}
          </div>
        </div>
      )}
      {d.paydayMode && (
        <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
          <Zap className="h-4 w-4 text-primary" /> <b>Payday mode is on.</b> Impulse spend peaks in the 3 days after salary — alerts are stricter (70%).
        </div>
      )}
      {d.warnings.map((wn: any) => (
        <Link key={wn.category} href="/goals" className="flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
          <span>
            {wn.alreadyOver ? (
              <>{wn.emoji} <b>{wn.category}</b> is over budget: {inr(wn.spent)} of {inr(wn.limit)}.</>
            ) : (
              <>At this pace you’ll exceed your <b>{wn.category}</b> budget by <b>{inr(wn.over)}</b>{wn.crossDate ? <> around the <b>{ordinal(Number(wn.crossDate.slice(8)))}</b></> : ''}.</>
            )}
          </span>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted" />
        </Link>
      ))}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* month ring */}
        <Card className="lg:col-span-1">
          <CardTitle action={<Link href="/insights" className="text-xs font-medium text-primary">Insights</Link>}>{d.monthLabel}</CardTitle>
          <div className="flex items-center gap-5">
            <Ring value={used} size={128} tone={used >= 100 ? 'var(--bad)' : used >= 80 ? 'var(--warn)' : undefined} label={`${Math.round(used)}% of budget used`}>
              <div>
                <p className="num text-lg font-bold leading-tight">{inrCompact(m.budget ? m.budgetedSpent : m.spent)}</p>
                <p className="text-[11px] text-muted">{m.budget ? `of ${inrCompact(m.budget)} budget` : 'spent'}</p>
              </div>
            </Ring>
            <div className="space-y-2.5 text-sm">
              <div><p className="text-xs text-muted">Total spent</p><p className="num font-semibold">{inr(m.spent)}</p>{m.fixedSpent > 0 && <p className="text-[11px] text-muted">incl. {inr(m.fixedSpent)} recurring</p>}</div>
              <div><p className="text-xs text-muted">Likely month-end</p><p className="num font-semibold">{inr(m.projected)}</p></div>
              <div><p className="text-xs text-muted">Unnecessary</p><p className={cn('num font-semibold', m.unnecessary > 0 ? 'text-bad' : 'text-good')}>{inr(m.unnecessary)}</p></div>
            </div>
          </div>
          {!m.budget && <Link href="/goals" className="mt-3 block text-xs font-medium text-primary">Set budgets to track this ring →</Link>}
        </Card>

        {/* avoidable + weekly target */}
        <Card>
          <CardTitle action={<Link href="/weekly" className="text-xs font-medium text-primary">Weekly review</Link>}>Avoidable this week</CardTitle>
          <p className="num text-3xl font-bold">{inr(w.avoidable)}</p>
          <p className="mt-1 text-xs text-muted">
            Unnecessary {inr(w.unnecessary)} + {inr(w.neutral)} Neutral × your cut % · {w.daysLeft} day{w.daysLeft === 1 ? '' : 's'} left
          </p>
          <div className="mt-4 rounded-xl bg-soft p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Savings target</span>
              <span className="num font-semibold">{inr(w.target)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Keep avoidable under <b className="text-fg">{inr(w.allowance)}</b> (last week {inr(w.prevAvoidable)}){w.goal ? <> → saves into {w.goal.icon} {w.goal.name}</> : ''}
            </p>
            <Progress className="mt-2" value={w.allowance ? (w.avoidable / w.allowance) * 100 : w.avoidable ? 100 : 0} tone={w.onTrack ? 'var(--good)' : 'var(--bad)'} />
            <p className={`mt-1.5 text-xs font-medium ${w.onTrack ? 'text-good' : 'text-bad'}`}>{w.onTrack ? `On track — ${inr(w.projectedSaving)} saved so far` : `Over by ${inr(w.avoidable - w.allowance)} — skip a treat or two`}</p>
          </div>
        </Card>

        {/* forecast */}
        <Card>
          <CardTitle action={<Link href="/insights?tab=prediction" className="text-xs font-medium text-primary">Details</Link>}>
            <span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-primary" /> {d.forecast.month} forecast</span>
          </CardTitle>
          <p className="num text-3xl font-bold">{inr(d.forecast.total.predicted)}</p>
          <p className="num mt-1 text-xs text-muted">likely {inr(d.forecast.total.low)} – {inr(d.forecast.total.high)}</p>
          <p className="mt-3 text-sm text-muted">{d.forecast.explanation}</p>
          {d.forecast.festivals.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warn"><CalendarHeart className="h-3.5 w-3.5" /> {d.forecast.festivals.join(' · ')}</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle action={<Link href="/transactions" className="flex items-center gap-1 text-xs font-medium text-primary">All <ArrowRight className="h-3 w-3" /></Link>}>Recent expenses</CardTitle>
          {d.recent.length ? (
            <div className="-mx-2">
              {d.recent.map((e: any) => (
                <div key={e.id} className="flex items-center">
                  <div className="flex-1"><ExpenseRow e={e} compact /></div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="🌱" title="Log your first expense" action={<Button onClick={() => open()}>Add expense</Button>}>Takes 5 seconds — type it, say it, or fill the form. You’ll earn the First Log badge.</Empty>
          )}
          {d.quickAdd.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Quick add</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {d.quickAdd.map((t: any) => (
                  <button key={t.name + t.amount_inr} onClick={() => quick(t)} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm transition hover:bg-soft active:scale-[.98]">
                    <span className="text-lg">{t.emoji}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="num text-xs text-muted">{inr(t.amount_inr)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="bg-gradient-to-br from-primary-soft to-card">
            <CardTitle><span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> Insight of the day</span></CardTitle>
            <Rich text={d.insight.text} className="text-sm leading-relaxed text-muted" />
            <Link href="/assistant" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">Ask Wealthwise <ArrowRight className="h-3 w-3" /></Link>
          </Card>

          {d.nudges && (
            <Card>
              <CardTitle>What avoidable spend really costs</CardTitle>
              {d.nudges.costInHours?.hours != null && (
                <p className="flex gap-2 text-sm"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><span>This week’s <b>{d.nudges.costInHours.name}</b> ({inr(d.nudges.costInHours.amount)}) = <b>{d.nudges.costInHours.hours} hours</b> of your salary.</span></p>
              )}
              {d.nudges.opportunity.monthlyAvoidable > 0 && (
                <p className="mt-3 flex gap-2 text-sm"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><span><b>{inr(d.nudges.opportunity.monthlyAvoidable)}/month</b> of avoidable spend, invested at 12% for 10 years ≈ <b>{inr(d.nudges.opportunity.in10y)}</b>.</span></p>
              )}
              <p className="mt-3 text-[11px] text-muted">Illustration only — not investment advice.</p>
            </Card>
          )}

          {!g.streak.loggedToday && !d.noSpendToday && (
            <Card className="flex items-center gap-3">
              <Moon className="h-5 w-5 text-muted" />
              <p className="flex-1 text-sm">Didn’t spend anything today?</p>
              <Button size="sm" variant="outline" onClick={noSpend}>Mark no-spend</Button>
            </Card>
          )}

          {d.festivals.length > 0 && (
            <Card>
              <CardTitle action={<Link href="/goals#packs" className="text-xs font-medium text-primary">Plan</Link>}>Coming up</CardTitle>
              <ul className="space-y-2 text-sm">
                {d.festivals.map((f: any) => (
                  <li key={f.name + f.date} className="flex items-center gap-2"><span className="text-lg">{f.emoji}</span>{f.name}<span className="ml-auto text-xs text-muted">{fmtDate(f.date)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-14 w-60" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
