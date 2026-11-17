'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BarChart3, FileText, Gift, Home, ListOrdered, LogOut, MessageCircle, Plus, Settings, Target, CalendarCheck } from 'lucide-react';
import { api } from '@/lib/client/api';
import { AddExpenseProvider, useAddExpense } from './add-expense';
import { useApplyTheme } from './providers';
import { cn, Sheet } from './ui';

const MAIN = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transactions', icon: ListOrdered },
  { href: '#add', label: 'Add', icon: Plus },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/assistant', label: 'Ask Wealthwise', short: 'Ask', icon: MessageCircle },
];
const MORE = [
  { href: '/goals', label: 'Goals & budgets', icon: Target },
  { href: '/rewards', label: 'Rewards', icon: Gift },
  { href: '/weekly', label: 'Weekly review', icon: CalendarCheck },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export interface ShellProfile {
  name: string;
  email: string;
  theme: string;
  accent: string;
  avatar_frame: string | null;
  is_demo: boolean;
}

export function AppShell({ profile, children }: { profile: ShellProfile; children: React.ReactNode }) {
  useApplyTheme(profile.theme, profile.accent);
  return (
    <AddExpenseProvider>
      <Shell profile={profile}>{children}</Shell>
    </AddExpenseProvider>
  );
}

export function Avatar({ name, frame, size = 36 }: { name: string; frame?: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '🙂';
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full bg-primary-soft font-semibold text-primary', frame && `frame-${frame}`)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function Shell({ profile, children }: { profile: ShellProfile; children: React.ReactNode }) {
  const path = usePathname();
  const { open } = useAddExpense();
  const router = useRouter();
  const qc = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const { data: status } = useQuery<any>({ queryKey: ['gam', 'status'], queryFn: () => api('/api/gamification/status'), refetchInterval: 120_000 });
  const { data: notifs } = useQuery<any[]>({ queryKey: ['notifications'], queryFn: () => api('/api/notifications'), refetchInterval: 60_000 });
  const unread = notifs?.filter((n) => !n.read).length ?? 0;

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    qc.clear();
    router.push('/auth');
  }

  const isActive = (href: string) => path === href || (href !== '/home' && path.startsWith(href + '/')) || (href === '/reports' && path.startsWith('/reports'));

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card px-4 py-5 lg:flex">
        <Link href="/home" className="mb-6 flex items-center gap-2 px-2">
          <Logo />
          <span className="text-lg font-bold tracking-tight">Wealthwise</span>
        </Link>
        <nav className="space-y-1" aria-label="Main">
          {MAIN.map((n) =>
            n.href === '#add' ? (
              <button key="add" onClick={() => open()} className="my-2 flex w-full items-center gap-3 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-fg shadow-sm hover:opacity-90">
                <Plus className="h-5 w-5" /> Add expense <kbd className="ml-auto rounded bg-white/20 px-1.5 text-[10px]">N</kbd>
              </button>
            ) : (
              <NavLink key={n.href} {...n} active={isActive(n.href)} />
            ),
          )}
        </nav>
        <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">More</p>
        <nav className="space-y-1" aria-label="More">
          {MORE.map((n) => (
            <NavLink key={n.href} {...n} active={isActive(n.href)} />
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-soft p-3 text-xs text-muted">
          {profile.is_demo ? (
            <p>
              <b className="text-fg">Demo account.</b> Explore freely — reset any time in Settings.
            </p>
          ) : (
            <p>Spending insights, not investment, tax or financial advice.</p>
          )}
        </div>
      </aside>

      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link href="/home" className="flex items-center gap-2 lg:hidden">
            <Logo />
            <span className="font-bold tracking-tight">Wealthwise</span>
          </Link>
          <div className="ml-auto flex items-center gap-1.5">
            {status && (
              <>
                <Link href="/rewards" className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-sm font-semibold shadow-sm ring-1 ring-border" title="Current streak">
                  <span className={cn(status.streak.current > 0 && 'flame')}>🔥</span>
                  <span className="num">{status.streak.current}</span>
                </Link>
                <Link href="/rewards" className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-sm font-semibold shadow-sm ring-1 ring-border" title="Coin balance">
                  🪙 <span className="num">{status.coins.toLocaleString('en-IN')}</span>
                </Link>
              </>
            )}
            <button onClick={() => setNotifOpen(true)} className="relative rounded-full p-2 hover:bg-soft" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread}</span>}
            </button>
            <DM.Root>
              <DM.Trigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Account menu">
                <Avatar name={profile.name} frame={profile.avatar_frame} size={34} />
              </DM.Trigger>
              <DM.Portal>
                <DM.Content align="end" sideOffset={8} className="z-50 w-60 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
                  <div className="px-3 py-2">
                    <p className="font-semibold">{profile.name}</p>
                    <p className="truncate text-xs text-muted">{profile.email}</p>
                  </div>
                  <DM.Separator className="my-1 h-px bg-border" />
                  {MORE.map((n) => (
                    <DM.Item key={n.href} asChild>
                      <Link href={n.href} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none data-[highlighted]:bg-soft">
                        <n.icon className="h-4 w-4 text-muted" /> {n.label}
                      </Link>
                    </DM.Item>
                  ))}
                  <DM.Separator className="my-1 h-px bg-border" />
                  <DM.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-bad outline-none data-[highlighted]:bg-soft">
                    <LogOut className="h-4 w-4" /> Log out
                  </DM.Item>
                </DM.Content>
              </DM.Portal>
            </DM.Root>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:pb-12">{children}</main>

      {/* mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {MAIN.map((n) =>
            n.href === '#add' ? (
              <div key="add" className="grid place-items-center">
                <button onClick={() => open()} className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg shadow-lg ring-4 ring-bg active:scale-95" aria-label="Add expense">
                  <Plus className="h-7 w-7" />
                </button>
              </div>
            ) : (
              <Link key={n.href} href={n.href} className={cn('flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive(n.href) ? 'text-primary' : 'text-muted')} aria-current={isActive(n.href) ? 'page' : undefined}>
                <n.icon className="h-5 w-5" />
                {n.short || n.label}
              </Link>
            ),
          )}
        </div>
      </nav>

      <Sheet open={notifOpen} onOpenChange={setNotifOpen} title="Notifications">
        <Notifications onNavigate={() => setNotifOpen(false)} />
      </Sheet>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: any; active: boolean }) {
  return (
    <Link href={href} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', active ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-soft hover:text-fg')} aria-current={active ? 'page' : undefined}>
      <Icon className="h-5 w-5" /> {label}
    </Link>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path d="M7 10l4.2 12L16 12l4.8 10L25 10" fill="none" stroke="var(--primary-fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Notifications({ onNavigate }: { onNavigate: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<any[]>({ queryKey: ['notifications'], queryFn: () => api('/api/notifications') });
  const markAll = async () => {
    await api('/api/notifications', { body: {} });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  if (!data) return null;
  return (
    <div className="pb-2">
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">You’re all caught up.</p>
      ) : (
        <>
          <button onClick={markAll} className="mb-2 text-sm font-medium text-primary">Mark all as read</button>
          <ul className="divide-y divide-border">
            {data.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link || '/home'}
                  onClick={async () => {
                    onNavigate();
                    if (!n.read) {
                      await api('/api/notifications', { body: { id: n.id } });
                      qc.invalidateQueries({ queryKey: ['notifications'] });
                    }
                  }}
                  className="flex gap-3 py-3"
                >
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                  <span>
                    <span className="block text-sm font-medium">{n.title}</span>
                    <span className="block text-sm text-muted">{n.body}</span>
                    <span className="mt-0.5 block text-xs text-muted">{new Date(n.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
