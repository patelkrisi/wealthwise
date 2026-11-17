'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/client/api';
import { Button, Input, Label, Segmented } from '@/components/ui';
import { Logo } from '@/components/app-shell';
import { DemoButton } from '@/components/demo-button';

const ERRORS: Record<string, string> = {
  google_not_configured: 'Google sign-in isn’t available right now — please use your email and password.',
  google_state: 'Google sign-in expired — please try again.',
  google_token: 'Google sign-in failed — please try again.',
  google_email: 'Your Google account email isn’t verified.',
  google_failed: 'Google sign-in failed — please try again.',
};

export function AuthForm({ googleEnabled }: { googleEnabled: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(sp.get('mode') === 'signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(sp.get('error') ? ERRORS[sp.get('error')!] || 'Sign-in failed' : null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const r = await api<any>('/api/auth/forgot', { body: { email } });
        toast.success(r.message);
        if (r.devLink) setResetLink(r.devLink);
      } else {
        const r = await api<any>(`/api/auth/${mode}`, { body: { email, password, name } });
        router.push(r.next);
        router.refresh();
        return;
      }
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-fg lg:flex">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="rounded-lg bg-white/15 p-1"><Logo size={26} /></span> Wealthwise
        </Link>
        <div>
          <p className="text-4xl font-extrabold leading-tight">“₹1,800 of my ₹4,200 food spend was avoidable. Now I know — and I’m saving it.”</p>
          <p className="mt-4 opacity-80">Track. Tag. Save.</p>
        </div>
        <p className="text-sm opacity-70">No bank passwords. Export or delete your data any time.</p>
      </div>
      <div className="flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo /> <span className="text-lg font-bold">Wealthwise</span>
          </Link>
          <h1 className="text-2xl font-bold">{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Welcome back'}</h1>
          <p className="mt-1 text-sm text-muted">{mode === 'forgot' ? 'We’ll send you a link to choose a new password.' : 'Your money, judged kindly.'}</p>

          {mode !== 'forgot' && (
            <Segmented className="mt-6 w-full" value={mode} onChange={(m) => { setMode(m); setError(null); }} options={[{ value: 'login', label: 'Log in' }, { value: 'signup', label: 'Sign up' }]} />
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'signup' && (
              <div>
                <Label>Your name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya" autoComplete="name" />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            {mode !== 'forgot' && (
              <div>
                <Label hint={mode === 'login' ? <button type="button" className="text-primary" onClick={() => { setMode('forgot'); setError(null); }}>Forgot password?</button> : <span>8+ characters, with a number</span>}>Password</Label>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : 1} />
              </div>
            )}
            {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad" role="alert">{error}</p>}
            {resetLink && (
              <p className="rounded-xl bg-primary-soft px-3 py-2 text-sm">
                Email isn’t configured here, so use this link: <Link className="break-all font-medium text-primary underline" href={resetLink.replace(/^https?:\/\/[^/]+/, '')}>Reset password</Link>
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Log in'}
            </Button>
            {mode === 'signup' && (
              <p className="text-center text-xs text-muted">
                By creating an account you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy policy</Link>.
              </p>
            )}
          </form>

          {mode === 'forgot' ? (
            <button className="mt-4 w-full text-sm text-primary" onClick={() => { setMode('login'); setResetLink(null); }}>Back to log in</button>
          ) : (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
              {googleEnabled && (
                <a
                  href="/api/auth/google"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium hover:bg-soft"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
                  Continue with Google
                </a>
              )}
              <DemoButton className={googleEnabled ? 'mt-3 w-full' : 'w-full'} variant="secondary" size="md">Explore the demo account</DemoButton>
              <p className="mt-3 text-center text-xs text-muted">Demo: demo@wealthwise.app · Demo@1234</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
