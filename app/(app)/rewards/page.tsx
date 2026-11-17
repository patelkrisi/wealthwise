'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { api } from '@/lib/client/api';
import { fmtDate } from '@/lib/dates';
import { Button, Card, CardTitle, cn, PageHeader, Progress, Skeleton } from '@/components/ui';

const LEVEL_EMOJI = ['', '🪙', '🧱', '🐷', '🧠', '🧙'];

export default function RewardsPage() {
  const qc = useQueryClient();
  const { data: s } = useQuery<any>({ queryKey: ['gam', 'status'], queryFn: () => api('/api/gamification/status') });
  const { data: badges } = useQuery<any[]>({ queryKey: ['gam', 'badges'], queryFn: () => api('/api/gamification/badges') });
  const { data: ch } = useQuery<any>({ queryKey: ['gam', 'challenges'], queryFn: () => api('/api/gamification/challenges') });
  const { data: store } = useQuery<any[]>({ queryKey: ['gam', 'store'], queryFn: () => api('/api/gamification/store') });
  const { data: ledger } = useQuery<any[]>({ queryKey: ['gam', 'ledger'], queryFn: () => api('/api/gamification/ledger') });
  const refresh = () => qc.invalidateQueries();

  if (!s) return <Skeleton className="h-96" />;
  const earned = badges?.filter((b) => b.earned_at).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Rewards" subtitle="Coins reward habits — logging, saving, sticking to goals — never how much you spend" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary to-primary-2 text-primary-fg lg:col-span-2 lg:self-start">
          <div className="flex flex-wrap items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 text-4xl">{LEVEL_EMOJI[s.level.level]}</span>
            <div className="flex-1">
              <p className="text-sm opacity-80">Level {s.level.level}</p>
              <p className="text-2xl font-bold">{s.level.name}</p>
            </div>
            <div className="text-right">
              <p className="num text-3xl font-bold">🪙 {s.coins.toLocaleString('en-IN')}</p>
              <p className="text-sm opacity-80">{s.lifetime.toLocaleString('en-IN')} earned all-time</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="h-3 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${s.level.progress * 100}%` }} /></div>
            <p className="mt-2 text-sm opacity-90">{s.level.next ? `${s.level.toNext.toLocaleString('en-IN')} coins to ${s.level.next.name}` : 'Top level reached — you’re a Wealth Wizard!'}</p>
          </div>
        </Card>
        <Card>
          <CardTitle action={<span className="text-xs text-muted">🧊 {s.streak.freezes} freeze{s.streak.freezes === 1 ? '' : 's'} held</span>}>
            <span className="flex items-center gap-1.5"><span className="flame">🔥</span> {s.streak.current}-day streak</span>
          </CardTitle>
          <div className="grid grid-cols-7 gap-1.5">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="text-center text-[10px] text-muted">{d}</span>)}
            {Array.from({ length: (new Date(s.calendar[0].day + 'T00:00:00Z').getUTCDay() + 6) % 7 }).map((_, i) => <span key={'p' + i} />)}
            {s.calendar.map((c: any) => (
              <span
                key={c.day}
                title={`${fmtDate(c.day)} · ${c.state.replace('_', ' ')}`}
                className={cn('grid aspect-square place-items-center rounded-lg text-[10px]', c.state === 'logged' ? 'bg-primary text-primary-fg' : c.state === 'no_spend' ? 'bg-good/70 text-white' : c.state === 'frozen' ? 'bg-sky-400 text-white' : 'bg-soft text-muted')}
              >
                {c.state === 'frozen' ? '🧊' : Number(c.day.slice(8))}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Longest: {s.streak.longest} days · Log an expense or mark “No spend” to keep it going.</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Badges <span className="text-sm font-normal text-muted">· {earned} of {badges?.length ?? 0}</span></h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {badges?.map((b) => (
            <Card key={b.id} className={cn('p-4 text-center', !b.earned_at && 'opacity-55')}>
              <div className={cn('mx-auto grid h-14 w-14 place-items-center rounded-full text-3xl', b.earned_at ? 'bg-coin/15' : 'bg-soft grayscale')}>{b.earned_at ? b.emoji : <Lock className="h-5 w-5 text-muted" />}</div>
              <p className="mt-2 text-sm font-semibold">{b.name}</p>
              <p className="mt-0.5 text-xs text-muted">{b.description}</p>
              {b.earned_at && <p className="mt-1 text-[11px] text-primary">{fmtDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(b.earned_at)))}</p>}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Challenges</h2>
        {ch && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              {ch.active.length === 0 && <Card className="text-sm text-muted">No active challenge — pick one to earn 150–400 coins.</Card>}
              {ch.active.map((c: any) => (
                <Card key={c.id} className="border-primary/40">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{c.emoji}</span>
                    <div className="flex-1">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-muted">{fmtDate(c.started_on)} → {fmtDate(c.ends_on)} · +{c.reward} 🪙</p>
                    </div>
                    <button className="text-xs text-muted hover:text-bad" onClick={async () => { if (confirm('Give up this challenge?')) { await api('/api/gamification/challenges', { body: { abandon: c.id } }); refresh(); } }}>Give up</button>
                  </div>
                  <Progress className="mt-3" value={(c.progress / c.duration_days) * 100} />
                  <p className="mt-1 text-xs text-muted">Day {c.progress} of {c.duration_days} · {c.description}</p>
                </Card>
              ))}
              {ch.history.length > 0 && (
                <Card>
                  <CardTitle>History</CardTitle>
                  <ul className="space-y-1.5 text-sm">
                    {ch.history.map((h: any) => (
                      <li key={h.id} className="flex items-center gap-2">
                        <span>{h.emoji}</span>{h.name}
                        <span className={cn('ml-auto text-xs font-medium', h.status === 'completed' ? 'text-good' : 'text-muted')}>{h.status === 'completed' ? `+${h.reward} 🪙` : h.status}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ch.available.map((c: any) => (
                <Card key={c.id} className="flex flex-col p-4">
                  <span className="text-2xl">{c.emoji}</span>
                  <p className="mt-1 font-semibold">{c.name}</p>
                  <p className="mt-0.5 flex-1 text-xs text-muted">{c.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">+{c.reward} 🪙</span>
                    <Button size="sm" variant="secondary" onClick={async () => { try { await api('/api/gamification/challenges', { body: { challenge_id: c.id } }); toast.success(`${c.emoji} ${c.name} started — good luck!`); refresh(); } catch (e: any) { toast.error(e.message); } }}>Join</Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </section>

      <section id="store">
        <h2 className="mb-1 text-lg font-semibold">Rewards store</h2>
        <p className="mb-3 text-sm text-muted">Coins aren’t money and can’t be withdrawn — spend them on in-app perks.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {store?.map((r) => (
            <Card key={r.id} className={cn('flex flex-col p-4', !r.available && 'opacity-60')}>
              <span className="text-3xl">{r.emoji}</span>
              <p className="mt-2 font-semibold">{r.name}</p>
              <p className="mt-0.5 flex-1 text-xs text-muted">{r.description}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="num text-sm font-semibold">🪙 {r.cost_coins.toLocaleString('en-IN')}</span>
                {!r.available ? (
                  <span className="text-xs text-muted">Soon</span>
                ) : r.active ? (
                  <span className="text-xs font-semibold text-good">Active</span>
                ) : r.owned ? (
                  <Button size="sm" variant="outline" onClick={async () => { await api('/api/gamification/redeem', { body: { reward_id: r.id } }); toast.success('Applied'); refresh(); setTimeout(() => location.reload(), 400); }}>Use</Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!r.affordable || (r.type === 'freeze' && r.held >= 2)}
                    onClick={async () => {
                      if (!confirm(`Spend ${r.cost_coins} coins on ${r.name}?`)) return;
                      try {
                        await api('/api/gamification/redeem', { body: { reward_id: r.id } });
                        toast.success(`${r.emoji} ${r.name} unlocked!`);
                        refresh();
                        if (r.type === 'theme' || r.type === 'frame') setTimeout(() => location.reload(), 500);
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}
                  >
                    {r.type === 'freeze' ? (r.held >= 2 ? 'Max held' : 'Buy') : 'Redeem'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Coin history</h2>
        <Card className="p-0">
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {ledger?.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1">{l.label}{l.note && <span className="text-muted"> · {l.note}</span>}</span>
                <span className="text-xs text-muted">{fmtDate(l.event_day)}</span>
                <span className={cn('num w-14 text-right font-semibold', l.coins > 0 ? 'text-good' : 'text-bad')}>{l.coins > 0 ? '+' : ''}{l.coins}</span>
              </li>
            ))}
          </ul>
        </Card>
        <p className="mt-2 text-xs text-muted">Every coin change is written to an append-only ledger. Expenses under ₹1, or edited 4+ times within 5 minutes, earn no coins.</p>
      </section>
    </div>
  );
}
