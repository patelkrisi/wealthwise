import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getProfile } from '@/lib/services/profile';
import { runDueJobs } from '@/lib/services/jobs';
import { AppShell } from '@/components/app-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const p = await getProfile(u.id);
  if (!p.onboarded) redirect('/onboarding');
  // Recurring expenses, streak checks and reminders run after the page is sent, so they never slow navigation.
  after(() => runDueJobs(u.id));
  return (
    <AppShell profile={{ name: p.name, email: p.email, theme: p.theme, accent: p.accent, avatar_frame: p.avatar_frame, is_demo: p.is_demo }}>
      {children}
    </AppShell>
  );
}
