'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Keyboard, Mic, MicOff, PenLine, Sparkles, Trash2, WifiOff } from 'lucide-react';
import { api } from '@/lib/client/api';
import { queueExpenses } from '@/lib/client/offline';
import { inr, MOODS, NECESSITY_COLOURS, NECESSITY_LABELS, PAYMENT_LABELS, PAYMENT_MODES, type Necessity, type PaymentMode } from '@/lib/format';
import { fmtDate } from '@/lib/dates';
import { Button, Chip, cn, Input, Label, Segmented, Sheet, Spinner, Textarea } from './ui';

export interface Draft {
  key: string;
  spent_on: string;
  name: string;
  amount: string;
  category_id: string | null;
  necessity: Necessity | null;
  payment_mode: PaymentMode | null;
  notes: string;
  mood: string | null;
  ai_category_id: string | null;
  ai_confidence: number | null;
  ai_necessity: Necessity | null;
  necessity_reason?: string | null;
  missing: string[];
  dateAssumed?: boolean;
  entry_method: 'form' | 'text' | 'voice' | 'quick';
  raw_input?: string;
  catSource?: string;
}

interface Meta {
  defaultMode: PaymentMode;
  categories: { id: string; name: string; emoji: string; colour: string }[];
  quickAdd: any[];
}

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

function blank(mode: PaymentMode | null, extra: Partial<Draft> = {}): Draft {
  return {
    key: Math.random().toString(36).slice(2),
    spent_on: todayLocal(),
    name: '',
    amount: '',
    category_id: null,
    necessity: null,
    payment_mode: mode,
    notes: '',
    mood: null,
    ai_category_id: null,
    ai_confidence: null,
    ai_necessity: null,
    missing: [],
    entry_method: 'form',
    ...extra,
  };
}

type Ctx = { open: (prefill?: Partial<Draft>, tab?: 'form' | 'type' | 'speak') => void };
const AddCtx = createContext<Ctx>({ open: () => {} });
export const useAddExpense = () => useContext(AddCtx);

export function AddExpenseProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; prefill?: Partial<Draft>; tab: 'form' | 'type' | 'speak'; n: number }>({ open: false, tab: 'form', n: 0 });
  const open = useCallback((prefill?: Partial<Draft>, tab: 'form' | 'type' | 'speak' = 'form') => setState((s) => ({ open: true, prefill, tab, n: s.n + 1 })), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    if (new URLSearchParams(window.location.search).get('add') === '1') open();
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <AddCtx.Provider value={{ open }}>
      {children}
      <Sheet open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))} title="Add expense" wide>
        {state.open && <AddExpenseBody key={state.n} initialTab={state.tab} prefill={state.prefill} onDone={() => setState((s) => ({ ...s, open: false }))} />}
      </Sheet>
    </AddCtx.Provider>
  );
}

function AddExpenseBody({ initialTab, prefill, onDone }: { initialTab: 'form' | 'type' | 'speak'; prefill?: Partial<Draft>; onDone: () => void }) {
  const { data: meta } = useQuery<Meta>({ queryKey: ['meta'], queryFn: () => api('/api/expenses/meta') });
  const [tab, setTab] = useState(initialTab);
  const [drafts, setDrafts] = useState<Draft[] | null>(prefill ? [blank(null, prefill)] : null);
  const [clarifications, setClarifications] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!meta) return;
    if (tab === 'form' && !drafts) setDrafts([blank(meta.defaultMode)]);
  }, [meta, tab, drafts]);

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds?.map((d) => (d.key === key ? { ...d, ...patch } : d)) ?? null);

  const problems = (d: Draft) => {
    const p: string[] = [];
    if (!d.spent_on) p.push('spent_on');
    if (!d.name.trim()) p.push('name');
    if (!(Number(d.amount) > 0)) p.push('amount');
    if (!d.category_id) p.push('category_id');
    if (!d.necessity) p.push('necessity');
    if (!d.payment_mode) p.push('payment_mode');
    if (d.spent_on > todayLocal()) p.push('spent_on');
    return p;
  };

  async function save(another = false) {
    if (!drafts?.length) return;
    const bad = drafts.filter((d) => problems(d).length);
    if (bad.length) {
      setShowErrors(true);
      toast.error('Fill the highlighted fields first');
      return;
    }
    const body = drafts.map((d) => ({
      spent_on: d.spent_on,
      name: d.name.trim(),
      amount_inr: Number(d.amount),
      category_id: d.category_id,
      necessity: d.necessity,
      payment_mode: d.payment_mode,
      notes: d.notes.trim() || null,
      mood: d.mood,
      entry_method: d.entry_method,
      raw_input: d.raw_input || null,
      ai_category_id: d.ai_category_id,
      ai_confidence: d.ai_confidence,
      ai_necessity: d.ai_necessity,
      client_ref: d.key + '-' + Date.now(),
    }));
    if (!navigator.onLine) {
      if (drafts.some((d) => d.entry_method !== 'form')) {
        toast.error('Type and Speak need a connection — switch to Form to save offline');
        return;
      }
      await queueExpenses(body);
      toast.success('Saved offline — it will sync when you’re back online', { icon: <WifiOff className="h-4 w-4" /> });
      onDone();
      return;
    }
    setSaving(true);
    try {
      const r = await api<any>('/api/expenses', { body });
      celebrate(r);
      qc.invalidateQueries();
      if (another && meta) {
        setDrafts([blank(meta.defaultMode, { spent_on: drafts[0].spent_on })]);
        setShowErrors(false);
        setTab('form');
      } else onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!meta) return <div className="grid h-60 place-items-center"><Spinner /></div>;

  return (
    <div className="pb-2">
      <Segmented
        className="mb-4 w-full"
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t === 'form') setDrafts([blank(meta.defaultMode)]);
          else setDrafts(null);
          setClarifications([]);
          setShowErrors(false);
        }}
        options={[
          { value: 'form', label: <span className="flex items-center justify-center gap-1.5"><PenLine className="h-4 w-4" />Form</span> },
          { value: 'type', label: <span className="flex items-center justify-center gap-1.5"><Keyboard className="h-4 w-4" />Type</span> },
          { value: 'speak', label: <span className="flex items-center justify-center gap-1.5"><Mic className="h-4 w-4" />Speak</span> },
        ]}
      />

      {tab !== 'form' && (
        <SentenceEntry
          mode={tab}
          onParsed={(ds, cl) => {
            setDrafts(ds);
            setClarifications(cl);
            setShowErrors(true);
          }}
          defaultMode={meta.defaultMode}
        />
      )}

      {tab === 'form' && meta.quickAdd.length > 0 && drafts?.length === 1 && !drafts[0].name && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 scrollbar-none">
          {meta.quickAdd.map((t: any) => (
            <Chip
              key={t.name + t.amount_inr}
              onClick={() =>
                update(drafts[0].key, {
                  name: t.name, amount: String(t.amount_inr), category_id: t.category_id, ai_category_id: t.category_id, necessity: t.necessity, ai_necessity: t.necessity,
                  payment_mode: t.payment_mode, entry_method: 'quick',
                })
              }
            >
              <span>{t.emoji}</span>
              {t.name} <span className="text-muted">{inr(t.amount_inr)}</span>
            </Chip>
          ))}
        </div>
      )}

      {clarifications.length > 0 && (
        <div className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          {clarifications.map((c) => (
            <p key={c}>⚠️ {c}</p>
          ))}
        </div>
      )}

      {drafts && (
        <div className="space-y-4">
          {drafts.map((d, i) => (
            <div key={d.key} className={cn(drafts.length > 1 && 'rounded-2xl border border-border p-3')}>
              {drafts.length > 1 && (
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
                  <span>Expense {i + 1} of {drafts.length}</span>
                  <button className="rounded-lg p-1 hover:bg-soft" onClick={() => setDrafts(drafts.filter((x) => x.key !== d.key))} aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
              <ExpenseFields draft={d} meta={meta} onChange={(p) => update(d.key, p)} errors={showErrors ? problems(d) : []} autoFocus={tab === 'form' && i === 0} />
            </div>
          ))}
          <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-border bg-card px-5 pt-3">
            {tab === 'form' && (
              <Button variant="secondary" className="flex-1" onClick={() => save(true)} disabled={saving}>
                Save & add another
              </Button>
            )}
            <Button className="flex-1" size="lg" loading={saving} onClick={() => save(false)}>
              Save{drafts.length > 1 ? ` ${drafts.length}` : ''} · <span className="font-normal opacity-90">+{Math.min(2 * drafts.length, 20)} 🪙</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function celebrate(r: { coins: number; streak: number; badges: any[]; alerts: string[]; events: { event: string }[] }) {
  const streakMsg = r.events.some((e) => e.event === 'streak_day') ? ` · 🔥 ${r.streak}-day streak` : '';
  toast.success(
    <div className="flex items-center gap-2">
      <span className="relative">
        🪙
        <span className="coin-pop absolute -top-2 left-3 text-xs font-bold text-coin">+{r.coins}</span>
      </span>
      <span>
        Saved! <b>+{r.coins} coins</b>
        {streakMsg}
      </span>
    </div>,
  );
  for (const b of r.badges || []) if (b) toast(`${b.emoji} Badge unlocked: ${b.name}`, { description: b.description });
  for (const a of r.alerts || []) toast.warning(a);
}

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function ExpenseFields({ draft, meta, onChange, errors, autoFocus }: { draft: Draft; meta: Meta; onChange: (p: Partial<Draft>) => void; errors: string[]; autoFocus?: boolean }) {
  const [picker, setPicker] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const name = useDebounced(draft.name, 300);
  const lastCat = useRef<string>('');
  const userPickedCat = useRef(false);
  const userPickedNec = useRef(!!draft.necessity && draft.entry_method !== 'form');
  const cat = meta.categories.find((c) => c.id === draft.category_id);
  const err = (f: string) => {
    const val = ({ spent_on: draft.spent_on, name: draft.name, amount: draft.amount, category_id: draft.category_id, payment_mode: draft.payment_mode, necessity: draft.necessity } as Record<string, unknown>)[f];
    return errors.includes(f) || (draft.missing.includes(f === 'amount' ? 'amount_inr' : f === 'category_id' ? 'category' : f) && !val);
  };

  // live categorisation as the name is typed (user rules → dictionary → Claude)
  useEffect(() => {
    const n = name.trim();
    if (n.length < 2 || n === lastCat.current || userPickedCat.current) return;
    lastCat.current = n;
    let cancelled = false;
    (async () => {
      try {
        const fast = await api<any>('/api/ai/categorize', { body: { name: n, amount: Number(draft.amount) || null, ai: false } });
        if (cancelled) return;
        let r = fast;
        if (fast.source === 'default' && n.length >= 3) {
          setAiBusy(true);
          r = await api<any>('/api/ai/categorize', { body: { name: n, amount: Number(draft.amount) || null } }).finally(() => setAiBusy(false));
          if (cancelled) return;
        }
        const patch: Partial<Draft> = { category_id: r.category_id, ai_category_id: r.category_id, ai_confidence: r.confidence, catSource: r.source };
        if (!userPickedNec.current && r.necessity_suggestion) {
          patch.necessity = r.necessity_suggestion;
          patch.ai_necessity = r.necessity_suggestion;
          patch.necessity_reason = r.necessity_reason;
        }
        onChange(patch);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const amt = Number(draft.amount);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <Label hint={draft.dateAssumed ? <span className="text-warn">assumed today</span> : <span>{fmtDate(draft.spent_on)}</span>}>Date</Label>
          <Input type="date" lang="en-IN" max={todayLocal()} value={draft.spent_on} invalid={err('spent_on') || draft.dateAssumed} onChange={(e) => onChange({ spent_on: e.target.value, dateAssumed: false })} aria-label="Date" />
        </div>
        <div className="flex items-end gap-1">
          {[0, -1].map((o) => {
            const d = new Date(Date.now() + o * 86400000);
            const v = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
            return (
              <Chip key={o} active={draft.spent_on === v} onClick={() => onChange({ spent_on: v, dateAssumed: false })} className="h-11 rounded-xl">
                {o === 0 ? 'Today' : 'Yesterday'}
              </Chip>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Expense name</Label>
        <Input
          autoFocus={autoFocus}
          placeholder='e.g. "Swiggy biryani", "Metro", "Netflix"'
          value={draft.name}
          invalid={err('name')}
          maxLength={80}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-label="Expense name"
        />
      </div>

      <div>
        <Label hint={amt >= 1000 ? <span className="num">{inr(amt)}</span> : undefined}>Amount (₹)</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted">₹</span>
          <Input
            className="num pl-8 text-lg font-semibold"
            inputMode="decimal"
            placeholder="0"
            value={draft.amount}
            invalid={err('amount')}
            onChange={(e) => onChange({ amount: e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') })}
            aria-label="Amount in rupees"
          />
        </div>
      </div>

      <div>
        <Label hint={aiBusy ? <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />asking Claude…</span> : draft.ai_confidence != null && draft.category_id === draft.ai_category_id ? <span>{Math.round(draft.ai_confidence * 100)}% sure</span> : undefined}>
          Category
        </Label>
        <button
          type="button"
          onClick={() => setPicker(!picker)}
          className={cn('flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-left transition hover:bg-soft', err('category_id') ? 'border-warn bg-warn/5 ring-2 ring-warn/25' : 'border-border')}
          aria-expanded={picker}
        >
          {cat ? (
            <>
              <span className="grid h-7 w-7 place-items-center rounded-lg text-base" style={{ background: cat.colour + '22' }}>{cat.emoji}</span>
              <span className="font-medium">{cat.name}</span>
              {draft.category_id === draft.ai_category_id && draft.catSource && draft.catSource !== 'default' && (
                <span className="ml-auto flex items-center gap-1 text-xs text-primary"><Sparkles className="h-3 w-3" />auto</span>
              )}
            </>
          ) : (
            <span className="text-muted">{draft.name ? 'Pick a category' : 'Fills in as you type the name'}</span>
          )}
        </button>
        {picker && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {meta.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  userPickedCat.current = true;
                  onChange({ category_id: c.id });
                  setPicker(false);
                }}
                className={cn('flex flex-col items-center gap-1 rounded-xl border p-2 text-center text-[11px] leading-tight transition hover:bg-soft', c.id === draft.category_id ? 'border-primary bg-primary-soft' : 'border-border')}
              >
                <span className="text-xl">{c.emoji}</span>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label hint={draft.necessity_reason && draft.necessity === draft.ai_necessity ? <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />{draft.necessity_reason}</span> : undefined}>
          Did you need it?
        </Label>
        <div className={cn('grid grid-cols-3 gap-2 rounded-xl', err('necessity') && 'ring-2 ring-warn/40')}>
          {(['necessary', 'neutral', 'unnecessary'] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                userPickedNec.current = true;
                onChange({ necessity: n });
              }}
              className={cn('h-11 rounded-xl border text-sm font-medium transition', draft.necessity === n ? 'border-transparent text-white shadow-sm' : 'border-border hover:bg-soft')}
              style={draft.necessity === n ? { background: NECESSITY_COLOURS[n] } : undefined}
              aria-pressed={draft.necessity === n}
            >
              {NECESSITY_LABELS[n]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Mode of payment</Label>
        <div className={cn('flex flex-wrap gap-2 rounded-xl', err('payment_mode') && 'p-1 ring-2 ring-warn/40')}>
          {PAYMENT_MODES.map((m) => (
            <Chip key={m} active={draft.payment_mode === m} onClick={() => onChange({ payment_mode: m })}>
              {PAYMENT_LABELS[m]}
            </Chip>
          ))}
        </div>
      </div>

      <details className="group" open={!!draft.notes || !!draft.mood}>
        <summary className="cursor-pointer list-none text-sm font-medium text-primary">+ Notes & mood (optional)</summary>
        <div className="mt-3 space-y-3">
          <Input placeholder="Notes / remarks — e.g. with Rohit" value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} maxLength={500} aria-label="Notes" />
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <Chip key={m.id} active={draft.mood === m.id} onClick={() => onChange({ mood: draft.mood === m.id ? null : m.id })}>
                {m.emoji} {m.label}
              </Chip>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

// ---------------- Type & Speak ----------------
function SentenceEntry({ mode, onParsed, defaultMode }: { mode: 'type' | 'speak'; onParsed: (d: Draft[], c: string[]) => void; defaultMode: PaymentMode }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef<any>(null);
  const supported = useMemo(() => typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition), []);

  useEffect(() => () => recRef.current?.abort?.(), []);

  function startListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalText = text ? text + ' ' : '';
    rec.onresult = (e: any) => {
      let inter = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + ' ';
        else inter += r[0].transcript;
      }
      setText(finalText.trim());
      setInterim(inter);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') toast.error('Microphone permission was denied');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast.error(`Speech error: ${e.error}`);
    };
    rec.onend = () => {
      setListening(false);
      setInterim('');
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function fill() {
    if (text.trim().length < 2) return;
    setBusy(true);
    try {
      const r = await api<any>('/api/ai/parse', { body: { text, language: lang } });
      if (!r.expenses.length) {
        toast.error('Couldn’t find an expense in that — try "250 chai UPI se"');
        return;
      }
      const ds: Draft[] = r.expenses.map((e: any) =>
        blank(e.payment_mode ?? null, {
          spent_on: e.date || r.today,
          dateAssumed: !e.date,
          name: e.name || '',
          amount: e.amount_inr != null ? String(e.amount_inr) : '',
          category_id: e.category_id,
          ai_category_id: e.category_id,
          ai_confidence: e.category_confidence ?? e.confidence,
          necessity: e.necessity_suggestion,
          ai_necessity: e.necessity_suggestion,
          necessity_reason: e.necessity_reason,
          notes: e.notes || '',
          missing: e.missing.filter((m: string) => m !== 'date'),
          entry_method: mode === 'speak' ? 'voice' : 'text',
          raw_input: text,
          catSource: r.source,
        }),
      );
      onParsed(ds, r.clarifications);
      if (r.source === 'rules') toast.message('Filled with the offline parser', { description: 'Add an ANTHROPIC_API_KEY to use Claude Haiku for parsing.' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
    void defaultMode;
  }

  return (
    <div className="mb-4 space-y-3">
      {mode === 'speak' && (
        <div className="flex flex-col items-center gap-3 py-2">
          {supported ? (
            <>
              <Segmented value={lang} onChange={setLang} options={[{ value: 'en-IN', label: 'English (India)' }, { value: 'hi-IN', label: 'हिन्दी / Hinglish' }]} />
              <button
                type="button"
                onClick={() => (listening ? recRef.current?.stop() : startListening())}
                className={cn('grid h-20 w-20 place-items-center rounded-full text-white shadow-lg transition active:scale-95', listening ? 'mic-live bg-bad' : 'bg-primary')}
                aria-label={listening ? 'Stop listening' : 'Start speaking'}
              >
                {listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </button>
              <p className="text-sm text-muted">{listening ? 'Listening… tap to stop' : 'Tap and say it — e.g. “Aaj Ola se office gaya, 180 rupees, UPI se”'}</p>
            </>
          ) : (
            <p className="rounded-xl bg-soft p-3 text-center text-sm text-muted">Voice input isn’t supported in this browser (try Chrome or Edge). You can type the sentence instead.</p>
          )}
        </div>
      )}
      <div>
        <Label hint={<span>Hindi, English or Hinglish</span>}>{mode === 'speak' ? 'Transcript (edit if needed)' : 'Type one sentence'}</Label>
        <Textarea
          rows={3}
          value={text + (interim ? (text ? ' ' : '') + interim : '')}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "kal Rohit ke saath 250 ka chai samosa, UPI se" or "200 chai aur 500 petrol"'
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              fill();
            }
          }}
          aria-label="Expense sentence"
        />
      </div>
      <Button className="w-full" variant="secondary" loading={busy} onClick={fill} disabled={text.trim().length < 2}>
        <Sparkles className="h-4 w-4" /> Fill the form
      </Button>
    </div>
  );
}
