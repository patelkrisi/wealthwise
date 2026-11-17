'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Download, Share2, Sparkles } from 'lucide-react';
import { api } from '@/lib/client/api';
import { inr, NECESSITY_COLOURS, NECESSITY_LABELS } from '@/lib/format';
import { fmtDate } from '@/lib/dates';
import { Donut, Legendish, TrendChart } from '@/components/charts';
import { Button, Card, CardTitle, PageHeader, Rich, Skeleton, Stat } from '@/components/ui';

export default function ReportPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = use(params);
  const qc = useQueryClient();
  const { data: d, error } = useQuery<any>({ queryKey: ['report', month], queryFn: () => api(`/api/reports/${month}`) });
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  if (error) return <p className="text-sm text-bad">{(error as Error).message}</p>;
  if (!d) return <Skeleton className="h-96" />;
  const change = d.prevTotals.total ? Math.round(((d.totals.total - d.prevTotals.total) / d.prevTotals.total) * 100) : null;

  async function generate() {
    setBusy(true);
    try {
      const r = await api<any>(`/api/reports/${month}`, { body: { review: true } });
      if (r.coins) toast.success(`Report reviewed · +${r.coins} coins 🪙`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { downloadReportPdf } = await import('@/lib/pdf/report-pdf');
      await downloadReportPdf(d);
      toast.success('PDF saved to your downloads');
    } catch (e) {
      console.error(e);
      // Fallback: let the server build it.
      window.location.href = `/api/reports/${month}/pdf`;
    } finally {
      setPdfBusy(false);
    }
  }
  async function share() {
    const text = `My ${d.label} on Wealthwise: spent ${inr(d.totals.total)}${d.income ? `, kept ${inr(d.savings)} (${d.savingsRate}% savings rate)` : ''}, Regret score ${d.totals.regret}/100, ${d.weeks.hit}/${d.weeks.total} weekly targets hit. Track. Tag. Save.`;
    try {
      if (navigator.share) await navigator.share({ title: `Wealthwise · ${d.label}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('Summary copied — paste it anywhere');
      }
    } catch {}
  }

  return (
    <div className="space-y-4">
      <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> All reports</Link>
      <PageHeader
        title={d.label}
        subtitle={d.isCurrent ? 'Month in progress' : 'Monthly report'}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={share}><Share2 className="h-4 w-4" /> Share</Button>
            <Button onClick={downloadPdf} disabled={pdfBusy}><Download className="h-4 w-4" /> {pdfBusy ? 'Preparing…' : 'Download PDF'}</Button>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><Stat label="Spent" value={inr(d.totals.total)} sub={change != null ? `${change >= 0 ? '+' : ''}${change}% vs previous month` : `${d.totals.n} expenses`} /></Card>
        <Card><Stat label="Income" value={inr(d.income)} sub={d.savingsRate != null ? `Kept ${inr(d.savings)} · ${d.savingsRate}%` : '—'} tone="var(--good)" /></Card>
        <Card><Stat label="Avoidable" value={inr(d.totals.avoidable)} sub={`Regret score ${d.totals.regret}/100`} tone="var(--warn)" /></Card>
        <Card><Stat label="Coins earned" value={`🪙 ${Number(d.coinsEarned).toLocaleString("en-IN")}`} sub={`${d.weeks.hit}/${d.weeks.total} weekly targets · ${d.budgets.kept}/${d.budgets.total} budgets`} /></Card>
      </div>

      <Card className="bg-gradient-to-br from-primary-soft to-card">
        <CardTitle action={<Button size="sm" variant={d.summary ? 'ghost' : 'primary'} loading={busy} onClick={generate}><Sparkles className="h-4 w-4" />{d.summary ? 'Refresh' : `Generate summary${!d.isCurrent && !d.reviewed ? ' · +30 🪙' : ''}`}</Button>}>Summary</CardTitle>
        {d.summary ? <ul className="space-y-1.5 text-sm">{d.summary.map((l: string, i: number) => <li key={i} className="flex gap-2"><span className="text-primary">•</span><Rich text={l} /></li>)}</ul> : <p className="text-sm text-muted">Get a 5-line plain-language summary of this month{!d.isCurrent ? ' — and +30 coins for reviewing it' : ''}.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Where it went</CardTitle>
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <Donut data={d.categories.map((c: any) => ({ label: c.label, value: c.value, colour: c.colour, emoji: c.emoji }))} />
            <Legendish data={d.categories.slice(0, 6).map((c: any) => ({ label: c.label, value: c.value, colour: c.colour, emoji: c.emoji }))} total={d.totals.total} />
          </div>
        </Card>
        <Card>
          <CardTitle>Cumulative spend</CardTitle>
          <TrendChart data={d.trend} />
          <div className="mt-3 flex h-3 overflow-hidden rounded-full">
            {(['necessary', 'neutral', 'unnecessary'] as const).map((n) => <div key={n} style={{ width: `${d.totals.total ? (d.totals[n] / d.totals.total) * 100 : 0}%`, background: NECESSITY_COLOURS[n] }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">{(['necessary', 'neutral', 'unnecessary'] as const).map((n) => <span key={n} style={{ color: NECESSITY_COLOURS[n] }}>{NECESSITY_LABELS[n]} {inr(d.totals[n])}</span>)}</div>
        </Card>
        <Card>
          <CardTitle>Budgets · {d.budgets.kept} of {d.budgets.total} kept</CardTitle>
          {d.budgets.total === 0 ? <p className="text-sm text-muted">No budgets this month.</p> : (
            <ul className="space-y-2 text-sm">
              {d.budgets.items.map((b: any) => (
                <li key={b.category} className="flex items-center gap-2"><span>{b.spent <= b.limit_inr ? '✅' : '❌'}</span>{b.emoji} {b.category}<span className="num ml-auto">{inr(b.spent)} <span className="text-muted">/ {inr(b.limit_inr)}</span></span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>Goals & achievements</CardTitle>
          <ul className="space-y-2 text-sm">
            {d.goals.map((g: any) => <li key={g.name} className="flex items-center gap-2">{g.icon} {g.name}<span className="ml-auto text-xs text-muted">{g.status === 'completed' ? '🎉 completed' : `${inr(g.saved_inr)} / ${inr(g.target_inr)}`}</span></li>)}
            {d.badges.map((b: any) => <li key={b.name} className="flex items-center gap-2">{b.emoji} Badge: {b.name}<span className="ml-auto text-xs text-muted">{fmtDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(b.earned_at)))}</span></li>)}
            {d.weeks.saved > 0 && <li className="flex items-center gap-2">💰 Saved through weekly targets<span className="num ml-auto">{inr(d.weeks.saved)}</span></li>}
            {!d.goals.length && !d.badges.length && <li className="text-muted">Nothing yet this month.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
