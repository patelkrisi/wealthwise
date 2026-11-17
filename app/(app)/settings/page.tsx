'use client';
import { ACCENTS } from '@/lib/theme';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Download, Palette, RefreshCcw, Shield, Tags, Trash2, User, Wallet } from 'lucide-react';
import { api } from '@/lib/client/api';
import { PAYMENT_LABELS, PAYMENT_MODES } from '@/lib/format';
import { BASE_ICONS, EXTRA_ICONS } from '@/lib/seed/catalog';
import { Button, Card, Chip, cn, Input, Label, PageHeader, Segmented, Select, Skeleton, Switch } from '@/components/ui';
import { Avatar } from '@/components/app-shell';

const OCC = [['student', 'Student'], ['professional', 'Salaried professional'], ['self_employed', 'Self-employed'], ['homemaker', 'Household manager'], ['other', 'Other']];
const INC = [['none', 'No regular income'], ['<10k', 'Under ₹10,000'], ['10k-25k', '₹10k – ₹25k'], ['25k-50k', '₹25k – ₹50k'], ['50k-1L', '₹50k – ₹1L'], ['1L-2L', '₹1L – ₹2L'], ['2L+', 'Above ₹2L']];

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</h2>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: p } = useQuery<any>({ queryKey: ['profile'], queryFn: () => api('/api/profile') });
  const { data: store } = useQuery<any[]>({ queryKey: ['gam', 'store'], queryFn: () => api('/api/gamification/store') });
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (p && !f) setF(p); }, [p, f]);
  if (!p || !f) return <Skeleton className="h-[600px]" />;

  async function save(patch: any, msg = 'Saved') {
    try {
      const r = await api('/api/profile', { method: 'PATCH', body: patch });
      setF(r);
      qc.invalidateQueries();
      toast.success(msg);
      if ('theme' in patch || 'accent' in patch || 'avatar_frame' in patch) router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  const ownedFrames = store?.filter((s) => s.type === 'frame' && (s.owned || s.active)).map((s) => s.value) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={User} title="Profile">
          <div className="space-y-3">
            <div className="flex items-center gap-3"><Avatar name={f.name} frame={f.avatar_frame} size={48} /><div><p className="font-semibold">{f.name}</p><p className="text-sm text-muted">{f.email}</p></div></div>
            <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => f.name !== p.name && save({ name: f.name })} /></div>
            <div><Label>Occupation</Label><Select value={f.occupation || ''} onChange={(e) => save({ occupation: e.target.value || null })}><option value="">—</option>{OCC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          </div>
        </Section>

        <Section icon={Wallet} title="Income & money rules">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Monthly income</Label><Select value={f.monthly_income_range || ''} onChange={(e) => save({ monthly_income_range: e.target.value || null })}><option value="">—</option>{INC.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
              <div><Label hint={<span>for cost-in-hours</span>}>Exact (₹, optional)</Label><Input inputMode="numeric" value={f.monthly_income ?? ''} onChange={(e) => setF({ ...f, monthly_income: e.target.value.replace(/\D/g, '') })} onBlur={() => save({ monthly_income: f.monthly_income ? Number(f.monthly_income) : null })} /></div>
            </div>
            <div><Label>Payday (day of month)</Label><Input inputMode="numeric" value={f.payday ?? ''} onChange={(e) => setF({ ...f, payday: e.target.value.replace(/\D/g, '').slice(0, 2) })} onBlur={() => save({ payday: f.payday ? Number(f.payday) : null })} /></div>
            <div>
              <Label hint={<b className="num text-fg">{f.neutral_cut_pct}%</b>}>Neutral spend counted as cuttable</Label>
              <input type="range" min={0} max={100} step={5} value={f.neutral_cut_pct} onChange={(e) => setF({ ...f, neutral_cut_pct: Number(e.target.value) })} onMouseUp={() => save({ neutral_cut_pct: f.neutral_cut_pct })} onTouchEnd={() => save({ neutral_cut_pct: f.neutral_cut_pct })} onKeyUp={() => save({ neutral_cut_pct: f.neutral_cut_pct })} className="w-full accent-[var(--primary)]" aria-label="Neutral cut percent" />
              <p className="text-xs text-muted">Avoidable = Unnecessary + this % of Neutral. Default 25%.</p>
            </div>
            <div>
              <Label hint={<b className="num text-fg">{f.savings_cap_pct}%</b>}>Max weekly cut target</Label>
              <input type="range" min={10} max={100} step={5} value={f.savings_cap_pct} onChange={(e) => setF({ ...f, savings_cap_pct: Number(e.target.value) })} onMouseUp={() => save({ savings_cap_pct: f.savings_cap_pct })} onTouchEnd={() => save({ savings_cap_pct: f.savings_cap_pct })} onKeyUp={() => save({ savings_cap_pct: f.savings_cap_pct })} className="w-full accent-[var(--primary)]" aria-label="Savings cap percent" />
              <p className="text-xs text-muted">Targets start at 30% and rise 10%/week while you keep hitting them, up to this cap.</p>
            </div>
            <div><Label>Default payment mode</Label>
              <div className="flex flex-wrap gap-2"><Chip active={!f.default_payment_mode} onClick={() => save({ default_payment_mode: null })}>Most used</Chip>{PAYMENT_MODES.map((m) => <Chip key={m} active={f.default_payment_mode === m} onClick={() => save({ default_payment_mode: m })}>{PAYMENT_LABELS[m]}</Chip>)}</div>
            </div>
          </div>
        </Section>

        <Section icon={Bell} title="Notifications">
          <div className="space-y-4">
            <div className="flex items-center justify-between"><span className="text-sm">Reminders & alerts</span><Switch checked={f.notifications_enabled} label="Notifications" onChange={(v) => save({ notifications_enabled: v })} /></div>
            <div><Label>Daily log reminder (IST)</Label><Input type="time" value={f.reminder_time} onChange={(e) => setF({ ...f, reminder_time: e.target.value })} onBlur={() => save({ reminder_time: f.reminder_time })} className="w-40" /></div>
            <div className="flex items-center justify-between"><span className="text-sm">Weekly & monthly summary emails</span><Switch checked={f.email_summaries} label="Summary emails" onChange={(v) => save({ email_summaries: v })} /></div>
            <PushToggle />
            <p className="text-xs text-muted">You’ll get: daily log reminder, streak-at-risk at 9 pm, budget alerts at 80%/100% and early overspend warnings at 10 pm, plus weekly and monthly summaries.</p>
          </div>
        </Section>

        <Section icon={Palette} title="Appearance">
          <div className="space-y-4">
            <Segmented value={f.theme} onChange={(v) => { const dark = v === 'dark' || (v === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); try { localStorage.setItem('ww-theme', v); } catch {} setF({ ...f, theme: v }); save({ theme: v }, 'Appearance updated'); }} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} />
            <div>
              <Label>Colour theme</Label>
              <div className="grid grid-cols-3 gap-2">
                {ACCENTS.map((a) => {
                  const on = (f.accent || 'teal') === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        if (on) return;
                        document.documentElement.dataset.accent = a.id;
                        try { localStorage.setItem('ww-accent', a.id); } catch {}
                        setF({ ...f, accent: a.id });
                        save({ accent: a.id }, `${a.label} theme on`);
                      }}
                      className={cn('flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium transition', on ? 'border-primary bg-primary-soft text-fg' : 'border-border hover:bg-soft')}
                      aria-pressed={on}
                    >
                      <span className="flex -space-x-1.5">
                        <span className="h-6 w-6 rounded-full ring-2 ring-card" style={{ background: a.light }} />
                        <span className="h-6 w-6 rounded-full ring-2 ring-card" style={{ background: a.dark }} />
                      </span>
                      {a.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">Each theme has a light and a dark version, so it works in Light, Dark and System mode.</p>
            </div>
            {ownedFrames.length > 0 && (
              <div><Label>Avatar frame</Label><div className="flex flex-wrap gap-2"><Chip active={!f.avatar_frame} onClick={() => save({ avatar_frame: null })}>None</Chip>{ownedFrames.map((fr) => <Chip key={fr} active={f.avatar_frame === fr} onClick={() => save({ avatar_frame: fr })} className="capitalize">{fr}</Chip>)}</div></div>
            )}
          </div>
        </Section>

        <CategoriesManager extraIcons={p.extra_icons} />

        <Section icon={Shield} title="Privacy & account">
          <div className="space-y-4">
            <a href="/api/export" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium hover:bg-soft"><Download className="h-4 w-4" /> Export all expenses (CSV)</a>
            {p.is_demo ? (
              <div className="rounded-xl bg-soft p-3">
                <p className="text-sm font-medium">Demo account</p>
                <p className="mb-3 text-xs text-muted">Regenerates 5 months of realistic data, coins, badges and goals.</p>
                <Button variant="outline" className="w-full" onClick={async () => { if (!confirm('Reset all demo data?')) return; const t = toast.loading('Rebuilding demo data…'); try { await api('/api/demo/reset', { method: 'POST' }); toast.success('Demo data reset', { id: t }); qc.invalidateQueries(); router.push('/home'); } catch (e: any) { toast.error(e.message, { id: t }); } }}><RefreshCcw className="h-4 w-4" /> Reset demo data</Button>
              </div>
            ) : (
              <>
                <ChangePassword hasPassword={p.has_password} />
                <DeleteAccount />
              </>
            )}
            <p className="text-xs text-muted"><a className="underline" href="/privacy">Privacy policy</a> · <a className="underline" href="/terms">Terms</a></p>
            <p className="text-xs text-muted">Wealthwise never asks for bank credentials. Voice is transcribed in your browser and never stored. Only the sentence you’re logging — or anonymous totals — is sent to Claude. Spending insights, not investment, tax or financial advice.</p>
          </div>
        </Section>
      </div>
    </div>
  );
}

function PushToggle() {
  const [state, setState] = useState<'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on' | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState(ios && !standalone ? 'ios-install' : 'unsupported');
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);
  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'blocked' : 'off');
        return toast.error('Notifications weren’t allowed');
      }
      const { publicKey } = await api<any>('/api/push/subscribe');
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
      await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (publicKey.length % 4)) % 4)), (c) => c.charCodeAt(0));
      let sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await api('/api/push/subscribe', { body: sub.toJSON() });
      setState('on');
      toast.success('Push notifications are on for this device');
    } catch (e: any) {
      toast.error(e.message || 'Could not turn on push');
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api('/api/push/subscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState('off');
      toast.success('Push notifications off for this device');
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    try {
      await api('/api/push/test', { body: {} });
      toast.success('Test sent — it should pop up in a few seconds');
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  if (state === 'loading') return null;
  if (state === 'unsupported') return <p className="text-xs text-muted">This browser doesn’t support push notifications. You’ll still see alerts under the bell icon.</p>;
  if (state === 'ios-install') return <p className="rounded-xl bg-soft p-3 text-xs text-muted">On iPhone, push works once Wealthwise is on your Home Screen: tap <b>Share → Add to Home Screen</b>, open it from there, and come back here to turn it on.</p>;
  if (state === 'blocked') return <p className="rounded-xl bg-soft p-3 text-xs text-muted">Notifications are blocked for this site. Allow them in your browser’s site settings (the icon left of the address bar), then reload this page.</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Push notifications on this device</span>
        {state === 'on' ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={disable}>Turn off</Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={enable}>Turn on</Button>
        )}
      </div>
      {state === 'on' && (
        <button type="button" onClick={test} className="text-xs font-medium text-primary hover:underline">Send me a test notification</button>
      )}
    </div>
  );
}

function CategoriesManager({ extraIcons }: { extraIcons: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery<any[]>({ queryKey: ['categories'], queryFn: () => api('/api/categories') });
  const [f, setF] = useState({ name: '', emoji: '🏷️', colour: '#0f766e', bucket: 'want' });
  const icons = extraIcons ? [...BASE_ICONS, ...EXTRA_ICONS] : BASE_ICONS;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['meta'] }); };
  return (
    <Section icon={Tags} title="Categories">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {data?.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-sm" style={{ borderColor: c.user_id ? c.colour : undefined }}>
            {c.emoji} {c.name}
            {c.user_id && <button className="ml-0.5 text-muted hover:text-bad" aria-label={`Delete ${c.name}`} onClick={async () => { if (confirm(`Delete “${c.name}”? Its expenses move to Others.`)) { await api(`/api/categories/${c.id}`, { method: 'DELETE' }); refresh(); } }}><Trash2 className="h-3.5 w-3.5" /></button>}
          </span>
        ))}
      </div>
      <form
        className="space-y-3 rounded-xl bg-soft p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/api/categories', { body: f });
            toast.success('Category added');
            setF({ ...f, name: '' });
            refresh();
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      >
        <p className="text-sm font-medium">Add a custom category</p>
        <div className="flex gap-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Pets" required />
          <input type="color" value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} className="h-11 w-12 cursor-pointer rounded-xl border border-border bg-card" aria-label="Colour" />
        </div>
        <div className="flex flex-wrap gap-1">{icons.map((i) => <button type="button" key={i} onClick={() => setF({ ...f, emoji: i })} className={cn('grid h-8 w-8 place-items-center rounded-lg text-lg', f.emoji === i ? 'bg-card ring-2 ring-primary' : 'hover:bg-card')}>{i}</button>)}</div>
        {!extraIcons && <p className="text-xs text-muted">Unlock 40 more icons in the Rewards store.</p>}
        <Button size="sm" className="w-full">Add category</Button>
      </form>
    </Section>
  );
}

function ChangePassword({ hasPassword }: { hasPassword: boolean }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); try { await api('/api/profile/password', { body: { current: cur, next } }); toast.success('Password updated'); setCur(''); setNext(''); } catch (e: any) { toast.error(e.message); } }}>
      <p className="text-sm font-medium">{hasPassword ? 'Change password' : 'Set a password'}</p>
      {hasPassword && <Input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />}
      <Input type="password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      <Button size="sm" variant="outline" className="w-full" disabled={!next}>Update password</Button>
    </form>
  );
}

function DeleteAccount() {
  const [txt, setTxt] = useState('');
  const router = useRouter();
  return (
    <div className="space-y-2 rounded-xl border border-bad/30 p-3">
      <p className="text-sm font-medium text-bad">Delete account permanently</p>
      <p className="text-xs text-muted">Removes every expense, goal, coin and setting. This can’t be undone (DPDP Act 2023 right to erasure).</p>
      <Input placeholder='Type "DELETE" to confirm' value={txt} onChange={(e) => setTxt(e.target.value)} />
      <Button variant="danger" size="sm" className="w-full" disabled={txt !== 'DELETE'} onClick={async () => { try { await api('/api/profile', { method: 'DELETE', body: { confirm: 'DELETE' } }); router.push('/'); } catch (e: any) { toast.error(e.message); } }}>Delete my account</Button>
    </div>
  );
}
