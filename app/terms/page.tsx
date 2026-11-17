import { LegalPage, supportEmail } from '@/components/legal';

export const metadata = { title: 'Terms of use · Wealthwise' };
export const dynamic = 'force-dynamic';

export default function Terms() {
  const email = supportEmail();
  return (
    <LegalPage title="Terms of use" updated="20/10/2026">
      <p>By creating an account or using Wealthwise you agree to these terms. They are written to be read.</p>
      <h2>The service</h2>
      <p>Wealthwise is a free personal spending tracker. It is provided “as is” while in early access; features may change, and there may be occasional downtime.</p>
      <h2>Your account</h2>
      <ul>
        <li>You must be at least 18, or use it with a parent’s or guardian’s permission.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>One person per account. Don’t misuse the service, try to access other people’s data, or overload it.</li>
      </ul>
      <h2>Your data</h2>
      <p>You own what you log. We use it only to run the service, as described in the <a href="/privacy">privacy policy</a>. You can export or delete it at any time.</p>
      <h2>No financial advice</h2>
      <p>Forecasts, savings targets, AI answers and other insights are estimates to help you reflect on spending. They are not investment, tax, loan or financial advice, and may be wrong. Make your own decisions.</p>
      <h2>Coins and rewards</h2>
      <p>Coins are a game inside the app. They have no money value, can’t be withdrawn or transferred, and may be adjusted if earned by abusing the rules.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, Wealthwise is not liable for losses arising from use of the app or reliance on its insights.</p>
      <h2>Changes and contact</h2>
      <p>We may update these terms and will show the new date above. Questions: {email ? <a href={`mailto:${email}`}>{email}</a> : 'the contact email shown in the app'}.</p>
    </LegalPage>
  );
}
