'use client';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: location.pathname, message: String(error?.message || error).slice(0, 500), stack: String(error?.stack || '').slice(0, 1500), digest: error?.digest }) }).catch(() => {});
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#f6f8f8', color: '#0f172a' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 32, margin: 0 }}>🛠️</p>
          <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>Your data is safe. Please try again.</p>
          <button onClick={() => reset()} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 12, border: 0, background: '#0f766e', color: '#fff', fontWeight: 600 }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
