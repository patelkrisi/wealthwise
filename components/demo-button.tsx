'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui';
import { api } from '@/lib/client/api';

export function DemoButton({ className, variant = 'outline', size = 'lg', children }: { className?: string; variant?: any; size?: any; children?: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Button
      className={className}
      variant={variant}
      size={size}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api('/api/auth/demo', { method: 'POST' });
          router.push('/home');
          router.refresh();
        } catch (e: any) {
          toast.error(e.message);
          setBusy(false);
        }
      }}
    >
      {children ?? 'Try the demo account'}
    </Button>
  );
}
