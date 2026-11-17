'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Clock, Pencil, Plus, ShoppingBasket, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { inr } from '@/lib/format';
import { fmtDate, fmtMonth, upcomingFestivalsClient } from './util';
import { ordinal } from '@/lib/dates';
import { Button, Card, CardTitle, Chip, cn, Empty, Input, Label, PageHeader, Progress, Select, Sheet, Skeleton } from '@/components/ui';
import { useAddExpense } from '@/components/add-expense';

export default function GoalsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Goals & budgets" subtitle="Save for what matters, cap what doesn’t" />
      <Goals />
      <Budgets />
      <Wishlist />
      <Packs />
    </div>
  );
}

const ICONS = ['🎯', '🏖️', '🛟', '📱', '💻', '🏍️', '🎓', '💍', '🏠', '✈️', '🪔', '🎁'];

function Goals() {
  const qc = useQueryClient();
  const { data } = useQuery<any[]>({ queryKey: ['goals'], queryFn: () => api('/api/goals') });
  const { data: profile } = useQuery<any>({ queryKey: ['profile'], queryFn: () => api('/api/profile') });
  const [adding, setAdding] = useState(false);
  const [contrib, setContrib] = useState<any | null>(null);
  const [amt, setAmt] = useState('');
  const [f, setF] = useState({ name: '', target_inr: '', deadline: '', icon: '🎯' });
  const [edit, setEdit] = useState<any | null>(null);
  const [ef, setEf] = useState({ name: '', target_inr: '', deadline: '', icon: '🎯' });
  const refresh = () => qc.invalidateQueries();
  const active = (data ?? []).filter((g) => g.status === 'active');
  const chosen = active.find((g) => g.id === profile?.weekly_goal_id);
  const autoJar = chosen ? null : active[0];
  async function setWeekly(g: any, on: boolean) {
    try {
      await api('/api/profile', { method: 'PATCH', body: { weekly_goal_id: on ? g.id : null } });
      const next = active.find((x) => x.id !== g.id);
      toast.success(on ? `Weekly savings now go to ${g.name}` : next ? `Unselected. Weekly savings will go to ${next.name} (nearest deadline) unless you pick another jar.` : 'Unselected');
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  function openEdit(g: any) {
    setEdit(g);
    setEf({ name: g.name, target_inr: String(Math.round(g.target_inr)), deadline: g.deadline ?? '', icon: g.icon || '🎯' });
  }
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Goal jars</h2>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New goal</Button>
      </div>
      {!data ? <Skeleton className="h-40" /> : data.length === 0 ? (
        <Empty icon="🫙" title="No goals yet" action={<Button onClick={() => setAdding(true)}>Create a goal</Button>}>Like “Goa trip ₹25,000 by March”. Your weekly savings land here.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((g) => {
            const weekly = chosen?.id === g.id;
            const auto = autoJar?.id === g.id;
            return (
              <Card key={g.id} className={cn(g.status === 'completed' && 'bg-good/5')}>
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-2xl">{g.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{g.name}</p>
                    <p className="text-xs text-muted">{g.deadline ? `by ${fmtDate(g.deadline)}` : 'No deadline'}</p>
                  </div>
                  {g.status === 'completed' && <span className="rounded-full bg-good px-2 py-0.5 text-xs font-semibold text-white">Done 🎉</span>}
                  <button className="rounded-lg p-1.5 text-muted hover:bg-soft hover:text-fg" aria-label={`Edit ${g.name}`} onClick={() => openEdit(g)}><Pencil className="h-4 w-4" /></button>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <p className="num text-2xl font-bold">{inr(g.saved_inr)}</p>
                  <button type="button" className="num text-sm text-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => openEdit(g)} title="Edit target">of {inr(g.target_inr)}</button>
                </div>
                <Progress className="mt-2" value={g.pct} tone={g.status === 'completed' ? 'var(--good)' : undefined} height={10} />
                {g.status === 'active' && (
                  <>
                    <p className="mt-2 text-xs text-muted">{g.neededPerWeek ? <>Need <b className="text-fg">{inr(g.neededPerWeek)}/week</b> for {g.weeksLeft} weeks</> : `${inr(g.gap)} to go`}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => { setContrib(g); setAmt(''); }}>Add money</Button>
                      {weekly ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-primary-soft py-1 pl-2 pr-1 text-xs font-medium text-primary">
                          ✓ Weekly savings jar
                          <button type="button" className="rounded p-0.5 hover:bg-primary/15" aria-label="Stop using this jar for weekly savings" title="Unselect" onClick={() => setWeekly(g, false)}><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ) : (
                        <button className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-soft" onClick={() => setWeekly(g, true)} title={auto ? 'Gets weekly savings automatically because it has the nearest deadline' : undefined}>
                          {auto ? 'Weekly savings (auto) · Pin it' : 'Use for weekly savings'}
                        </button>
                      )}
                      <button className="ml-auto rounded-lg p-1.5 text-muted hover:bg-soft" aria-label="Delete goal" onClick={async () => { if (confirm(`Delete “${g.name}”?`)) { await api(`/api/goals/${g.id}`, { method: 'DELETE' }); refresh(); } }}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={`Edit ${edit?.name ?? 'goal'}`}>
        {edit && (
          <form
            className="space-y-3 pb-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const target = Number(ef.target_inr);
              if (!(target > 0)) return toast.error('Enter a target amount');
              try {
                const r = await api<any>(`/api/goals/${edit.id}`, { method: 'PATCH', body: { name: ef.name, icon: ef.icon, target_inr: target, deadline: ef.deadline || null } });
                toast.success(r.status === 'completed' && edit.status !== 'completed' ? '🎉 Goal reached with the new target!' : 'Goal updated');
                setEdit(null);
                refresh();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <div className="flex flex-wrap gap-1.5">{ICONS.map((i) => <button type="button" key={i} onClick={() => setEf({ ...ef, icon: i })} className={cn('grid h-10 w-10 place-items-center rounded-xl text-xl', ef.icon === i ? 'bg-primary-soft ring-2 ring-primary' : 'bg-soft')}>{i}</button>)}</div>
            <div><Label>Name</Label><Input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} required maxLength={60} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Target (₹)</Label><Input inputMode="numeric" value={ef.target_inr} onChange={(e) => setEf({ ...ef, target_inr: e.target.value.replace(/\D/g, '') })} required autoFocus /></div>
              <div>
                <Label>By (optional)</Label>
                <Input type="date" value={ef.deadline} onChange={(e) => setEf({ ...ef, deadline: e.target.value })} />
                {ef.deadline && <button type="button" className="mt-1 text-xs text-muted hover:text-fg" onClick={() => setEf({ ...ef, deadline: '' })}>Remove deadline</button>}
              </div>
            </div>
            <p className="text-xs text-muted">Already saved: <b className="text-fg">{inr(edit.saved_inr)}</b>{Number(ef.target_inr) > 0 && <> · {Number(ef.target_inr) > edit.saved_inr ? `${inr(Number(ef.target_inr) - edit.saved_inr)} to go` : 'this target is already reached'}</>}</p>
            <Button className="w-full">Save changes</Button>
          </form>
        )}
      </Sheet>
      <Sheet open={adding} onOpenChange={setAdding} title="New savings goal">
        <form
          className="space-y-3 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/api/goals', { body: { ...f, target_inr: Number(f.target_inr), deadline: f.deadline || null } });
              toast.success('Goal created');
              setAdding(false);
              setF({ name: '', target_inr: '', deadline: '', icon: '🎯' });
              refresh();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        >
          <div className="flex flex-wrap gap-1.5">{ICONS.map((i) => <button type="button" key={i} onClick={() => setF({ ...f, icon: i })} className={cn('grid h-10 w-10 place-items-center rounded-xl text-xl', f.icon === i ? 'bg-primary-soft ring-2 ring-primary' : 'bg-soft')}>{i}</button>)}</div>
          <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Goa trip" required /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Target (₹)</Label><Input inputMode="numeric" value={f.target_inr} onChange={(e) => setF({ ...f, target_inr: e.target.value.replace(/\D/g, '') })} required /></div>
            <div><Label>By (optional)</Label><Input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></div>
          </div>
          <Button className="w-full">Create goal</Button>
        </form>
      </Sheet>
      <Sheet open={!!contrib} onOpenChange={(o) => !o && setContrib(null)} title={`Add to ${contrib?.name ?? ''}`}>
        <form
          className="space-y-3 pb-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api<any>(`/api/goals/${contrib.id}`, { body: { amount: Number(amt) } });
              toast.success(r.completed ? `🎉 Goal reached! +500 coins` : `Added ${inr(Number(amt))}`);
              setContrib(null);
              refresh();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        >
          <div className="flex flex-wrap gap-2">{[500, 1000, 2000, 5000].map((v) => <Chip key={v} active={amt === String(v)} onClick={() => setAmt(String(v))}>{inr(v)}</Chip>)}</div>
          <Input inputMode="numeric" placeholder="Amount (₹)" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} autoFocus />
          <Button className="w-full" disabled={!Number(amt)}>Add to jar</Button>
        </form>
      </Sheet>
    </section>
  );
}

function Budgets() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['budgets'], queryFn: () => api('/api/budgets') });
  const { data: meta } = useQuery<any>({ queryKey: ['meta'], queryFn: () => api('/api/expenses/meta') });
  const [edit, setEdit] = useState<{ category_id: string; limit: string } | null>(null);
  const [suggest, setSuggest] = useState<any | null>(null);
  const [loadingS, setLoadingS] = useState(false);
  const refresh = () => qc.invalidateQueries();
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Category budgets</h2>
          {data && <p className="text-sm text-muted">{fmtMonth(data.month)} · {inr(data.totalSpent)} of {inr(data.totalLimit)}</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={loadingS} onClick={async () => { setLoadingS(true); try { setSuggest(await api('/api/budgets/suggest')); } catch (e: any) { toast.error(e.message); } setLoadingS(false); }}>
            <Sparkles className="h-4 w-4" /> Suggest budgets
          </Button>
          <Button size="sm" onClick={() => setEdit({ category_id: '', limit: '' })}><Plus className="h-4 w-4" /> Budget</Button>
        </div>
      </div>
      {!data ? <Skeleton className="h-40" /> : data.items.length === 0 ? (
        <Empty icon="📏" title="No budgets this month" action={<Button onClick={() => setEdit({ category_id: '', limit: '' })}>Set a budget</Button>}>Get 80% and 100% alerts, early overspend warnings and +75 coins for every budget you keep.</Empty>
      ) : (
        <Card className="divide-y divide-border p-0">
          {data.items.map((b: any) => {
            const tone = b.state === 'over' ? 'var(--bad)' : b.state === 'warn' ? 'var(--warn)' : 'var(--good)';
            return (
              <button key={b.id} className="block w-full px-4 py-3.5 text-left hover:bg-soft/60" onClick={() => setEdit({ category_id: b.category_id, limit: String(b.limit_inr) })}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{b.emoji}</span>
                  <span className="font-medium">{b.category}</span>
                  <span className="num ml-auto text-sm"><b>{inr(b.spent)}</b> <span className="text-muted">/ {inr(b.limit_inr)}</span></span>
                </div>
                <Progress className="mt-2" value={b.pct} tone={tone} />
                <p className="mt-1 text-xs" style={{ color: b.state === 'ok' ? 'var(--muted)' : tone }}>
                  {b.state === 'over' ? `Over by ${inr(-b.remaining)}` : `${inr(b.remaining)} left · ${Math.round(b.pct)}% used`}
                  {b.projection && b.projection.over > 0 && !b.projection.alreadyOver && b.projection.crossDate && ` · on pace to cross on the ${ordinal(Number(b.projection.crossDate.slice(8)))}`}
                </p>
              </button>
            );
          })}
        </Card>
      )}

      <Sheet open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Monthly budget">
        {edit && meta && (
          <form
            className="space-y-3 pb-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api('/api/budgets', { body: { category_id: edit.category_id, limit_inr: Number(edit.limit) } });
                toast.success('Budget saved');
                setEdit(null);
                refresh();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <div><Label>Category</Label><Select value={edit.category_id} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })} required><option value="">Choose…</option>{meta.categories.map((c: any) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</Select></div>
            <div><Label>Limit for this month (₹)</Label><Input inputMode="numeric" value={edit.limit} onChange={(e) => setEdit({ ...edit, limit: e.target.value.replace(/\D/g, '') })} required /></div>
            <div className="flex gap-2">
              {data?.items.find((b: any) => b.category_id === edit.category_id) && (
                <Button type="button" variant="danger" onClick={async () => { await api(`/api/budgets/${data.items.find((b: any) => b.category_id === edit.category_id).id}`, { method: 'DELETE' }); setEdit(null); refresh(); }}><Trash2 className="h-4 w-4" /></Button>
              )}
              <Button className="flex-1">Save budget</Button>
            </div>
          </form>
        )}
      </Sheet>

      <Sheet open={!!suggest} onOpenChange={(o) => !o && setSuggest(null)} title="Suggested budgets" description="50/30/20 adapted to your necessity tags" wide>
        {suggest && <SuggestBody s={suggest} onApplied={() => { setSuggest(null); refresh(); }} />}
      </Sheet>
    </section>
  );
}

function SuggestBody({ s, onApplied }: { s: any; onApplied: () => void }) {
  const [items, setItems] = useState(s.items.map((i: any) => ({ ...i, on: true })));
  if (!items.length) return <p className="pb-4 text-sm text-muted">Log a few weeks of spending first — suggestions use your last 3 months.</p>;
  return (
    <div className="space-y-3 pb-2">
      <p className="rounded-xl bg-primary-soft p-3 text-sm"><Sparkles className="mr-1 inline h-4 w-4 text-primary" />{s.note}</p>
      {s.split.income ? (
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          {[['Needs', s.split.needs, '#0d9488'], ['Wants', s.split.wants, '#f59e0b'], ['Save', s.split.save, '#6366f1']].map(([l, v, c]) => (
            <div key={l as string} className="rounded-xl bg-soft p-2"><p className="text-xs text-muted">{l}</p><p className="num font-semibold" style={{ color: c as string }}>{inr(v as number)}</p><p className="text-[11px] text-muted">{Math.round(((v as number) / s.split.income) * 100)}%</p></div>
          ))}
        </div>
      ) : null}
      <ul className="divide-y divide-border">
        {items.map((i: any, k: number) => (
          <li key={i.category} className="flex items-center gap-3 py-2.5">
            <input type="checkbox" checked={i.on} onChange={(e) => setItems(items.map((x: any, j: number) => (j === k ? { ...x, on: e.target.checked } : x)))} className="h-4 w-4 accent-[var(--primary)]" aria-label={i.category} />
            <span className="flex-1 text-sm">{i.emoji} {i.category}<span className="block text-xs text-muted">avg {inr(i.current)}/month</span></span>
            <Input className="num h-9 w-28 text-right" inputMode="numeric" value={i.suggested} onChange={(e) => setItems(items.map((x: any, j: number) => (j === k ? { ...x, suggested: Number(e.target.value.replace(/\D/g, '')) } : x)))} aria-label={`${i.category} budget`} />
          </li>
        ))}
      </ul>
      <Button className="w-full" onClick={async () => { await api('/api/budgets/suggest', { body: { items: items.filter((i: any) => i.on).map((i: any) => ({ category_id: i.category_id, limit_inr: i.suggested })) } }); toast.success('Budgets applied for this month'); onApplied(); }}>Apply {items.filter((i: any) => i.on).length} budgets</Button>
    </div>
  );
}

function useNow(ms = 30000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

function Wishlist() {
  const qc = useQueryClient();
  const now = useNow();
  const { open } = useAddExpense();
  const { data } = useQuery<any>({ queryKey: ['wishlist'], queryFn: () => api('/api/wishlist') });
  const { data: goals } = useQuery<any[]>({ queryKey: ['goals'], queryFn: () => api('/api/goals') });
  const [f, setF] = useState({ item: '', amount_inr: '', cool_off: '24h' });
  const [skip, setSkip] = useState<any | null>(null);
  const [goalId, setGoalId] = useState('');
  const refresh = () => qc.invalidateQueries();
  const left = (t: string) => {
    const ms = new Date(t).getTime() - now;
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
  };
  return (
    <section id="wishlist">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">Cool-off wishlist</h2>
        <p className="text-sm text-muted">Park a want for 24 hours or 7 days. Still want it? Buy it. Skip it → +25 coins and it counts as saved.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api('/api/wishlist', { body: { ...f, amount_inr: Number(f.amount_inr) } });
                toast.success('Parked. The timer is running ⏳');
                setF({ item: '', amount_inr: '', cool_off: f.cool_off });
                refresh();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <div><Label>I want…</Label><Input value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} placeholder="New headphones" required /></div>
            <div><Label>Price (₹)</Label><Input inputMode="numeric" value={f.amount_inr} onChange={(e) => setF({ ...f, amount_inr: e.target.value.replace(/\D/g, '') })} required /></div>
            <div className="flex gap-2"><Chip active={f.cool_off === '24h'} onClick={() => setF({ ...f, cool_off: '24h' })}>24 hours</Chip><Chip active={f.cool_off === '7d'} onClick={() => setF({ ...f, cool_off: '7d' })}>7 days</Chip></div>
            <Button className="w-full"><Clock className="h-4 w-4" /> Start cool-off</Button>
          </form>
          {data && data.savedBySkipping > 0 && <p className="mt-4 rounded-xl bg-good/10 p-3 text-sm">You’ve saved <b className="num">{inr(data.savedBySkipping)}</b> by skipping {data.skippedCount} item{data.skippedCount > 1 ? 's' : ''}. 🧘</p>}
        </Card>
        <div className="space-y-2">
          {!data ? <Skeleton className="h-32" /> : data.items.length === 0 ? <Empty icon="⏳" title="Nothing cooling off">Next time you’re about to impulse-buy, park it here first.</Empty> : data.items.map((w: any) => {
            const l = left(w.cool_off_until);
            return (
              <Card key={w.id} className={cn('flex flex-wrap items-center gap-3 p-4', w.status !== 'waiting' && 'opacity-60')}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-soft text-lg">{w.status === 'skipped' ? '🧘' : w.status === 'bought' ? '🛍️' : '⏳'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{w.item}</p>
                  <p className="text-xs text-muted">{w.status === 'waiting' ? (l ? `Cooling off · ${l} left` : 'Cool-off done — still want it?') : w.status === 'skipped' ? 'Skipped · counted as saved' : 'Bought'}</p>
                </div>
                <span className="num font-semibold">{inr(w.amount_inr)}</span>
                {w.status === 'waiting' && (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button size="sm" variant="secondary" onClick={() => { setSkip(w); setGoalId(''); }}>Skip it</Button>
                    <Button size="sm" variant="outline" disabled={!!l} title={l ? 'Wait for the timer' : undefined} onClick={async () => {
                      try {
                        await api(`/api/wishlist/${w.id}`, { body: { decision: 'bought' } });
                        refresh();
                        open({ name: w.item, amount: String(w.amount_inr), category_id: w.category_id, necessity: 'neutral', entry_method: 'form' });
                      } catch (e: any) { toast.error(e.message); }
                    }}>Buy</Button>
                  </div>
                )}
                {w.status !== 'waiting' && <button className="rounded-lg p-1.5 text-muted hover:bg-soft" aria-label="Remove" onClick={async () => { await api(`/api/wishlist/${w.id}`, { method: 'DELETE' }); refresh(); }}><Trash2 className="h-4 w-4" /></button>}
              </Card>
            );
          })}
        </div>
      </div>
      <Sheet open={!!skip} onOpenChange={(o) => !o && setSkip(null)} title={`Skip ${skip?.item ?? ''}?`} description="Nice. Move the money into a goal jar (optional).">
        <div className="space-y-3 pb-2">
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Just skip it</option>
            {goals?.filter((g) => g.status === 'active').map((g) => <option key={g.id} value={g.id}>{g.icon} Add {inr(skip?.amount_inr ?? 0)} to {g.name}</option>)}
          </Select>
          <Button className="w-full" onClick={async () => {
            const r = await api<any>(`/api/wishlist/${skip.id}`, { body: { decision: 'skipped', goal_id: goalId || null } });
            toast.success(r.coins ? `Skipped! +${r.coins} coins 🪙` : 'Skipped — coins are earned on items that waited 24h+');
            setSkip(null);
            refresh();
          }}><Check className="h-4 w-4" /> Skip it</Button>
        </div>
      </Sheet>
    </section>
  );
}

function Packs() {
  const qc = useQueryClient();
  const { open } = useAddExpense();
  const { data: kirana } = useQuery<any[]>({ queryKey: ['kirana'], queryFn: () => api('/api/kirana') });
  const { data: meta } = useQuery<any>({ queryKey: ['meta'], queryFn: () => api('/api/expenses/meta') });
  const { data: fc } = useQuery<any>({ queryKey: ['forecast'], queryFn: () => api('/api/forecast') });
  const [k, setK] = useState({ item: '', qty: '', est_inr: '' });
  const fests = useMemo(() => upcomingFestivalsClient(5), []);
  const gifts = fc?.categories.find((c: any) => c.category === 'Gifts & Festivals');
  const checked = kirana?.filter((i) => i.done) ?? [];
  const checkedTotal = checked.reduce((s, i) => s + (i.est_inr || 0), 0);
  return (
    <section id="packs">
      <h2 className="mb-1 text-lg font-semibold">Indian context packs</h2>
      <p className="mb-3 text-sm text-muted">Festival & wedding-season planner and your monthly kirana list.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>🪔 Festival & wedding-season planner</CardTitle>
          <ul className="space-y-2">
            {fests.map((f) => (
              <li key={f.name + f.date} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <span className="text-2xl">{f.emoji}</span>
                <div className="flex-1"><p className="font-medium">{f.name}</p><p className="text-xs text-muted">{fmtDate(f.date)}</p></div>
                <Button size="sm" variant="outline" onClick={async () => {
                  const suggested = Math.max(2000, Math.round(((gifts && f.date.slice(0, 7) === fc.month.slice(0, 7) ? gifts.predicted : 0) || f.budget) / 500) * 500);
                  await api('/api/goals', { body: { name: `${f.name} fund`, target_inr: suggested, deadline: f.date, icon: f.emoji } });
                  toast.success(`Created a ${inr(suggested)} goal for ${f.name}`);
                  qc.invalidateQueries();
                }}>Plan · goal</Button>
              </li>
            ))}
          </ul>
          {gifts && <p className="mt-3 text-xs text-muted">Forecast for Gifts & Festivals in {fc.monthLabel}: <b>{inr(gifts.predicted)}</b> (range {inr(gifts.low)}–{inr(gifts.high)}).</p>}
        </Card>
        <Card>
          <CardTitle action={checked.length > 0 && <button className="text-xs font-medium text-muted" onClick={async () => { await api('/api/kirana', { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['kirana'] }); }}>Clear checked</button>}>
            <span className="flex items-center gap-1.5"><ShoppingBasket className="h-4 w-4 text-primary" /> Monthly kirana list</span>
          </CardTitle>
          <form className="mb-3 grid grid-cols-[1fr_70px_80px_auto] gap-2" onSubmit={async (e) => { e.preventDefault(); await api('/api/kirana', { body: { ...k, est_inr: k.est_inr ? Number(k.est_inr) : null } }); setK({ item: '', qty: '', est_inr: '' }); qc.invalidateQueries({ queryKey: ['kirana'] }); }}>
            <Input className="h-9" placeholder="Item" value={k.item} onChange={(e) => setK({ ...k, item: e.target.value })} required />
            <Input className="h-9" placeholder="Qty" value={k.qty} onChange={(e) => setK({ ...k, qty: e.target.value })} />
            <Input className="h-9" placeholder="₹" inputMode="numeric" value={k.est_inr} onChange={(e) => setK({ ...k, est_inr: e.target.value.replace(/\D/g, '') })} />
            <Button size="sm" className="h-9" aria-label="Add item"><Plus className="h-4 w-4" /></Button>
          </form>
          <ul className="space-y-1">
            {kirana?.map((i) => (
              <li key={i.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-soft">
                <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={i.done} onChange={async (e) => { await api(`/api/kirana/${i.id}`, { method: 'PATCH', body: { done: e.target.checked } }); qc.invalidateQueries({ queryKey: ['kirana'] }); }} aria-label={i.item} />
                <span className={cn('flex-1 text-sm', i.done && 'text-muted line-through')}>{i.item} {i.qty && <span className="text-muted">· {i.qty}</span>}</span>
                {i.est_inr != null && <span className="num text-sm text-muted">{inr(i.est_inr)}</span>}
              </li>
            ))}
          </ul>
          {checked.length > 0 && meta && (
            <Button className="mt-3 w-full" variant="secondary" onClick={() => open({ name: 'Kirana – ' + checked.map((i) => i.item.split(' ')[0]).slice(0, 3).join(', '), amount: String(checkedTotal || ''), category_id: meta.categories.find((c: any) => c.name === 'Groceries')?.id, necessity: 'necessary', notes: checked.map((i) => i.item).join(', ') })}>
              Log {checked.length} bought item{checked.length > 1 ? 's' : ''} as groceries {checkedTotal ? `· ${inr(checkedTotal)}` : ''}
            </Button>
          )}
        </Card>
      </div>
    </section>
  );
}
