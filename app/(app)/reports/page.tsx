'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText } from 'lucide-react';
import { api } from '@/lib/client/api';
import { Card, Empty, PageHeader, Skeleton } from '@/components/ui';

export default function ReportsPage() {
  const { data } = useQuery<any[]>({ queryKey: ['reports'], queryFn: () => api('/api/reports') });
  return (
    <div>
      <PageHeader title="Monthly reports" subtitle="Spend, savings, goals, achievements and a 5-line summary — download as PDF" />
      {!data ? <Skeleton className="h-60" /> : data.length === 0 ? <Empty icon="📄" title="No reports yet">Your first report appears after you log some expenses.</Empty> : (
        <Card className="divide-y divide-border p-0">
          {data.map((m, i) => (
            <Link key={m.key} href={`/reports/${m.key}`} className="flex items-center gap-3 px-4 py-4 hover:bg-soft">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><FileText className="h-5 w-5" /></span>
              <span className="flex-1 font-medium">{m.label}{i === 0 && <span className="ml-2 text-xs text-muted">in progress</span>}</span>
              <ChevronRight className="h-4 w-4 text-muted" />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
