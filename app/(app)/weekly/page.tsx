'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw, Sparkles } from 'lucide-react';
import { api } from '@/lib/client/api';
import { inr } from '@/lib/format';
import { addDays, fmtDate } from '@/lib/dates';
import { Bars } from '@/components/charts';
import { Button, Card, CardTitle, cn, PageHeader, Progress, Rich, Skeleton } from '@/components/ui';

export default function Page() {
  return (
    <Suspense>
      <Weekly />
    </Suspense>
  );
}

function Weekly() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['weekly'], queryFn: () => api('/api/savings/weekly') });
  const [sel, setSel] = useState<string | null>(sp.get('week'));
  const [busy, setBusy] = useState(false);
  if (!data) return <Skeleton className="h-96" />;
  const c = data.current;
  const week = sel ? data.history.find((h: any) => h.week_start === sel) : data.history[0];
  const ins = week ? data.insights.find((i: any) => i.week_start === week.week_start) : data.insights[0];
  return (
    <div className="space-y-4">
      <PageHeader title="Weekly review" subtitle="Every Sunday at 11 pm your week closes: avoidable spend, target hit or missed, coins, next week’s target" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>This week so far</CardTitle>
          <p className="text-sm text-muted">{fmtDate(c.weekStart)} – {fmtDate(addDays(c.weekStart, 6))} · {c.daysLeft} days left</p>
          <p className="num mt-3 text-3xl font-bold">{inr(c.avoidable)}</p>
          <p className="text-xs text-muted">avoidable · allowance {inr(c.allowance)} to hit a {inr(c.target)} cut ({c.cutPct}% target)</p>
          <Progress className="mt-3" value={c.allowance ? (c.avoidable / c.allowance) * 100 : 0} tone={c.onTrack ? 'var(--good)' : 'var(--bad)'} />
          <p className={cn('mt-2 text-sm font-medium', c.onTrack ? 'text-good' : 'text-bad')}>{c.onTrack ? `On track to save ${inr(c.projectedSaving)}` : 'Over the allowance — a quiet weekend fixes it'}</p>
          <Link href="/rewards" className="mt-4 inline-block text-sm font-medium text-primary">Boost it with a challenge →</Link>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Avoidable spend by week</CardTitle>
          <Bars
            height={200}
            data={[...data.history].reverse().map((h: any) => ({ label: h.week_start.slice(8) + '/' + h.week_start.slice(5, 7), value: Math.round(h.avoidable_inr), colour: h.achieved ? 'var(--good)' : '#e11d48' }))}
          />
          <p className="mt-1 text-xs text-muted">Green = target hit, red = missed.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-0">
          <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
            {data.history.map((h: any) => (
              <li key={h.week_start}>
                <button onClick={() => setSel(h.week_start)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-soft', week?.week_start === h.week_start && 'bg-primary-soft')}>
                  <span className="text-xl">{h.achieved ? '✅' : '➖'}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">Week of {fmtDate(h.week_start)}</span>
                    <span className="block text-xs text-muted">Avoidable {inr(h.avoidable_inr)} · target cut {inr(h.target_inr)}</span>
                  </span>
                  {h.achieved && <span className="num text-sm font-semibold text-good">+{inr(h.saved_inr)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {week && (
          <Card>
            <CardTitle action={<Button size="sm" variant="ghost" loading={busy} onClick={async () => { setBusy(true); try { await api('/api/insights/refresh', { method: 'POST' }); qc.invalidateQueries({ queryKey: ['weekly'] }); toast.success('Insights refreshed'); } catch (e: any) { toast.error(e.message); } setBusy(false); }}><RefreshCw className="h-4 w-4" /></Button>}>
              Week of {fmtDate(week.week_start)}
            </CardTitle>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-soft p-3"><p className="text-xs text-muted">Avoidable</p><p className="num font-semibold">{inr(week.avoidable_inr)}</p><p className="text-[11px] text-muted">was {inr(week.prev_avoidable_inr)}</p></div>
              <div className="rounded-xl bg-soft p-3"><p className="text-xs text-muted">Target cut</p><p className="num font-semibold">{inr(week.target_inr)}</p><p className="text-[11px] text-muted">{week.cut_pct}%</p></div>
              <div className={cn('rounded-xl p-3', week.achieved ? 'bg-good/10' : 'bg-soft')}><p className="text-xs text-muted">Result</p><p className="font-semibold">{week.achieved ? `Saved ${inr(week.saved_inr)}` : 'Missed'}</p><p className="text-[11px] text-muted">{week.achieved ? `+100${week.saved_inr >= week.target_inr * 1.2 ? ' +50' : ''} 🪙${week.goal_name ? ` · → ${week.goal_icon} ${week.goal_name}` : ''}` : 'next week resets to 30%'}</p></div>
            </div>
            {ins && (
              <div className="mt-4 space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> 3 insights + 1 action <span className="text-xs font-normal text-muted">({ins.source === 'claude' ? 'Claude' : 'rules'})</span></p>
                {ins.content.insights.map((t: string, i: number) => <Rich key={i} text={`${i + 1}. ${t}`} className="text-sm text-muted" />)}
                <div className="rounded-xl border border-primary/30 bg-primary-soft p-3 text-sm"><b>Action:</b> <Rich text={ins.content.action} className="inline" /></div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
