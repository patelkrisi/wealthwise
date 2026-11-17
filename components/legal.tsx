import Link from 'next/link';
import { Logo } from './app-shell';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <Link href="/" className="mb-8 flex items-center gap-2"><Logo /> <span className="font-bold">Wealthwise</span></Link>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Last updated {updated}</p>
      <div className="prose-legal mt-6 space-y-4 text-[15px] leading-relaxed text-fg/90 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_a]:text-primary [&_a]:underline">{children}</div>
    </div>
  );
}

export const supportEmail = () => process.env.SUPPORT_EMAIL || process.env.GMAIL_USER || '';
