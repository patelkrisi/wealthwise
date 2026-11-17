'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/client/api';
import { Button, Card, Input, Label } from '@/components/ui';

function Reset() {
  const sp = useSearchParams();
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="grid min-h-dvh place-items-center p-5">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              const r = await api<any>('/api/auth/reset', { body: { token: sp.get('token'), password: pw } });
              router.push(r.next);
            } catch (e: any) {
              setErr(e.message);
              setBusy(false);
            }
          }}
        >
          <div>
            <Label>New password</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
          </div>
          {err && <p className="text-sm text-bad">{err}</p>}
          <Button className="w-full" loading={busy}>Save password</Button>
        </form>
      </Card>
    </div>
  );
}
export default function Page() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}
