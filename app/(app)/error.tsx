'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Button, Card } from '@/components/ui';

/** Shown instead of a blank page if anything on a screen fails to load. The error is reported to the server logs. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const path = usePathname();
  useEffect(() => {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, message: String(error?.message || error).slice(0, 500), stack: String(error?.stack || '').slice(0, 1500), digest: error?.digest }),
    }).catch(() => {});
  }, [error, path]);
  const isChat = path?.startsWith('/assistant');
  return (
    <div className="mx-auto max-w-md py-16">
      <Card className="text-center">
        <p className="text-3xl">🛠️</p>
        <h1 className="mt-2 text-lg font-semibold">This screen hit a snag</h1>
        <p className="mt-1 text-sm text-muted">Your data is safe. Try again — and if it keeps happening, {isChat ? 'start a fresh chat.' : 'go back home.'}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
          {isChat ? (
            <Button variant="outline" onClick={async () => { await fetch('/api/assistant', { method: 'DELETE' }).catch(() => {}); location.reload(); }}>
              Start a fresh chat
            </Button>
          ) : (
            <Button variant="outline" onClick={() => (location.href = '/home')}>Go home</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
