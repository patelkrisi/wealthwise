// Email sending. Free option: a Gmail account with an "App password" (GMAIL_USER + GMAIL_APP_PASSWORD, ~500 emails/day).
// Any SMTP server also works (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS). Resend (RESEND_API_KEY) is supported too.
import { inr } from './format';

export function emailConfigured() {
  return !!((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.SMTP_HOST || process.env.RESEND_API_KEY);
}

function fromAddress() {
  return process.env.EMAIL_FROM || (process.env.GMAIL_USER ? `Wealthwise <${process.env.GMAIL_USER}>` : 'Wealthwise <onboarding@resend.dev>');
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (process.env.RESEND_API_KEY && !process.env.GMAIL_USER && !process.env.SMTP_HOST) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromAddress(), to: [to], subject, html }),
      });
      return r.ok;
    }
    if (!emailConfigured()) return false;
    const nodemailer = (await import('nodemailer')).default;
    const transport = process.env.GMAIL_USER
      ? nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.GMAIL_USER, pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '') },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        })
      : nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });
    await transport.sendMail({ from: fromAddress(), to, subject, html });
    return true;
  } catch (e) {
    console.error('[email] failed:', (e as Error).message);
    return false;
  }
}

/** Simple branded HTML wrapper. */
export function emailLayout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f1a17">
  <div style="max-width:520px;margin:0 auto;padding:28px 20px">
    <div style="font-weight:700;font-size:18px;color:#0f766e;margin-bottom:16px">Wealthwise</div>
    <div style="background:#fff;border:1px solid #e3e8e4;border-radius:16px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
      <div style="font-size:15px;line-height:1.55;color:#33413d">${body}</div>
      ${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:18px;background:#0f766e;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600">${cta.label}</a>` : ''}
    </div>
    <p style="font-size:12px;color:#5f6f6a;margin-top:16px">Track. Tag. Save. · Spending insights, not investment, tax or financial advice. You can turn summary emails off in Settings.</p>
  </div></body></html>`;
}

export function weeklyEmailHtml(name: string, d: { avoidable: number; prev: number; target: number; achieved: boolean; saved: number; next: number }, url: string) {
  const body = d.achieved
    ? `Nice work, ${name}! Your avoidable spend fell from <b>${inr(d.prev)}</b> to <b>${inr(d.avoidable)}</b> — you saved <b>${inr(d.saved)}</b> and earned coins. Next week’s target: cut <b>${inr(d.next)}</b>.`
    : `Hi ${name}, last week’s avoidable spend was <b>${inr(d.avoidable)}</b> (target was a <b>${inr(d.target)}</b> cut from ${inr(d.prev)}). New week, fresh start — next target: <b>${inr(d.next)}</b>.`;
  return emailLayout('Your week is in 📊', body, { label: 'See your weekly review', url });
}
