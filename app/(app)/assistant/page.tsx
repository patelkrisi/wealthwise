'use client';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mic, MicOff, RotateCcw, Send, Sparkles } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Bars, Donut } from '@/components/charts';
import { Chip, cn, Rich } from '@/components/ui';
import { Logo } from '@/components/app-shell';

type ChartData = { type: 'bar' | 'pie'; title: string; data: { label: string; value: number }[] };

/** Only keep a chart that is safe to draw (old or malformed data is dropped instead of crashing the page). */
function safeChart(c: any): ChartData | undefined {
  if (!c || typeof c !== 'object' || !Array.isArray(c.data)) return undefined;
  const data = c.data
    .filter((d: any) => d && Number.isFinite(Number(d.value)))
    .map((d: any) => ({ label: String(d.label ?? '—'), value: Number(d.value) }));
  if (!data.length) return undefined;
  return { type: c.type === 'pie' ? 'pie' : 'bar', title: String(c.title ?? ''), data };
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  chart?: ChartData;
  followups?: string[];
  pending?: boolean;
}

export default function AssistantPage() {
  const qc = useQueryClient();
  const { data: sugg } = useQuery<any>({ queryKey: ['assistant', 'suggestions'], queryFn: () => api('/api/assistant/suggestions') });
  const { data: history } = useQuery<any[]>({ queryKey: ['assistant', 'history'], queryFn: () => api('/api/assistant') });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState<{ used: number; cap: number } | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (history && !loaded.current) {
      loaded.current = true;
      const rows = Array.isArray(history) ? history : [];
      setMsgs(
        rows.map((h: any, i: number) => ({
          id: String(h?.id ?? 'h' + i),
          role: h?.role === 'user' ? 'user' : 'assistant',
          content: typeof h?.content === 'string' ? h.content : '',
          chart: safeChart(h?.meta?.chart),
          followups: Array.isArray(h?.meta?.followups) ? h.meta.followups.filter((f: unknown) => typeof f === 'string') : undefined,
        })),
      );
    }
  }, [history]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    const aid = 'a' + Date.now();
    setMsgs((m) => [...m.map((x) => ({ ...x, followups: undefined })), { id: 'u' + Date.now(), role: 'user', content: q }, { id: aid, role: 'assistant', content: '', pending: true }]);
    try {
      const res = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q }) });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Something went wrong');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: any;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          setMsgs((m) =>
            m.map((x) => {
              if (x.id !== aid) return x;
              if (ev.t === 'text') return { ...x, content: x.content + String(ev.v ?? '') };
              if (ev.t === 'chart') return { ...x, chart: safeChart(ev.v) };
              if (ev.t === 'followups') return { ...x, followups: Array.isArray(ev.v) ? ev.v.map(String) : undefined };
              if (ev.t === 'error') return { ...x, content: x.content || String(ev.v ?? '') };
              if (ev.t === 'done') return { ...x, pending: false };
              return x;
            }),
          );
          if (ev.t === 'cap') setCap(ev.v);
        }
      }
    } catch (e: any) {
      toast.error(e.message);
      setMsgs((m) => m.filter((x) => x.id !== aid));
    } finally {
      setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, pending: false } : x)));
      setBusy(false);
    }
  }

  function mic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return toast.error('Voice input isn’t supported in this browser');
    if (listening) return recRef.current?.stop();
    const r = new SR();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.onresult = (e: any) => setInput(Array.from(e.results).map((x: any) => x[0].transcript).join(' '));
    r.onend = () => setListening(false);
    recRef.current = r;
    r.start();
    setListening(true);
  }

  const empty = msgs.length === 0;
  const chips: string[] = Array.isArray(sugg?.chips) ? sugg.chips.filter((c: unknown) => typeof c === 'string') : [];
  return (
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] max-w-3xl flex-col lg:h-[calc(100dvh-6.5rem)]">
      <div className="mb-3 flex items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Ask Wealthwise</h1>
          <p className="text-xs text-muted">
            {sugg?.ai ? <><Sparkles className="mr-1 inline h-3 w-3" />Claude answers from your own data</> : 'Answers come from your own expenses — every number is calculated, never guessed'}
            {cap && ` · ${cap.cap - cap.used} questions left today`}
          </p>
        </div>
        {!empty && (
          <button className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs text-muted hover:bg-soft" onClick={async () => { await api('/api/assistant', { method: 'DELETE' }); setMsgs([]); qc.invalidateQueries({ queryKey: ['assistant'] }); }}>
            <RotateCcw className="h-3.5 w-3.5" /> New chat
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-4" aria-live="polite">
        {empty && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Logo size={44} />
            <p className="mt-3 font-semibold">Ask anything about your money</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              {sugg?.empty ? 'Add a few expenses first — then ask about them here.' : 'In English or Hinglish — “Is mahine sabse zyada kahan kharch hua?”'}
            </p>
            <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
              {chips.map((c) => <Chip key={c} onClick={() => ask(c)} className="h-auto py-1.5 text-left">{c}</Chip>)}
            </div>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed', m.role === 'user' ? 'rounded-br-md bg-primary text-primary-fg' : 'rounded-bl-md bg-soft')}>
              {m.role === 'assistant' ? (
                <>
                  {m.content ? <Rich text={m.content} className="text-fg/90 [&_strong]:text-fg" /> : <span className="inline-flex gap-1 py-1"><span className="h-2 w-2 animate-bounce rounded-full bg-muted" /><span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:.15s]" /><span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:.3s]" /></span>}
                  {m.chart && (
                    <div className="mt-3 rounded-xl bg-card p-2">
                      <p className="mb-1 px-1 text-xs font-medium text-muted">{m.chart.title}</p>
                      {m.chart.type === 'pie' ? <Donut height={170} data={m.chart.data} animate={false} /> : <Bars height={170} animate={false} data={m.chart.data.map((d) => ({ ...d, label: d.label.length > 10 ? d.label.slice(0, 9) + '…' : d.label }))} money={!/%/.test(m.chart.title)} />}
                    </div>
                  )}
                </>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {!busy && msgs.length > 0 && msgs[msgs.length - 1].followups && (
          <div className="flex flex-wrap gap-2">
            {msgs[msgs.length - 1].followups!.map((f) => <Chip key={f} onClick={() => ask(f)} className="h-auto py-1.5 text-left text-xs">{f}</Chip>)}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!empty && chips.length > 0 && (
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
          {chips.slice(0, 8).map((c) => <Chip key={c} onClick={() => ask(c)} className="text-xs">{c}</Chip>)}
        </div>
      )}
      <form className="mt-2 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <button type="button" onClick={mic} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border', listening ? 'mic-live bg-bad text-white' : 'bg-card hover:bg-soft')} aria-label={listening ? 'Stop' : 'Speak your question'}>
          {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your spending…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          aria-label="Your question"
          maxLength={600}
        />
        <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg disabled:opacity-50" disabled={busy || !input.trim()} aria-label="Send">
          <Send className="h-5 w-5" />
        </button>
      </form>
      <p className="mt-1.5 text-center text-[11px] text-muted">Spending insights only — not investment, tax or loan advice.</p>
    </div>
  );
}
