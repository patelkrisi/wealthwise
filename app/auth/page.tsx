import { Suspense } from 'react';
import { AuthForm } from './auth-form';

// Read the Google keys at request time, so adding them in Vercel takes effect on the next deploy without code changes.
export const dynamic = 'force-dynamic';

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm googleEnabled={!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />
    </Suspense>
  );
}
