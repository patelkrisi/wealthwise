'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import React, { useEffect, useState } from 'react';
import { flushQueue } from '@/lib/client/offline';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false, retry: 1 } } }));
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const sync = async () => {
      try {
        const n = await flushQueue();
        if (n) {
          toast.success(`Synced ${n} offline expense${n > 1 ? 's' : ''}`);
          qc.invalidateQueries();
        }
      } catch {}
    };
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [qc]);
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster position="top-center" richColors closeButton toastOptions={{ style: { borderRadius: 14 } }} />
    </QueryClientProvider>
  );
}

/** Applies theme + accent to <html>, remembering them for the no-flash script. */
export function useApplyTheme(theme: string, accent: string) {
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.accent = accent || 'teal';
    };
    apply();
    try {
      localStorage.setItem('ww-theme', theme);
      localStorage.setItem('ww-accent', accent || 'teal');
    } catch {}
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, accent]);
}
