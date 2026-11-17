// End-to-end smoke test (Playwright): sign-up → onboarding → Form & Type entry → transactions → demo login → Ask Wealthwise → PDF & CSV.
// Run with the app started (npm run dev or npm start):  npx playwright install chromium  &&  npm run e2e
import { chromium } from 'playwright';
import fs0 from 'node:fs'; fs0.mkdirSync('e2e-shots', { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${page.url()} ${e.message.slice(0, 300)}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 200)}`); });
page.on('response', (r) => { if (r.status() >= 500) errors.push(`[${r.status()}] ${r.url()}`); });
const shot = (n) => page.screenshot({ path: `e2e-shots/${n}.png` });
const log = (...a) => console.log('✓', ...a);

// sign up
const email = `test${Date.now()}@example.com`;
await page.goto(BASE + '/auth?mode=signup');
await page.fill('input[autocomplete=name]', 'Riya');
await page.fill('input[type=email]', email);
await page.fill('input[type=password]', 'Secret123');
await page.click('button[type=submit]');
await page.waitForURL('**/onboarding');
log('signup → onboarding');
await page.click('text=Salaried professional'); await page.click('text=Continue');
await page.click('text=₹50,000 – ₹1,00,000'); await page.fill('input[placeholder="e.g. 1"]', '1'); await page.click('text=Continue');
await page.locator('input[placeholder="0"]').first().fill('18000'); await page.click('text=Continue');
await page.click('text=Goa trip'); await page.click('text=Continue');
await shot('01-onboarding-last');
await page.click('text=Balanced'); await page.click('button:has-text("Finish")');
await page.waitForURL('**/home**');
await page.getByRole('dialog').waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await shot('02-home-new-user-addsheet');
log('onboarding done, add sheet auto-open');

// form entry
const dialog = page.getByRole('dialog');
await dialog.getByLabel('Expense name').fill('Swiggy biryani');
await dialog.getByLabel('Amount in rupees').fill('349');
await page.waitForTimeout(1500);
await shot('03-form-filled');
const catText = await dialog.locator('button[aria-expanded]').innerText();
log('live category:', catText.replace(/\n/g, ' '));
await dialog.getByRole('button', { name: /^Save( [0-9])? ·/ }).click();
await page.waitForTimeout(1500);
await shot('04-saved-toast');
log('form saved');

// Type tab
await page.locator('nav button[aria-label="Add expense"]').click();
await page.getByRole('tab', { name: /Type/ }).click();
await page.getByLabel('Expense sentence').fill('kal Rohit ke saath 250 ka chai samosa, UPI se aur 500 petrol cash');
await page.getByRole('button', { name: /Fill the form/ }).click();
await page.waitForSelector('text=Expense 2 of 2', { timeout: 15000 });
await shot('05-type-parsed');
log('type parsed into 2 rows');
await page.getByRole('dialog').getByRole('button', { name: /^Save( [0-9])? ·/ }).click();
await page.waitForTimeout(1500);

// speak tab render
await page.locator('nav button[aria-label="Add expense"]').click();
await page.getByRole('tab', { name: /Speak/ }).click();
await page.waitForTimeout(500);
await shot('06-speak');
await page.keyboard.press('Escape');

// transactions
await page.goto(BASE + '/transactions');
await page.getByRole('button', { name: 'Last 30 days' }).click(); // "kal" can fall in last month
await page.waitForSelector('text=Chai samosa');
await shot('07-transactions');
log('transactions shows parsed expense');

// demo login & assistant
await page.goto(BASE + '/auth');
await page.click('text=Explore the demo account');
await page.waitForURL('**/home');
await page.goto(BASE + '/assistant');
await page.waitForSelector('text=Where did I spend the most this month?');
for (const q of ['Where did I spend the most this month?', 'Can I afford a ₹15,000 phone next month?', 'Is mahine faltu kharcha kitna hua?']) {
  await page.getByRole('textbox', { name: 'Your question' }).fill(q);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(2500);
}
await shot('08-assistant');
const answers = await page.locator('.rounded-bl-md').allInnerTexts();
answers.forEach((a) => console.log('  🤖', a.replace(/\n/g, ' ').slice(0, 220)));

// reload keeps the chat (history renders without crashing)
await page.reload();
await page.waitForSelector('text=Is mahine faltu kharcha kitna hua?');
log('chat history reloads');

// goals: unselect the weekly jar, edit a target
await page.goto(BASE + '/goals');
await page.click('button[aria-label="Stop using this jar for weekly savings"]');
await page.waitForSelector('text=Weekly savings (auto)');
log('weekly jar unselected');
await page.locator('button[aria-label^="Edit "]').first().click();
await page.getByRole('dialog').locator('input[inputmode=numeric]').fill('60000');
await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
await page.waitForSelector('text=of ₹60,000');
log('goal target edited');

// themes apply in light and dark
await page.goto(BASE + '/settings');
for (const mode of ['Light', 'Dark']) {
  await page.getByRole('tab', { name: mode, exact: true }).click();
  await page.locator('button[aria-pressed]:has-text("Ocean")').click();
  await page.waitForTimeout(400);
  log(mode, 'ocean →', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()));
}
await page.locator('button[aria-pressed]:has-text("Teal")').click();
await page.getByRole('tab', { name: 'System', exact: true }).click();
const push = await (await page.request.get(BASE + '/api/push/subscribe')).json();
log('push key ready:', !!push.publicKey);

// regret explainer
await page.goto(BASE + '/insights?tab=regret');
await page.getByRole('tab', { name: /Regret/ }).click().catch(() => {});
await page.waitForSelector('text=Understanding your Regret score');
log('regret explainer shown');

// report PDF built in the browser
const months = await (await page.request.get(BASE + '/api/reports')).json();
await page.goto(BASE + '/reports/' + months[1].key);
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download PDF/ }).click()]);
log('browser pdf', dl.suggestedFilename());

// pdf (server link) + csv
const pdf = await page.request.get(BASE + '/api/reports/' + (await (await page.request.get(BASE + '/api/reports')).json())[1].key + '/pdf');
log('pdf', pdf.status(), pdf.headers()['content-type'], (await pdf.body()).length, 'bytes');
const fs = await import('node:fs'); fs.writeFileSync('e2e-shots/report.pdf', await pdf.body());
const csv = await page.request.get(BASE + '/api/export');
log('csv', csv.status(), (await csv.text()).split('\n').length, 'lines');
console.log(errors.length ? errors.join('\n') : 'NO ERRORS');
await browser.close();
