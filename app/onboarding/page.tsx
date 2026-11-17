import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getProfile, INCOME_RANGES, OCCUPATIONS, PERSONALITIES } from '@/lib/services/profile';
import { Onboarding } from './onboarding';

export const dynamic = 'force-dynamic';
export default async function Page() {
  const u = await requireUser();
  const p = await getProfile(u.id);
  if (p.onboarded) redirect('/home');
  return <Onboarding name={p.name} occupations={OCCUPATIONS} incomes={INCOME_RANGES} personalities={PERSONALITIES} />;
}
