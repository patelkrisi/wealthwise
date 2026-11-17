import { LegalPage, supportEmail } from '@/components/legal';
import { databaseRegion } from '@/lib/db';

export const metadata = { title: 'Privacy policy · Wealthwise' };
export const dynamic = 'force-dynamic';

export default function Privacy() {
  const email = supportEmail();
  const place = databaseRegion().place;
  return (
    <LegalPage title="Privacy policy" updated="01/11/2026">
      <p>Wealthwise helps you track and understand your own spending. This policy explains what we collect, why, and the choices you have, in line with India’s Digital Personal Data Protection Act, 2023 (DPDP Act).</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account details:</b> your name, email address and a scrambled (hashed) version of your password. We never see or store your actual password.</li>
        <li><b>What you choose to log:</b> expenses (date, name, amount, category, necessity tag, payment mode, notes, mood), income, budgets, goals, wishlist items and settings.</li>
        <li><b>Optional profile answers:</b> occupation, income range, payday and fixed costs — only if you fill them in.</li>
        <li><b>Basic technical data:</b> sign-in cookies and short-lived records used to stop abuse (for example, too many login attempts).</li>
      </ul>
      <p>We <b>never</b> ask for or store bank logins, card numbers, UPI PINs or OTPs. Wealthwise does not connect to your bank.</p>
      <h2>Why we use it</h2>
      <p>Only to run the app for you: to show your dashboard, charts and forecasts, calculate savings targets and coins, send reminders and summary emails you can turn off, and keep your account secure. We do not sell your data and we show no ads.</p>
      <h2>Voice and AI</h2>
      <ul>
        <li>Voice entry is turned into text <b>by your own browser</b>. We never receive or store audio.</li>
        <li>When AI features are switched on, the sentence you are logging — or anonymous totals with no names, emails or notes — may be sent to our AI provider (Anthropic, maker of Claude) to process that request. It is not used to identify you.</li>
      </ul>
      <h2>Where it is stored</h2>
      <p>Your data is stored in a secured database (Supabase{place ? `, hosted in ${place}` : ''}) and the app runs on Vercel{place ? ' in the same region' : ''}. Access from the internet is blocked at the database level; only the Wealthwise server can read it, and it only ever reads the signed-in person’s own data. Connections are encrypted.</p>
      <h2>Your rights</h2>
      <ul>
        <li><b>See and take your data:</b> Settings → Export all expenses (CSV).</li>
        <li><b>Correct it:</b> edit anything you logged, any time.</li>
        <li><b>Erase it:</b> Settings → Delete account removes your account and all your data permanently.</li>
        <li><b>Withdraw consent:</b> stop using the app and delete your account; turn off reminders and summary emails in Settings.</li>
      </ul>
      <h2>Contact & grievances</h2>
      <p>Questions or complaints about your data: {email ? <a href={`mailto:${email}`}>{email}</a> : 'the contact email shown in the app'}. We aim to reply within 7 days.</p>
      <h2>Not financial advice</h2>
      <p>Wealthwise gives spending insights only. It does not give investment, tax, loan or financial advice.</p>
    </LegalPage>
  );
}
