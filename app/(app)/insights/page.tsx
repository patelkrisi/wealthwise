'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, Target, TrendingUp } from 'lucide-react';
import { api } from '@/lib/client/api';
import { inr, MOODS, NECESSITY_COLOURS, NECESSITY_LABELS, PAYMENT_LABELS } from '@/lib/format';
import { addMonths, fmtDate, fmtMonth, monthStart, ordinal } from '@/lib/dates';
import { Bars, Donut, Heatmap, Legendish, ScoreLine, StackedMonths, TrendChart } from '@/components/charts';
import { Card, CardTitle, Chip, cn, Empty, PageHeader, Pill, Progress, Segmented, Skeleton, Stat } from '@/components/ui';
import { ExpenseRow } from '@/components/expense-row';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'prediction', label: 'Prediction' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'regret', label: 'Regret score' },
] as const;
type Tab = (typeof TABS)[number]['value'];
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export default function Page() {
  return (
    <Suspense>
      <Insights />
    </Suspense>
  );
}

function Insights() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'overview');
  return (
    <div>
      <PageHeader title="Insights" subtitle="Where your money goes, and where it’s heading" />
      <div className="-mx-1 mb-5 overflow-x-auto px-1 scrollbar-none">
        <Segmented value={tab} onChange={setTab} options={TABS as any} />
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'prediction' && <Prediction />}
      {tab === 'heatmap' && <HeatmapTab />}
      {tab === 'regret' && <RegretTab />}
    </div>
  );
}

function Overview() {
  const [month, setMonth] = useState(monthStart(todayIST()));
  const key = month.slice(0, 7);
  const { data: d } = useQuery<any>({ queryKey: ['overview', key], queryFn: () => api(`/api/analytics/overview?month=${key}`) });
  const isCurrent = month === monthStart(todayIST());
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="rounded-lg p-2 hover:bg-soft" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
        <span className="min-w-36 text-center font-semibold">{fmtMonth(month)}</span>
        <button className="rounded-lg p-2 hover:bg-soft disabled:opacity-30" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
        <Link href={`/reports/${key}`} className="ml-auto text-sm font-medium text-primary">Monthly report →</Link>
      </div>
      {!d ? <Skeleton className="h-96" /> : d.totals.n === 0 ? <Empty icon="📊" title="No spending this month">Charts appear once you log a few expenses.</Empty> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card><Stat label="Spent" value={inr(d.totals.total)} sub={`${d.totals.n} expenses`} /></Card>
            <Card><Stat label="Income" value={inr(d.income)} sub={d.income ? `Kept ${inr(d.income - d.totals.total)}` : 'Log income to see savings'} tone="var(--good)" /></Card>
            <Card><Stat label="Avoidable" value={inr(d.totals.avoidable)} sub="Unnecessary + cut % of Neutral" tone="var(--warn)" /></Card>
            <Card><Stat label="Regret score" value={`${d.totals.regret}/100`} sub="Share tagged Unnecessary" tone={regretTone(d.totals.regret)} /></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>By category</CardTitle>
              <div className="grid items-center gap-4 sm:grid-cols-2">
                <Donut data={d.categories.map((c: any) => ({ label: c.label, value: c.value, colour: c.colour, emoji: c.emoji }))} />
                <Legendish data={d.categories.slice(0, 7).map((c: any) => ({ label: c.label, value: c.value, colour: c.colour, emoji: c.emoji }))} total={d.totals.total} />
              </div>
            </Card>
            <Card>
              <CardTitle>Daily trend · cumulative{isCurrent ? ' vs last month' : ''}</CardTitle>
              <TrendChart data={d.trend} />
            </Card>
            <Card>
              <CardTitle>Necessary vs unnecessary</CardTitle>
              <div className="flex h-5 overflow-hidden rounded-full">
                {(['necessary', 'neutral', 'unnecessary'] as const).map((n) => {
                  const v = d.necessity.find((x: any) => x.label === n)?.value ?? 0;
                  return <div key={n} style={{ width: `${(v / d.totals.total) * 100}%`, background: NECESSITY_COLOURS[n] }} title={`${NECESSITY_LABELS[n]} ${inr(v)}`} />;
                })}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(['necessary', 'neutral', 'unnecessary'] as const).map((n) => {
                  const v = d.necessity.find((x: any) => x.label === n)?.value ?? 0;
                  return (
                    <div key={n}>
                      <p className="flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 rounded-full" style={{ background: NECESSITY_COLOURS[n] }} />{NECESSITY_LABELS[n]}</p>
                      <p className="num font-semibold">{inr(v)}</p>
                      <p className="text-xs text-muted">{Math.round((v / d.totals.total) * 100)}%</p>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card>
              <CardTitle>Payment modes</CardTitle>
              <div className="grid items-center gap-4 sm:grid-cols-2">
                <Donut height={180} data={d.modes.map((m: any, i: number) => ({ label: PAYMENT_LABELS[m.label as keyof typeof PAYMENT_LABELS] || m.label, value: m.value, colour: ['#0f766e', '#6366f1', '#f97316', '#db2777', '#0284c7', '#64748b'][i] }))} />
                <Legendish data={d.modes.map((m: any, i: number) => ({ label: PAYMENT_LABELS[m.label as keyof typeof PAYMENT_LABELS] || m.label, value: m.value, colour: ['#0f766e', '#6366f1', '#f97316', '#db2777', '#0284c7', '#64748b'][i] }))} />
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardTitle>Month over month</CardTitle>
              <StackedMonths data={d.mom} />
            </Card>
            <Card>
              <CardTitle>Average by weekday</CardTitle>
              <Bars data={d.weekdays.map((w: any) => ({ ...w, colour: ['Sat', 'Sun'].includes(w.label) ? '#f97316' : undefined }))} height={180} />
              <p className="mt-2 text-xs text-muted">Weekends in orange — spot your weekend spikes.</p>
            </Card>
            <WhatIf />
          </div>
          <Advanced />
        </>
      )}
    </div>
  );
}

function WhatIf() {
  const [target, setTarget] = useState('unnecessary');
  const [pct, setPct] = useState(50);
  const { data } = useQuery<any>({ queryKey: ['whatif', target, pct], queryFn: () => api(`/api/analytics/whatif?target=${encodeURIComponent(target)}&pct=${pct}`) });
  return (
    <Card>
      <CardTitle><span className="flex items-center gap-1.5"><Target className="h-4 w-4 text-primary" /> What-if simulator</span></CardTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        {[['unnecessary', 'Unnecessary'], ['food delivery', 'Food delivery'], ['Shopping', 'Shopping'], ['Entertainment & Subscriptions', 'Entertainment'], ['Food & Dining', 'Food & Dining']].map(([v, l]) => (
          <Chip key={v} active={target === v} onClick={() => setTarget(v)}>{l}</Chip>
        ))}
      </div>
      <label className="flex items-center gap-3 text-sm">
        Cut by <input type="range" min={10} max={100} step={10} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" aria-label="Cut percentage" />
        <b className="num w-10 text-right">{pct}%</b>
      </label>
      {data && (
        <div className="mt-4 rounded-xl bg-soft p-4">
          <p className="text-sm text-muted">You spend about <b className="text-fg">{inr(data.current_weekly_inr)}</b>/week on {data.target}. Cutting it by {pct}% saves:</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[['week', data.saves_per_week_inr], ['month', data.saves_per_month_inr], ['year', data.saves_per_year_inr]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-card p-2"><p className="num text-lg font-bold text-good">{inr(v as number)}</p><p className="text-xs text-muted">per {l}</p></div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function Advanced() {
  const { data } = useQuery<any>({ queryKey: ['advanced'], queryFn: () => api('/api/analytics/advanced') });
  if (!data) return null;
  if (!data.unlocked)
    return (
      <Card className="flex flex-wrap items-center gap-3">
        <Lock className="h-5 w-5 text-muted" />
        <div className="flex-1"><p className="font-semibold">Advanced analytics</p><p className="text-sm text-muted">Mood patterns and the chai/auto micro-spend tracker. Unlock for 800 coins.</p></div>
        <Link href="/rewards#store" className="text-sm font-medium text-primary">Open store →</Link>
      </Card>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>Mood × spending (90 days)</CardTitle>
        {data.mood.length === 0 ? <p className="text-sm text-muted">Tag a mood when you log to reveal emotional spending patterns.</p> : (
          <ul className="space-y-3">
            {data.mood.map((m: any) => {
              const mo = MOODS.find((x) => x.id === m.mood);
              return (
                <li key={m.mood}>
                  <div className="flex justify-between text-sm"><span>{mo?.emoji} {mo?.label} <span className="text-muted">· {m.n} buys</span></span><span className="num font-medium">{inr(m.total)}</span></div>
                  <Progress className="mt-1" value={(m.unnecessary / Math.max(1, m.total)) * 100} tone="var(--bad)" height={6} />
                  <p className="mt-0.5 text-xs text-muted">{Math.round((m.unnecessary / Math.max(1, m.total)) * 100)}% unnecessary</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <CardTitle>☕ Micro-spend tracker (30 days)</CardTitle>
        {data.micro.items.length === 0 ? <p className="text-sm text-muted">No chai, coffee or auto micro-spends yet.</p> : (
          <>
            <ul className="space-y-2">
              {data.micro.items.map((m: any) => (
                <li key={m.item} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{m.item} <span className="text-muted">× {m.count}</span></span>
                  <span className="num">{inr(m.total)} <span className="text-xs text-muted">→ {inr(m.yearly)}/yr</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-xl bg-soft p-3 text-sm">Small stuff adds up: <b>{inr(data.micro.total)}</b> this month ≈ <b>{inr(Math.round(data.micro.total * 12.17))}</b> a year.</p>
          </>
        )}
      </Card>
    </div>
  );
}

function Prediction() {
  const { data: f } = useQuery<any>({ queryKey: ['forecast'], queryFn: () => api('/api/forecast') });
  if (!f) return <Skeleton className="h-96" />;
  const methodLabel = { cold_start: 'Starter estimate (fixed costs + typical spend)', weighted_average: 'Weighted average of recent months', regression: 'Trend model with festival & seasonal effects' }[f.method as string];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle><span className="flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-primary" /> {f.monthLabel}</span></CardTitle>
          <p className="num text-4xl font-bold">{inr(f.total.predicted)}</p>
          <p className="num mt-1 text-sm text-muted">80% likely between {inr(f.total.low)} and {inr(f.total.high)}</p>
          <p className="mt-3">{f.explanation}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill>{methodLabel}</Pill>
            <Pill>{f.historyMonths} month{f.historyMonths === 1 ? '' : 's'} of history</Pill>
            {f.festivals.map((x: string) => <Pill key={x} className="bg-warn/10 text-warn">🪔 {x}</Pill>)}
          </div>
        </Card>
        <Card>
          <CardTitle>How accurate is this?</CardTitle>
          {f.accuracy ? (
            <>
              <p className="text-sm text-muted">For {f.accuracy.monthLabel} we would have predicted</p>
              <p className="num text-2xl font-bold">{inr(f.accuracy.predicted)}</p>
              <p className="text-sm text-muted">You actually spent <b className="num text-fg">{inr(f.accuracy.actual)}</b> ({Math.abs(Math.round(((f.accuracy.predicted - f.accuracy.actual) / f.accuracy.actual) * 100))}% off).</p>
              {f.accuracy.mape != null && <p className="mt-3 text-xs text-muted">Average error over {f.accuracy.months} backtested month{f.accuracy.months > 1 ? 's' : ''}: <b>{Math.round(f.accuracy.mape * 100)}%</b></p>}
            </>
          ) : <p className="text-sm text-muted">After your first full month we’ll show how close the forecast was.</p>}
        </Card>
      </div>
      {f.warnings.length > 0 && (
        <Card>
          <CardTitle>Overspend early warnings · this month</CardTitle>
          <ul className="space-y-2">
            {f.warnings.map((w: any) => (
              <li key={w.category} className="flex items-start gap-2 rounded-xl bg-warn/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                {w.alreadyOver ? <span>{w.emoji} <b>{w.category}</b> has crossed its {inr(w.limit)} budget ({inr(w.spent)} spent).</span>
                  : <span>At this pace you’ll exceed your <b>{w.category}</b> budget by <b>{inr(w.over)}</b>{w.crossDate ? <> on the <b>{ordinal(Number(w.crossDate.slice(8)))}</b></> : ''} (projected {inr(w.projected)} vs {inr(w.limit)}).</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardTitle>By category</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-medium">Category</th><th className="pb-2 text-right font-medium">Last month</th><th className="pb-2 text-right font-medium">Predicted</th><th className="pb-2 pl-4 font-medium">Likely range</th></tr></thead>
            <tbody className="divide-y divide-border">
              {f.categories.map((c: any) => {
                const max = f.categories[0].high;
                return (
                  <tr key={c.category}>
                    <td className="py-2.5 font-medium">{c.category}</td>
                    <td className="num py-2.5 text-right text-muted">{inr(c.lastMonth)}</td>
                    <td className={cn('num py-2.5 text-right font-semibold', c.predicted > c.lastMonth * 1.15 && 'text-warn')}>{inr(c.predicted)}</td>
                    <td className="py-2.5 pl-4">
                      <div className="relative h-2 w-full min-w-24 rounded-full bg-soft">
                        <div className="absolute h-2 rounded-full bg-primary/40" style={{ left: `${(c.low / max) * 100}%`, width: `${((c.high - c.low) / max) * 100}%` }} />
                        <div className="absolute -top-0.5 h-3 w-1 rounded bg-primary" style={{ left: `${(c.predicted / max) * 100}%` }} />
                      </div>
                      <p className="num mt-1 text-[11px] text-muted">{inr(c.low)} – {inr(c.high)}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {f.drivers.length > 0 && (
          <div className="mt-4 rounded-xl bg-soft p-3 text-sm">
            <p className="mb-1 font-semibold">Top drivers</p>
            {f.drivers.map((d: any) => <p key={d.category}>• {d.category}: {d.delta >= 0 ? '+' : '−'}{inr(Math.abs(d.delta))} — {d.reason}</p>)}
          </div>
        )}
      </Card>
    </div>
  );
}

function HeatmapTab() {
  const { data } = useQuery<any>({ queryKey: ['heatmap'], queryFn: () => api('/api/analytics/heatmap?days=150') });
  const [day, setDay] = useState<string | null>(null);
  const { data: dayRows } = useQuery<any>({ queryKey: ['expenses', 'day', day], queryFn: () => api(`/api/expenses?from=${day}&to=${day}`), enabled: !!day });
  if (!data) return <Skeleton className="h-60" />;
  const vals = data.days.filter((d: any) => d.value > 0);
  const weekendAvg = avg(vals.filter((d: any) => d.weekend).map((d: any) => d.value));
  const weekdayAvg = avg(vals.filter((d: any) => !d.weekend).map((d: any) => d.value));
  const top = [...data.days].sort((a: any, b: any) => b.value - a.value).slice(0, 3);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="min-w-0 lg:col-span-2">
        <CardTitle>Daily spend · last 5 months</CardTitle>
        <Heatmap days={data.days} onPick={setDay} />
        {day && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-1 text-sm font-semibold">{fmtDate(day)} · <span className="num">{inr(data.days.find((d: any) => d.day === day)?.value ?? 0)}</span></p>
            {dayRows?.rows.length ? <div className="-mx-2">{dayRows.rows.map((e: any) => <ExpenseRow key={e.id} e={e} compact />)}</div> : <p className="text-sm text-muted">Nothing logged.</p>}
          </div>
        )}
      </Card>
      <Card>
        <CardTitle>Patterns</CardTitle>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-muted">Avg weekday</span><b className="num">{inr(weekdayAvg)}</b></div>
          <div className="flex justify-between"><span className="text-muted">Avg weekend day</span><b className="num">{inr(weekendAvg)}</b></div>
          {weekendAvg > weekdayAvg * 1.2 && <p className="rounded-xl bg-warn/10 p-2 text-xs">Weekends run <b>{Math.round((weekendAvg / weekdayAvg - 1) * 100)}%</b> higher than weekdays.</p>}
          <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Biggest days</p>
          {top.map((t: any) => (
            <button key={t.day} onClick={() => setDay(t.day)} className="flex w-full justify-between rounded-lg px-1 py-1 hover:bg-soft"><span>{fmtDate(t.day)}{t.payday ? ' · payday' : ''}</span><b className="num">{inr(t.value)}</b></button>
          ))}
          <p className="pt-2 text-xs text-muted">Tap any square to see that day.</p>
        </div>
      </Card>
    </div>
  );
}
const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);

const regretTone = (n: number) => (n <= 20 ? 'var(--good)' : n <= 40 ? 'var(--warn)' : 'var(--bad)');
const regretWord = (n: number) => (n <= 20 ? 'Healthy' : n <= 40 ? 'Room to trim' : 'A lot was avoidable');

function RegretTab() {
  const { data } = useQuery<any>({ queryKey: ['regret'], queryFn: () => api('/api/analytics/regret') });
  if (!data) return <Skeleton className="h-60" />;
  const cur = data.weeks[data.weeks.length - 1];
  const prev = data.weeks[data.weeks.length - 2];
  const ddmm = (d: string) => d.slice(8) + '/' + d.slice(5, 7);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardTitle>This week’s Regret score</CardTitle>
        <p className="num text-5xl font-bold" style={{ color: regretTone(cur.score) }}>{cur.score}</p>
        <p className="mt-1 text-sm text-muted">out of 100 · lower is better · <span style={{ color: regretTone(cur.score) }} className="font-medium">{regretWord(cur.score)}</span></p>
        {prev && <p className="mt-3 text-sm">{cur.score < prev.score ? '👏 Down' : cur.score === prev.score ? '➖ Same as' : '⚠️ Up'} {cur.score === prev.score ? '' : 'from '}<b>{prev.score}</b> last week.</p>}
        <p className="mt-4 text-xs text-muted">{cur.total > 0 ? <>You tagged {inr(cur.unnecessary)} of this week’s {inr(cur.total)} as Unnecessary.</> : 'No spending logged this week yet.'}</p>
      </Card>
      <Card className="lg:col-span-2">
        <CardTitle>Last {data.weeks.length} weeks</CardTitle>
        <ScoreLine data={data.weeks.map((w: any) => ({ label: ddmm(w.week), score: w.score }))} />
        <p className="mt-2 text-xs text-muted">Each dot is one week (Monday to Sunday). Stay under the dashed line at 20.</p>
      </Card>

      <Card className="lg:col-span-3">
        <CardTitle>Understanding your Regret score</CardTitle>
        <div className="grid gap-6 text-sm leading-relaxed md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">What it is</h3>
              <p className="mt-1 text-muted">A number from 0 to 100 that shows how much of your week’s spending went on things you marked <b className="text-fg">Unnecessary</b>. Think of it as “out of every ₹100 I spent, how much did I not really need?” Lower is better.</p>
            </div>
            <div>
              <h3 className="font-semibold">How it’s worked out</h3>
              <div className="mt-2 rounded-xl bg-soft p-3 text-center font-medium">Regret score = Unnecessary spend ÷ Total spend × 100</div>
              <p className="mt-2 text-muted">
                {cur.total > 0 ? (
                  <>This week: {inr(cur.unnecessary)} ÷ {inr(cur.total)} × 100 = <b className="text-fg">{cur.score}</b>.</>
                ) : (
                  <>Example: if you spend ₹5,000 in a week and ₹1,000 of it was Unnecessary, your score is 1,000 ÷ 5,000 × 100 = <b className="text-fg">20</b>.</>
                )}
              </p>
            </div>
            <div>
              <h3 className="font-semibold">What it looks at</h3>
              <ul className="mt-1 space-y-1 text-muted">
                <li>• <b className="text-fg">Only one thing decides “Unnecessary”: you.</b> It’s the tag you pick when you log an expense (Necessary, Neutral or Unnecessary).</li>
                <li>• <b className="text-fg">Necessary</b> (rent, groceries, medicine) and <b className="text-fg">Neutral</b> (nice-to-haves) don’t raise the score — they only count in the total.</li>
                <li>• It uses the <b className="text-fg">share</b>, not the amount, so a big week isn’t punished for being big.</li>
                <li>• Each week runs Monday to Sunday. A week with no spending scores 0.</li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">How to read the graph</h3>
              <ul className="mt-1 space-y-1 text-muted">
                <li>• <b className="text-fg">Left to right</b> is time: each label is the Monday a week started; the last dot is this week, still in progress.</li>
                <li>• <b className="text-fg">Up and down</b> is the score: higher dots mean more of that week’s money went on things you didn’t need.</li>
                <li>• The <b className="text-fg">dashed green line at 20</b> is a healthy target — dots below it are good weeks.</li>
                <li>• A line <b className="text-fg">sloping down</b> means you’re improving. Hover or tap a dot to see its exact score.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold">What’s a good score?</h3>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl p-2" style={{ background: 'color-mix(in srgb, var(--good) 14%, transparent)' }}><p className="num text-base font-bold" style={{ color: 'var(--good)' }}>0–20</p>Healthy</div>
                <div className="rounded-xl p-2" style={{ background: 'color-mix(in srgb, var(--warn) 14%, transparent)' }}><p className="num text-base font-bold" style={{ color: 'var(--warn)' }}>21–40</p>Room to trim</div>
                <div className="rounded-xl p-2" style={{ background: 'color-mix(in srgb, var(--bad) 14%, transparent)' }}><p className="num text-base font-bold" style={{ color: 'var(--bad)' }}>41–100</p>A lot was avoidable</div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold">How to bring it down</h3>
              <p className="mt-1 text-muted">Tag honestly, then try to beat last week’s number. Put wants over ₹1,000 on the cool-off list, and join a challenge like “No Swiggy Week” in Rewards. Cutting Unnecessary spending is also what grows your weekly savings on Home.</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
