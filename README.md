# Wealthwise — Track. Tag. Save.

AI-powered personal finance web app for India (₹), built from `docs/PRD.md`.
Log an expense in 5 seconds (form, one sentence, or voice — Hindi / English / Hinglish), tag whether you needed it,
see your avoidable spend, get a next-month forecast, ask questions about your own money, and earn coins for good habits.

## Demo account

| Email | Password |
|---|---|
| `demo@wealthwise.app` | `Demo@1234` |

Or tap **Try the demo account** on the landing page. The demo is "Priya Sharma", a Bengaluru professional with ~5 months of
realistic data (≈700 expenses, salary + freelance income, 7 recurring payments, budgets, 3 goal jars, a 39-day streak,
level 4 *Money Master*, 12 badges, an active *No Swiggy Week* challenge, a cool-off wishlist and a kirana list).
All of it was generated through the app's real coin / streak / savings / badge logic, so every number is consistent.
The demo refreshes itself when it is more than a day old, and **Settings → Reset demo data** rebuilds it any time.

## Run it locally (2 commands, no accounts needed)

Requires Node.js 20+.

```bash
npm install
npm run setup      # optional: creates .env.local with web-push keys
npm run dev        # http://localhost:3000
```

The first start creates an **embedded Postgres database** (PGlite) in `./.data/` — schema, reference data
(15 categories, ~600 Indian merchant keywords, badges, challenges, rewards) and the demo account. Nothing else to install.

* `npm run build && npm start` — production mode (faster)
* `npm test` — 48 unit tests (savings maths, coins, streaks, challenges, forecast, 20+ Hinglish sentences)
* `npm run e2e` — browser smoke test of the main flows (`npx playwright install chromium` first; app must be running)
* `npm run db:reset` — wipe the local database and rebuild everything
* `npm run typecheck`

## Turning on Claude (optional)

Everything works without an API key: categorisation uses user rules + the merchant dictionary, sentences/voice are parsed by
a built-in Hinglish parser, and Ask Wealthwise / insights / summaries use a deterministic engine over the same data tools.
Add a key from console.anthropic.com to `.env.local` to switch to Claude:

```
ANTHROPIC_API_KEY=sk-ant-...
```

| Job | Model |
|---|---|
| Category fallback, sentence/voice parsing (tool use, strict JSON schema, Zod-validated) | `claude-haiku-5-5` |
| Ask Wealthwise (streaming + 9 read-only tools), weekly insights, monthly summary, budget note, forecast explanation | `claude-sonnet-5-5` |
| Next-month forecast | no LLM — statistics in `lib/finance/forecast.ts` |

The model never does arithmetic: every number comes from SQL or `lib/finance`. Claude only ever receives the sentence being
parsed or aggregated, de-identified stats. If Claude fails, the app falls back to the built-in engine automatically.
Daily chat cap: `CHAT_DAILY_CAP` (default 30).

## What's built (PRD coverage)

**Auth & onboarding** — email + password sign-up/login, Google sign-in (set `GOOGLE_CLIENT_ID/SECRET`), forgot/reset password
(email via Resend if `RESEND_API_KEY`, otherwise the link is shown on screen), skippable 5-step onboarding (occupation, income,
payday, fixed costs → auto-recurring, first goal, spending personality, reminder time) ending with 50 welcome coins.

**Expense logging** — the 7 fields in PRD order; Form / Type / Speak tabs; live category chip with confidence as you type
(user rules → history → dictionary → Claude, cached per keyword); necessity pre-selected from history, merchant, late-night,
unusual-amount and payday signals (never auto-saved); default payment mode = most used; notes + mood; quick-add tiles;
multiple expenses per sentence; relative dates (aaj/kal/parso/last Sunday/15 tarikh) in IST; Hindi numbers (dhai sau, sawa lakh,
1.5k); missing fields highlighted; "Card — credit or debit?" clarification; original sentence stored; Web Speech API (en-IN / hi-IN)
with editable transcript; offline queue (IndexedDB) for form entries; learning loop (3 consistent corrections override the default).

**Transactions** — grouped by day with totals, search, filters (date presets/custom, category, necessity, mode, amount range),
edit/delete, swipe-to-edit on touch, bulk re-tag / move / delete, income log, recurring rules (daily/weekly/monthly/yearly,
auto-logged), CSV export.

**Home** — greeting, streak flame, coins, month ring vs budget, likely month-end, avoidable-this-week card, weekly target progress,
next-month forecast card, AI insight of the day, recent 5, quick-add, overspend warnings, payday-mode banner, streak-at-risk +
"No spend" button, cost-in-hours and opportunity-cost nudges (hidden for students / no income), upcoming festivals.

**Insights** — category donut, cumulative daily trend vs last month, necessity split, payment-mode split, month-over-month stacked
bars, weekday averages, what-if simulator; Prediction tab (total + per-category 80% ranges, drivers, festival effects, accuracy card
with backtested error, overspend early warnings); calendar heatmap (tap a day); Regret score; mood × spending and micro-spend
tracker (advanced analytics, unlocked in the store).

**Money logic** (`lib/finance`, pure + tested) — avoidable = Unnecessary + Neutral-cut% × Neutral (default 25%); weekly target =
min(cut% × avoidable, goal gap ÷ weeks left), cut starts at 30%, +10/week on success, capped (default 50%); week result moves the
saving into the chosen goal jar; forecast ladder (cold start → weighted average → regression with festival/seasonal/day-count
effects, range from past error spread); overspend projection with crossing date.

**Goals & budgets** — goal jars (add money, edit name/target/deadline, pick or unpick the weekly-savings jar), category budgets with 80%/100% alerts (70% in payday mode),
AI budget suggestion (50/30/20 adapted to tags), 24-hour / 7-day cool-off wishlist, festival & wedding-season planner, kirana list.

**Gamification** — every PRD coin rule with limits, append-only coin ledger (DB trigger blocks updates), streaks with freezes
(max 2), 5 levels, 14 badges, 7 challenges, rewards store (avatar frames, streak freeze, icon pack, advanced analytics),
anti-gaming (<₹1, >3 edits in 5 min → coins reversed, capped wishlist rewards).

**Ask Wealthwise** — pre-built questions chosen from your own data (only ones that have a real answer), free questions in
English/Hinglish about any period ("in September", "last 30 days"), category or shop ("Uber", "Netflix"), budgets, goals, savings,
forecasts, what-ifs and affordability; streamed answers with bold numbers, mini charts, follow-up chips, mic input,
financial-advice guardrail. Without an API key a built-in engine (`lib/ai/question.ts` + `ruleChat`) answers with exact SQL numbers,
free and unlimited; with `ANTHROPIC_API_KEY` Claude answers through the same tools (daily cap applies).

**Reports & weekly review** — monthly report page with AI 5-line summary (+30 coins on review), themed PDF download (built in the browser with pdf-lib, server fallback at `/api/reports/[month]/pdf`), share;
weekly review with 3 insights + 1 action, history of targets hit/missed.

**Notifications & jobs** — in-app notification centre + Web Push (service worker; VAPID keys are generated once and stored in the database unless set in env), with a test-notification button. Scheduled jobs (daily recurring +
challenges, 21:00 streak-at-risk, 22:00 budget check + early warnings, Sunday 23:00 weekly close + insights, 1st-of-month budget
coins + carry-forward + report) run via `/api/cron/*` **and** lazily whenever a user opens the app, so they work locally with no scheduler.

**Settings** — profile, occupation, income, payday, Neutral cut %, savings cap, default payment mode, reminder time, notifications,
push, light/dark/system mode with 3 free colour themes (Teal, Ocean, Violet), unlocked avatar frames, custom categories (emoji + colour), password, CSV export,
permanent account deletion (DPDP Act 2023).

**PWA** — manifest, icons, offline page, installable on Android/iOS. Mobile-first: bottom tab bar + centre "+" on phones,
sidebar on desktop, keyboard shortcut **N** to add an expense.

Not built (P2 in the PRD): split expenses with friends, Hindi UI, real-world partner rewards.

## Tech

Next.js 15 (App Router) + TypeScript · Tailwind CSS 4 with shadcn-style components (Radix) · Recharts · TanStack Query · Zod ·
Postgres (embedded PGlite locally, Supabase in production via `DATABASE_URL`) · bcrypt + signed JWT session cookies ·
Anthropic TypeScript SDK · pdf-lib (Inter font, OFL) · web-push · Vitest + Playwright.

> **Difference from the PRD:** the PRD names Supabase Auth and RLS policies on `auth.uid()`. This build uses its own auth so it
> runs locally with zero setup and on any host. All database access is server-side and every query is scoped to the signed-in
> user; RLS is **enabled on every table with no policies**, which on Supabase means the public anon/authenticated API can read
> nothing — the server (connecting as the database owner) is the only way in.

```
app/            pages (landing, /auth, /onboarding, /home, /transactions, /insights, /goals, /rewards, /reports/[month],
                /assistant, /settings, /weekly) and 49 API route handlers under app/api
components/     UI kit, app shell, AddExpense sheet, charts
lib/finance/    savings maths, coins, streaks, challenges, forecast, festival calendar (pure functions + tests)
lib/ai/         Claude client, Hinglish rule parser
lib/services/   DB-backed business logic (expenses, categorisation, gamification, jobs, assistant tools, reports …)
lib/db/         driver (PGlite / postgres.js) + schema (single source of truth)
lib/seed/       categories, merchant dictionary, badges/challenges/rewards, demo account generator
supabase/migrations/0001_init.sql   same schema for Supabase (regenerate with npm run db:sql)
tests/          Vitest unit tests        scripts/   setup, db reset, e2e
```

## Deploy (Vercel + Supabase) — free

The step-by-step, non-technical version is in the **Wealthwise Handbook**, section 10. In short:

1. **Supabase** → New project, region *South Asia (Mumbai)* (or any region — then set `regions` in `vercel.json` to the matching Vercel region, e.g. `bom1` for Mumbai, `icn1` for Seoul, so the app runs next to its database). Copy **Connect → Transaction pooler** URI and put your database password in it.
2. Put this code in a **GitHub** repository (private is fine).
3. **Vercel** → Add New → Project → import the repository. Before deploying, add environment variables:
   `DATABASE_URL` (required), `SUPPORT_EMAIL`, and optionally `GMAIL_USER` + `GMAIL_APP_PASSWORD`, `ANTHROPIC_API_KEY`.
4. Deploy. The app creates its own tables, reference data and secrets on first visit (no SQL to run), the demo account on the
   first "Try the demo", and `vercel.json` sets the function region and schedules the daily jobs. `/api/health` shows both regions and the database round-trip time.

What happens automatically on a hosted database: schema migrations (guarded by a Postgres advisory lock), session secret
generated and stored in the database, demo account built on demand with a lease lock, daily jobs via Vercel Cron
(`/api/cron/all` 00:05 IST, `/api/cron/notify` 21:00 and 22:00 IST). Rate limits and the AI spend cap are stored in Postgres,
so they hold across serverless instances. Works with any Postgres (Neon, RDS, self-hosted) via `DATABASE_URL`.

*Wealthwise gives spending insights, not investment, tax or financial advice.*
