'use client';
import React, { Suspense, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Download, Filter, Pencil, Plus, Repeat, Search, Trash2, Wallet, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { inr, NECESSITY_COLOURS, NECESSITY_LABELS, PAYMENT_LABELS, PAYMENT_MODES } from '@/lib/format';
import { addDays, addMonths, fmtDate, fmtDayHeading, monthEnd, monthStart } from '@/lib/dates';
import { Button, Card, Chip, cn, Empty, Input, Label, PageHeader, Segmented, Select, Sheet, Skeleton, Switch } from '@/components/ui';
import { ExpenseRow } from '@/components/expense-row';
import { ExpenseFields, useAddExpense, type Draft } from '@/components/add-expense';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export default function Page() {
  return (
    <Suspense>
      <Transactions />
    </Suspense>
  );
}

function Transactions() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<'expenses' | 'income' | 'recurring'>((sp.get('tab') as any) || 'expenses');
  const { open } = useAddExpense();
  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Everything you’ve logged, grouped by day"
        action={
          <div className="flex gap-2">
            <a href="/api/export" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-soft"><Download className="h-4 w-4" /> CSV</a>
            <Button onClick={() => open()}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        }
      />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'income', label: 'Income' }, { value: 'recurring', label: 'Recurring' }]} />
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'income' && <IncomeTab />}
      {tab === 'recurring' && <RecurringTab />}
    </div>
  );
}

const PRESETS = [
  { id: 'month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: '30', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

function ExpensesTab() {
  const qc = useQueryClient();
  const { data: meta } = useQuery<any>({ queryKey: ['meta'], queryFn: () => api('/api/expenses/meta') });
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState({ from: '', to: '' });
  const [q, setQ] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [nec, setNec] = useState<string[]>([]);
  const [modes, setModes] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<any | null>(null);

  const dates = useMemo(() => {
    const t = today();
    if (preset === 'month') return { from: monthStart(t), to: t };
    if (preset === 'last_month') return { from: addMonths(monthStart(t), -1), to: monthEnd(addMonths(monthStart(t), -1)) };
    if (preset === '30') return { from: addDays(t, -29), to: t };
    if (preset === 'custom') return range;
    return { from: '', to: '' };
  }, [preset, range]);

  const params = new URLSearchParams();
  if (dates.from) params.set('from', dates.from);
  if (dates.to) params.set('to', dates.to);
  if (q.trim()) params.set('q', q.trim());
  if (cats.length) params.set('category', cats.join(','));
  if (nec.length) params.set('necessity', nec.join(','));
  if (modes.length) params.set('mode', modes.join(','));
  if (min) params.set('min', min);
  if (max) params.set('max', max);
  const key = params.toString();

  const list = useInfiniteQuery({
    queryKey: ['expenses', key],
    queryFn: ({ pageParam }) => api<any>(`/api/expenses?${key}&limit=100&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (all.reduce((s, p) => s + p.rows.length, 0) < last.count ? all.reduce((s, p) => s + p.rows.length, 0) : undefined),
  });
  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const count = list.data?.pages[0]?.count ?? 0;
  const groups = useMemo(() => {
    const g: { day: string; rows: any[]; total: number }[] = [];
    for (const r of rows) {
      let last = g[g.length - 1];
      if (!last || last.day !== r.spent_on) g.push((last = { day: r.spent_on, rows: [], total: 0 }));
      last.rows.push(r);
      last.total += r.amount_inr;
    }
    return g;
  }, [rows]);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const activeFilters = cats.length + nec.length + modes.length + (min ? 1 : 0) + (max ? 1 : 0);

  async function bulk(body: any) {
    try {
      const r = await api<any>('/api/expenses/bulk', { body: { ids: [...selected], ...body } });
      toast.success(body.delete ? `Deleted ${r.deleted}` : `Updated ${r.updated} — Wealthwise will remember this`);
      setSelected(new Set());
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search name or notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expenses" />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
      </div>
      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 scrollbar-none">
        {PRESETS.map((p) => (
          <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</Chip>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="mb-3 grid max-w-md grid-cols-2 gap-2">
          <Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From" />
          <Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To" />
        </div>
      )}
      {showFilters && meta && (
        <Card className="mb-4 space-y-4">
          <div>
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {meta.categories.map((c: any) => (
                <Chip key={c.id} active={cats.includes(c.id)} onClick={() => toggle(cats, setCats, c.id)}>{c.emoji} {c.name}</Chip>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Necessity</Label>
              <div className="flex flex-wrap gap-2">
                {(['necessary', 'neutral', 'unnecessary'] as const).map((n) => (
                  <Chip key={n} tone={NECESSITY_COLOURS[n]} active={nec.includes(n)} onClick={() => toggle(nec, setNec, n)}>{NECESSITY_LABELS[n]}</Chip>
                ))}
              </div>
            </div>
            <div>
              <Label>Amount range (₹)</Label>
              <div className="flex items-center gap-2">
                <Input inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
                <span className="text-muted">–</span>
                <Input inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
          </div>
          <div>
            <Label>Payment mode</Label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_MODES.map((m) => (
                <Chip key={m} active={modes.includes(m)} onClick={() => toggle(modes, setModes, m)}>{PAYMENT_LABELS[m]}</Chip>
              ))}
            </div>
          </div>
          {activeFilters > 0 && (
            <button className="text-sm font-medium text-primary" onClick={() => { setCats([]); setNec([]); setModes([]); setMin(''); setMax(''); }}>Clear filters</button>
          )}
        </Card>
      )}

      <div className="mb-2 flex items-center justify-between text-sm text-muted">
        <span>{count} expense{count === 1 ? '' : 's'}</span>
        <span className="num font-semibold text-fg">{inr(total)}</span>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-card p-2 shadow-lg">
          <span className="px-2 text-sm font-medium">{selected.size} selected</span>
          {(['necessary', 'neutral', 'unnecessary'] as const).map((n) => (
            <Button key={n} size="sm" variant="outline" onClick={() => bulk({ necessity: n })}>
              <span className="h-2 w-2 rounded-full" style={{ background: NECESSITY_COLOURS[n] }} /> {NECESSITY_LABELS[n]}
            </Button>
          ))}
          {meta && (
            <Select className="h-8 w-44 text-sm" value="" onChange={(e) => e.target.value && bulk({ category_id: e.target.value })} aria-label="Move to category">
              <option value="">Move to category…</option>
              {meta.categories.map((c: any) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </Select>
          )}
          <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${selected.size} expenses?`) && bulk({ delete: true })}><Trash2 className="h-4 w-4" /></Button>
          <button className="ml-auto rounded-lg p-1.5 hover:bg-soft" onClick={() => setSelected(new Set())} aria-label="Clear selection"><X className="h-4 w-4" /></button>
        </div>
      )}

      {list.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : groups.length === 0 ? (
        <Empty icon="🔍" title="Nothing here">Try another date range or clear the filters.</Empty>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.day} className="p-2 sm:p-3">
              <div className="flex items-center justify-between px-2 pb-1 pt-1 text-xs font-semibold text-muted">
                <span>{fmtDayHeading(g.day)} · {fmtDate(g.day)}</span>
                <span className="num">{inr(g.total)}</span>
              </div>
              {g.rows.map((r) => (
                <Swipeable key={r.id} onEdit={() => setEditing(r)} onDelete={async () => {
                  await api(`/api/expenses/${r.id}`, { method: 'DELETE' });
                  toast.success('Deleted');
                  qc.invalidateQueries();
                }}>
                  <ExpenseRow
                    e={r}
                    onClick={() => setEditing(r)}
                    selected={selected.has(r.id)}
                    onSelect={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })}
                  />
                </Swipeable>
              ))}
            </Card>
          ))}
          {list.hasNextPage && <Button variant="outline" className="w-full" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Load more</Button>}
        </div>
      )}
      <EditExpense expense={editing} onClose={() => setEditing(null)} meta={meta} />
    </div>
  );
}

/** Swipe left on touch screens to reveal Edit / Delete. */
function Swipeable({ children, onEdit, onDelete }: { children: React.ReactNode; onEdit: () => void; onDelete: () => void }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 right-0 flex">
        <button className="grid w-16 place-items-center bg-primary text-primary-fg" onClick={() => { setDx(0); onEdit(); }} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
        <button className="grid w-16 place-items-center bg-bad text-white" onClick={() => { setDx(0); onDelete(); }} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div
        className="relative bg-card transition-transform"
        style={{ transform: `translateX(${dx}px)` }}
        onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchMove={(e) => {
          if (!start.current) return;
          const ddx = e.touches[0].clientX - start.current.x;
          const ddy = Math.abs(e.touches[0].clientY - start.current.y);
          if (ddy > 30) return;
          setDx(Math.max(-128, Math.min(0, ddx + (dx < 0 ? -128 : 0))));
        }}
        onTouchEnd={() => {
          setDx(dx < -60 ? -128 : 0);
          start.current = null;
        }}
      >
        {children}
      </div>
    </div>
  );
}

function EditExpense({ expense, onClose, meta }: { expense: any | null; onClose: () => void; meta: any }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => {
    if (expense)
      setD({
        key: expense.id, spent_on: expense.spent_on, name: expense.name, amount: String(expense.amount_inr), category_id: expense.category_id,
        necessity: expense.necessity, payment_mode: expense.payment_mode, notes: expense.notes || '', mood: expense.mood, ai_category_id: expense.category_id,
        ai_confidence: null, ai_necessity: expense.necessity, missing: [], entry_method: 'form',
      });
  }, [expense]);
  if (!expense || !d || !meta) return null;
  return (
    <Sheet open={!!expense} onOpenChange={(o) => !o && onClose()} title="Edit expense" description={expense.raw_input ? `Logged as: “${expense.raw_input}”` : undefined} wide>
      <ExpenseFields draft={d} meta={meta} onChange={(p) => setD({ ...d, ...p })} errors={[]} />
      <div className="sticky bottom-0 -mx-5 mt-4 flex gap-2 border-t border-border bg-card px-5 pt-3">
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm('Delete this expense?')) return;
            await api(`/api/expenses/${expense.id}`, { method: 'DELETE' });
            toast.success('Deleted');
            qc.invalidateQueries();
            onClose();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          className="flex-1"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/expenses/${expense.id}`, {
                method: 'PATCH',
                body: { spent_on: d.spent_on, name: d.name, amount_inr: Number(d.amount), category_id: d.category_id, necessity: d.necessity, payment_mode: d.payment_mode, notes: d.notes || null, mood: d.mood },
              });
              toast.success(d.category_id !== expense.category_id || d.necessity !== expense.necessity ? 'Saved — Wealthwise learns from corrections' : 'Saved');
              qc.invalidateQueries();
              onClose();
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save changes
        </Button>
      </div>
    </Sheet>
  );
}

function IncomeTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any[]>({ queryKey: ['income'], queryFn: () => api('/api/income') });
  const [f, setF] = useState({ source: '', kind: 'salary', amount_inr: '', received_on: today(), notes: '' });
  const [busy, setBusy] = useState(false);
  const byMonth = useMemo(() => {
    const m = new Map<string, { rows: any[]; total: number }>();
    for (const r of data || []) {
      const k = r.received_on.slice(0, 7);
      const g = m.get(k) || { rows: [], total: 0 };
      g.rows.push(r);
      g.total += r.amount_inr;
      m.set(k, g);
    }
    return [...m.entries()];
  }, [data]);
  const KINDS = [['salary', 'Salary'], ['freelance', 'Freelance'], ['pocket_money', 'Pocket money'], ['refund', 'Refund'], ['interest', 'Interest'], ['gift', 'Gift'], ['other', 'Other']];
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <h3 className="mb-3 flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-primary" /> Log income</h3>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('/api/income', { body: { ...f, amount_inr: Number(f.amount_inr), source: f.source || KINDS.find((k) => k[0] === f.kind)![1] } });
              toast.success('Income added');
              setF({ ...f, source: '', amount_inr: '', notes: '' });
              qc.invalidateQueries();
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="flex flex-wrap gap-2">
            {KINDS.map(([k, l]) => <Chip key={k} active={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{l}</Chip>)}
          </div>
          <div><Label>Source</Label><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="e.g. Salary – Infosys" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Amount (₹)</Label><Input inputMode="decimal" value={f.amount_inr} onChange={(e) => setF({ ...f, amount_inr: e.target.value.replace(/[^\d.]/g, '') })} required /></div>
            <div><Label>Date</Label><Input type="date" max={today()} value={f.received_on} onChange={(e) => setF({ ...f, received_on: e.target.value })} /></div>
          </div>
          <Button className="w-full" loading={busy}>Add income</Button>
        </form>
      </Card>
      <div className="space-y-3">
        {!data ? <Skeleton className="h-40" /> : byMonth.length === 0 ? <Empty icon="💰" title="No income logged yet">Add salary, freelance, pocket money or refunds to see your savings rate.</Empty> : byMonth.map(([m, g]) => (
          <Card key={m} className="p-3">
            <div className="flex justify-between px-2 pb-1 text-xs font-semibold text-muted"><span>{new Date(m + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</span><span className="num">{inr(g.total)}</span></div>
            {g.rows.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-soft">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-good/10 text-lg">💰</span>
                <div className="flex-1"><p className="font-medium">{r.source}</p><p className="text-xs capitalize text-muted">{r.kind.replace('_', ' ')} · {fmtDate(r.received_on)}</p></div>
                <span className="num font-semibold text-good">+{inr(r.amount_inr)}</span>
                <button className="rounded-lg p-1.5 text-muted hover:bg-card" aria-label="Delete income" onClick={async () => { await api(`/api/income/${r.id}`, { method: 'DELETE' }); qc.invalidateQueries(); }}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

function RecurringTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['recurring'], queryFn: () => api('/api/recurring') });
  const { data: meta } = useQuery<any>({ queryKey: ['meta'], queryFn: () => api('/api/expenses/meta') });
  const [f, setF] = useState<any>({ name: '', amount_inr: '', category_id: '', necessity: 'necessary', payment_mode: 'upi', frequency: 'monthly', next_run: today() });
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <h3 className="mb-1 flex items-center gap-2 font-semibold"><Repeat className="h-4 w-4 text-primary" /> New recurring expense</h3>
        <p className="mb-3 text-xs text-muted">Rent, SIPs, subscriptions — auto-logged on schedule.</p>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('/api/recurring', { body: { ...f, amount_inr: Number(f.amount_inr) } });
              toast.success('Recurring expense added');
              setF({ ...f, name: '', amount_inr: '' });
              qc.invalidateQueries();
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Netflix" required /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Amount (₹)</Label><Input inputMode="decimal" value={f.amount_inr} onChange={(e) => setF({ ...f, amount_inr: e.target.value.replace(/[^\d.]/g, '') })} required /></div>
            <div><Label>Repeats</Label><Select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></Select></div>
          </div>
          <div><Label>Category</Label><Select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} required><option value="">Choose…</option>{meta?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}</Select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Necessity</Label><Select value={f.necessity} onChange={(e) => setF({ ...f, necessity: e.target.value })}>{(['necessary', 'neutral', 'unnecessary'] as const).map((n) => <option key={n} value={n}>{NECESSITY_LABELS[n]}</option>)}</Select></div>
            <div><Label>Mode</Label><Select value={f.payment_mode} onChange={(e) => setF({ ...f, payment_mode: e.target.value })}>{PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}</Select></div>
          </div>
          <div><Label>Next payment</Label><Input type="date" value={f.next_run} onChange={(e) => setF({ ...f, next_run: e.target.value })} /></div>
          <Button className="w-full" loading={busy}>Add</Button>
        </form>
      </Card>
      <Card>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Your recurring payments</h3>{data && <span className="num text-sm text-muted">≈ {inr(data.monthlyTotal)}/month</span>}</div>
        {!data ? <Skeleton className="h-40" /> : data.rules.length === 0 ? <Empty icon="🔁" title="No recurring payments yet" /> : (
          <ul className="divide-y divide-border">
            {data.rules.map((r: any) => (
              <li key={r.id} className={cn('flex items-center gap-3 py-3', !r.active && 'opacity-50')}>
                <span className="text-xl">{r.category_emoji}</span>
                <div className="flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs capitalize text-muted">{r.frequency} · next {fmtDate(r.next_run)} · {PAYMENT_LABELS[r.payment_mode as keyof typeof PAYMENT_LABELS]}</p>
                </div>
                <span className="num font-semibold">{inr(r.amount_inr)}</span>
                <Switch checked={r.active} label={`${r.name} active`} onChange={async (v) => { await api(`/api/recurring/${r.id}`, { method: 'PATCH', body: { active: v } }); qc.invalidateQueries({ queryKey: ['recurring'] }); }} />
                <button className="rounded-lg p-1.5 text-muted hover:bg-soft" aria-label="Delete" onClick={async () => { if (confirm(`Delete ${r.name}?`)) { await api(`/api/recurring/${r.id}`, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['recurring'] }); } }}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
