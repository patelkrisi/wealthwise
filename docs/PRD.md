# Table of Contents {#table-of-contents .TOC-Heading}

# 1. Overview

Wealthwise is an AI-powered personal finance web app for India that
turns 5-second expense logging into savings, through
auto-categorization, a necessary/unnecessary tag on every expense,
next-month spend prediction, and a coin-based gamification loop. All
amounts are in Indian Rupees (₹).

**One-line pitch:** Log what you spent, tag whether you needed it, and
Wealthwise shows how much you could have saved --- then rewards you for
actually saving it.

## Problem

-   Spending in India is fragmented across UPI, cards, wallets and cash,
    so most people don't know where their money went by the 20th of the
    month.
-   Existing trackers record spending but don't judge it. Knowing you
    spent ₹4,200 on food says nothing about whether ₹1,800 of it was
    avoidable.
-   Budgeting apps lose users within weeks because logging feels like a
    chore with no reward.

## Solution

-   **Fast logging, three ways:** fill a short form, type one sentence,
    or speak it --- in Hindi, English or Hinglish. AI fills the fields;
    the user confirms.
-   **Judgment layer:** the necessity tag turns raw spend into an
    "avoidable spend" figure, which drives weekly savings targets.
-   **Foresight:** a prediction model forecasts next month's spend by
    category, with festival and seasonal effects.
-   **Ask Wealthwise:** an AI chatbot answers questions about the user's
    own spending, with ready-made questions to tap.
-   **Motivation:** coins, streaks, badges, levels and redeemable
    rewards make the habit stick.

## Target users

  -----------------------------------------------------------------------
  **Persona**             **Profile**             **Main need**
  ----------------------- ----------------------- -----------------------
  Student (18--24)        Pocket money or         See where money leaks;
                          stipend,                build first saving
                          ₹5k--20k/month, heavy   habit
                          on food delivery and    
                          travel                  

  Young professional      First salary, rent,     Control impulse spend;
  (22--32)                EMIs, UPI everything    hit savings goals
                                                  (trip, phone, emergency
                                                  fund)

  Household manager       Manages family budget,  Track recurring and
                          groceries, bills        seasonal spend; plan
                                                  festivals
  -----------------------------------------------------------------------

## Goals and non-goals

-   **Goals:** daily logging habit; measurable reduction in unnecessary
    spend; accurate next-month forecast; a portfolio-grade AI +
    full-stack project.
-   **Non-goals for v1:** bank account linking, receipt scanning,
    statement import, investment advice, tax filing, multi-currency.

# 2. Core feature: expense logging

Every expense is captured in seven fields --- six required and one
optional --- in this order, and the whole entry should take under 5
seconds.

1.  **Date** (user selects) --- date picker, defaults to today;
    DD/MM/YYYY.
2.  **Expense name** (user types) --- e.g. "Swiggy biryani", "Ola to
    office", "Netflix".
3.  **Amount in ₹** (user types) --- numeric keypad, Indian digit
    grouping (₹1,25,000).
4.  **Category** (AI auto-fills, user can edit) --- predicted as the
    user types the name; shown as a chip with confidence. Tapping it
    opens the category picker.
5.  **Necessity tag** (user taps) --- Necessary / Neutral / Unnecessary.
    AI pre-selects a suggestion from the user's history, but the user
    always confirms.
6.  **Mode of payment** (user taps) --- Cash / UPI / Credit Card / Debit
    Card / Cheque / Netbanking. Defaults to the user's most-used mode.
7.  **Notes / Remarks** (optional) --- free text.

## Three ways to add an expense

The Add Expense sheet has three tabs. All three end on the same
seven-field form, pre-filled, so the user reviews and taps Save.

  -----------------------------------------------------------------------
  **Mode**                **How it works**        **Example**
  ----------------------- ----------------------- -----------------------
  Form                    User fills the seven    Pick date → type
                          fields directly         "Metro" → ₹40 →
                                                  Transport → Necessary →
                                                  UPI

  Type a sentence         User writes everything  "kal Rohit ke saath 250
                          in one sentence in      ka chai samosa, UPI se"
                          Hindi, English or       → Date: yesterday,
                          Hinglish; AI parses it  Name: Chai samosa,
                          and fills every field   Amount: ₹250, Category:
                          it can                  Food & Dining,
                                                  Necessity: Neutral
                                                  (suggested), Mode: UPI,
                                                  Notes: with Rohit

  Speak                   User taps the mic and   "Aaj Ola se office
                          speaks in Hindi,        gaya, 180 rupees, card
                          English or Hinglish;    se" → Date: today,
                          speech is transcribed   Name: Ola to office,
                          into the same           Amount: ₹180, Category:
                          one-sentence box        Transport, Mode: Debit
                          (editable), then parsed Card (asks Credit or
                          exactly like Type a     Debit if unclear)
                          sentence                
  -----------------------------------------------------------------------

Rules for the sentence and voice modes:

-   One sentence can hold several expenses ("200 chai aur 500 petrol");
    each becomes its own row for review.
-   Any field the AI can't find stays empty and is highlighted; the user
    fills it before saving. Nothing is saved without the user's tap.
-   Relative dates are resolved in IST: aaj/today, kal/yesterday (past
    tense), parso, "last Sunday".
-   Hindi numbers and shorthand are understood: "dhai sau" = 250, "1.5k"
    = 1,500, "sawa lakh" = 1,25,000.
-   The original sentence is stored with the expense, so later
    corrections teach the system.

## Default categories

Food & Dining, Groceries, Transport (local: auto, metro, cab, fuel),
Travel (trips, flights, trains, hotels), Shopping, Bills & Utilities
(electricity, mobile, internet, gas), Rent & Housing, Entertainment &
Subscriptions, Health & Medical, Education, Personal Care, Gifts &
Festivals, EMI & Loans, Investments & Savings, Others. Users can add
custom categories with an emoji and colour.

## Necessity tags

  -----------------------------------------------------------------------
  **Tag**           **Meaning**       **Example**       **Used in savings
                                                        logic**
  ----------------- ----------------- ----------------- -----------------
  Necessary         Must-have, hard   Rent, groceries,  Excluded from
                    to cut            medicine, office  savings target
                                      commute           

  Neutral           Reasonable but    Weekend movie,    User sets the %
                    flexible          mid-range dinner  counted as
                                                        cuttable in
                                                        Settings; 25% if
                                                        not set

  Unnecessary       Impulse or        Late-night        100% counted as
                    avoidable         delivery, unused  avoidable
                                      subscription      
  -----------------------------------------------------------------------

## Learning loop

-   Every category edit and necessity tag is stored as a labelled
    example for that user.
-   After 3 consistent corrections for a merchant or keyword ("Zomato" →
    Food, Unnecessary), the user-level rule overrides the global model.

## Quick-add favourites

One-tap tiles on Home for frequent expenses ("Metro ₹40", "Chai ₹20"),
built from the user's top repeated entries.

# 3. Feature set

Features are ranked P0 (MVP, must ship), P1 (v1.1, makes it stand out)
and P2 (later, stretch).

  ------------------------------------------------------------------------------
  **Module**        **Feature**       **What it does**         **Priority**
  ----------------- ----------------- ------------------------ -----------------
  Auth & onboarding Sign-up / login   Email + Google sign-in,  P0
                                      phone OTP optional       

  Auth & onboarding Onboarding quiz   Occupation, monthly      P0
                    (optional,        income range, fixed      
                    skippable)        costs (rent, EMIs),      
                                      first savings goal,      
                                      spending personality     

  Expense tracking  Smart expense log Date → Name → Amount →   P0
                                      AI category → Necessity  
                                      tag → Mode of payment →  
                                      Notes / Remarks          

  Expense tracking  Type-a-sentence   One sentence in          P0
                    entry             Hindi/English/Hinglish → 
                                      all fields filled for    
                                      review                   

  Expense tracking  Voice entry (mic) Speak in                 P0
                                      Hindi/English/Hinglish → 
                                      transcript → all fields  
                                      filled for review        

  Expense tracking  Edit, delete,     By date, category, tag,  P0
                    search, filter    payment mode, amount     
                                      range                    

  Expense tracking  Recurring         Rent, SIPs,              P0
                    expenses          subscriptions            
                                      auto-logged on schedule  

  Income            Income log        Salary, freelance,       P0
                                      pocket money, refunds    

  Budgets           Category budgets  Monthly limit per        P0
                                      category, 80% and 100%   
                                      alerts                   

  Budgets           Smart budget      AI proposes budgets from P1
                    suggestion        3 months of history      
                                      (e.g. 50/30/20 rule      
                                      adapted to tags)         

  Dashboard         Home overview     Month spend vs budget,   P0
                                      avoidable spend,         
                                      savings, streak, coin    
                                      balance                  

  Analytics         Charts            Category donut, daily    P0
                                      trend, necessary vs      
                                      unnecessary split,       
                                      payment-mode split,      
                                      month-over-month         

  Analytics         Spending heatmap  Calendar view coloured   P0
                                      by daily spend; spot     
                                      weekend and payday       
                                      spikes                   

  Prediction        Next-month        Total and per-category   P0
                    forecast          prediction with a range  

  Prediction        Festival-aware    Adjusts for Diwali,      P1
                    forecast          Holi, Raksha Bandhan,    
                                      wedding season, school   
                                      fees                     

  Prediction        Overspend early   "At this pace you'll     P0
                    warning           exceed your food budget  
                                      by ₹1,200 on the 24th"   

  Savings           Weekly            Sum of Unnecessary + X%  P0
                    avoidable-spend   of Neutral (user-set,    
                    report            default 25%) →           
                                      recommended savings      
                                      target                   

  Savings           Savings goals     Named goals with target  P0
                    (jars)            ₹ and date ("Goa trip    
                                      ₹25,000 by March")       

  Savings           No-spend days and "No Swiggy week",        P0
                    challenges        "₹500/day cap"           
                                      challenges               

  Gamification      Coins, streaks,   See section 4            P0
                    badges, levels                             

  AI assistant      "Ask Wealthwise"  Free questions plus      P0
                    chatbot           pre-built question chips 
                                      (section 5.6)            

  AI assistant      Weekly AI         3 plain-language         P0
                    insights          insights + 1 action      
                                      every Sunday             

  AI assistant      What-if simulator "If I cut food delivery  P0
                                      by half, I save ₹X per   
                                      week / month / year"     

  Reports           Monthly report    Downloadable PDF: spend, P0
                                      savings, goals,          
                                      achievements, AI summary 

  Social            Split expenses    Split with friends,      P2
                                      track who owes what      

  Notifications     Reminders         Daily log nudge at a     P0
                                      chosen time,             
                                      streak-at-risk alert,    
                                      budget alerts            

  Settings          Profile and       Neutral cut %, reminder  P0
                    preferences       time, default payment    
                                      mode, theme, data export 
                                      (CSV), delete account    
  ------------------------------------------------------------------------------

## New ideas that make Wealthwise different

-   **"Regret score":** a weekly 0--100 score of how much spend was
    tagged Unnecessary. Lower is better; it becomes the headline number
    users try to beat.
-   **Cost-in-hours:** shows each unnecessary expense as hours of work
    ("This ₹1,200 order = 4.5 hours of your salary"), using income from
    onboarding. Shown only to users who entered an income.
-   **Opportunity cost nudge:** "₹2,000/month of avoidable spend
    invested at 12% for 10 years ≈ ₹4.6 lakh" --- ties savings to
    long-term wealth. Not shown to students or users without an income.
-   **24-hour cool-off list:** users park wants ("new headphones
    ₹3,500") in a wishlist; if still wanted after 24 hours or 7 days,
    they buy. Skipped items earn coins and count as saved.
-   **Payday mode:** the first 3 days after salary get stricter alerts,
    since impulse spend peaks then. Not shown to students or users
    without an income.
-   **Mood tag (optional):** tag how you felt (bored, stressed,
    celebrating) to reveal emotional spending patterns.
-   **Indian context packs:** festival budget planner, wedding season
    planner, monthly kirana list, chai/auto micro-spend tracker.

# 4. Gamification engine

Coins reward behaviour (logging, saving, sticking to goals), never raw
spending amounts, so users with low incomes earn as fast as high
earners.

## Coin rules

  -----------------------------------------------------------------------
  **Action**              **Coins**               **Limit / condition**
  ----------------------- ----------------------- -----------------------
  Log an expense          2                       Max 20 coins/day from
                                                  logging

  Tag necessity on every  5                       Once per day
  expense of the day                              

  Daily logging streak    10                      Per day the streak
  (log at least 1 expense                         continues
  or mark "no spend")                             

  7-day streak bonus      50                      Every 7 consecutive
                                                  days

  30-day streak bonus     300                     Every 30 consecutive
                                                  days

  Hit weekly savings      100                     Once per week
  target                                          

  Beat weekly target by   +50                     Once per week
  20%+                                            

  Stay within a category  75 per category         Max 5 categories
  budget for the month                            

  Complete a savings goal 500                     Per goal

  Complete a challenge    150--400                Set per challenge
  (e.g. No Swiggy Week)                           

  Skip an item on the     25                      Per item
  cool-off wishlist                               

  Generate and review     30                      Once per month
  monthly report                                  
  -----------------------------------------------------------------------

## Streaks

-   A day counts if the user logs one expense or explicitly marks the
    day as "No spend".
-   **Streak freeze:** buy for 200 coins, protects one missed day; max 2
    held at once.
-   Streak-at-risk push notification at 9 pm IST if nothing is logged.

## Levels

  -----------------------------------------------------------------------
  **Level**               **Name**                **Lifetime coins**
  ----------------------- ----------------------- -----------------------
  1                       Paisa Starter           0

  2                       Budget Builder          500

  3                       Smart Saver             1,500

  4                       Money Master            4,000

  5                       Wealth Wizard           10,000
  -----------------------------------------------------------------------

## Badges (examples)

First Log, 7-Day Streak, 30-Day Streak, 100 Expenses, Zero Regret Week
(no Unnecessary spend), Budget Ninja (all budgets met), Goal Getter
(first goal completed), Early Bird (logged before 10 am for 7 days),
Comeback Kid (restarted a streak after a break), Voice Logger (10
expenses logged by voice).

## Rewards store

-   **In-app (v1):** app themes, avatar frames, streak freezes, custom
    category icons, unlocking advanced analytics.
-   **Real-world (later):** partner coupons and cashback vouchers,
    donated-meal or tree-planting rewards.
-   Coins are not money and cannot be withdrawn; the store shows coin
    prices only.

## Anti-gaming rules

-   Expenses under ₹1 or edited more than 3 times within 5 minutes earn
    no coins.
-   Savings rewards are computed on the weekly avoidable-spend figure,
    so deleting expenses after the week closes does not change awarded
    coins.
-   All coin events are written to an immutable ledger table for
    auditability.

# 5. AI and ML design

All AI in the app runs on Claude through the Claude API, plus plain
statistics for forecasting. Two Claude models are used: a fast one for
small, frequent jobs and a stronger one for reasoning and conversation.

  -----------------------------------------------------------------------
  **Job**                 **Model**               **Why**
  ----------------------- ----------------------- -----------------------
  Category fallback,      Claude Haiku 5.5        Fast and low-cost; runs
  sentence / voice        (`claude-haiku-5-5`)    on almost every entry
  parsing, necessity hint                         

  Ask Wealthwise chatbot, Claude Sonnet 5.5       Better reasoning and
  weekly insights,        (`claude-sonnet-5-5`)   tool use; runs a few
  monthly report summary,                         times a day per user
  budget suggestions                              

  Next-month forecast     No LLM --- statistics   Numbers must be exact
                          in code                 and reproducible
  -----------------------------------------------------------------------

The app calls the Claude API with its own API key, created in the Claude
Console and billed by usage. The key lives only on the server, never in
the browser.

## 5.1 Auto-categorization

A three-tier cascade, fastest first, returning `{category, confidence}`:

1.  **User rules:** exact or fuzzy match on the user's own past
    corrections ("Rapido" → Transport).
2.  **Merchant/keyword dictionary:** \~500 Indian merchants and keywords
    (Swiggy, Zomato, Blinkit, Zepto, Ola, Uber, Rapido, IRCTC, Jio,
    Airtel, BESCOM, DMart, Myntra, Nykaa, Apollo, PharmEasy...), stored
    as a seed table.
3.  **Claude Haiku fallback:** if tiers 1--2 miss, send the expense name
    and the category list; Claude returns one category and a confidence.
    Results are cached per keyword.

Target: ≥ 90% top-1 accuracy after the user's first 2 weeks; tiers 1--2
respond in \< 50 ms, tier 3 in \< 1.5 s.

## 5.2 Sentence and voice parsing

-   **Speech-to-text:** the browser's built-in speech recognition (Web
    Speech API) with language set to Hindi (India) or English (India);
    the user can switch. The transcript appears in the sentence box and
    can be edited before parsing. If a browser doesn't support it, the
    mic button hides and the user types instead. A dedicated
    Indian-language speech service is a P1 upgrade if accuracy on
    Hinglish is poor.
-   **Parser:** the sentence goes to Claude Haiku with today's date
    (IST), the category list, the payment modes and the user's top
    merchants. Claude returns structured JSON only, using tool use with
    a fixed schema:

```{=html}
<!-- -->
```
    {
      "expenses": [
        {
          "date": "YYYY-MM-DD | null",
          "name": "string | null",
          "amount_inr": "number | null",
          "category": "one of the category list | null",
          "necessity_suggestion": "necessary | neutral | unnecessary | null",
          "payment_mode": "cash | upi | credit_card | debit_card | cheque | netbanking | null",
          "notes": "string | null",
          "confidence": "0-1"
        }
      ],
      "clarifications": ["e.g. 'Card — credit or debit?'"]
    }

-   Null means "not found"; the form highlights it. Claude never invents
    an amount or date.
-   The server validates the JSON (types, amount \> 0, date not in the
    future) before filling the form.

## 5.3 Necessity suggestion

-   Pre-selects a tag from the user's history for the same
    merchant/category, with a global default per category (Rent →
    Necessary, Food delivery → Unnecessary-leaning).
-   Signals: category, amount vs that user's median for the category,
    time of day (late-night spikes), day of week, payday proximity.
-   The user always confirms; the suggestion is never auto-saved
    silently.

## 5.4 Next-month expense prediction

**Inputs:** daily totals per category, necessity mix, recurring
expenses, income, Indian festival calendar, month-of-year.

**Model ladder (all in TypeScript on the server, no separate ML service
in v1):**

1.  **Cold start (\< 1 month data):** onboarding fixed costs + persona
    averages.
2.  **1--3 months:** weighted moving average per category (recent months
    weighted higher) + known recurring items.
3.  **3+ months:** per-category regression on the last 1/2/3 months,
    same month last year, a festival flag and days in month; range from
    the spread of past errors.
4.  **Output:** predicted total and per-category ₹ with an 80% range
    ("₹18,400, likely between ₹16,900 and ₹20,100"), plus the top 3
    drivers. Claude Sonnet writes the one-line explanation from these
    numbers; it never changes them.

**Evaluation:** MAPE per category on a rolling backtest; show users a
"last month we predicted ₹X, you spent ₹Y" accuracy card to build trust.
A Python service with Prophet or LightGBM is a P2 upgrade once there is
enough data.

## 5.5 Savings logic

**Avoidable spend (week)** = Σ Unnecessary + (Neutral cut % ÷ 100) × Σ
Neutral, where Neutral cut % is set by the user (default 25%).

**Next week's target** = min( 0.5 × Avoidable spend this week , Goal gap
÷ weeks left )

-   Target is capped at a realistic 50% cut so users aren't set up to
    fail, and raised gradually (+10%/week) when they keep hitting it.
-   Weekly result = Avoidable last week − Avoidable this week; meeting
    the target awards coins and moves the saved ₹ into a chosen goal jar
    (virtually).
-   Neutral cut % and the 50% cap are stored per user and editable in
    Settings.

## 5.6 Ask Wealthwise chatbot

A chat screen where the user asks about their own money in Hindi,
English or Hinglish. Claude Sonnet answers using read-only tools that
query the database; the model never does arithmetic itself --- tools
return every number.

**Pre-built question chips** (tap to ask; the set shown changes with the
user's data):

1.  Where did I spend the most this month?
2.  How much did I spend on food delivery this week?
3.  How much of my spending was unnecessary this month?
4.  Am I on track for my savings goal?
5.  Which budget am I closest to crossing?
6.  Compare this month with last month.
7.  What will I probably spend next month?
8.  If I cut Unnecessary spend by half, how much would I save in a year?
9.  Can I afford a ₹15,000 phone next month?
10. How much did I pay by UPI vs cash this month?
11. What are my recurring expenses?
12. Give me 3 tips to save more this week.

**Tools available to the chatbot:**

  -----------------------------------------------------------------------
  **Tool**                            **Returns**
  ----------------------------------- -----------------------------------
  get_spend(period, category?,        Total ₹ and count
  necessity?, payment_mode?)          

  get_breakdown(period, by)           Totals grouped by category,
                                      necessity, payment mode or day

  compare_periods(period_a, period_b) Totals and % change

  get_budget_status(month)            Each budget's limit, spent, % used

  get_goals()                         Goals with target, saved, deadline,
                                      needed per week

  get_forecast(month)                 Predicted total and range per
                                      category

  get_recurring()                     Recurring rules and monthly total

  simulate_cut(category or necessity, ₹ saved per week / month / year
  pct, horizon)                       

  check_affordability(amount, month)  Forecast spend + goal needs vs
                                      income; yes / tight / no with
                                      reasons
  -----------------------------------------------------------------------

**Guardrails:** no investment, tax or loan recommendations; a short
disclaimer on financial-advice questions; answers only about the user's
own data; replies in the language the user wrote in; keeps answers under
120 words with the numbers in bold.

## 5.7 Weekly insights and monthly summary

-   **Weekly insights (Sunday):** Claude Sonnet receives aggregated,
    de-identified stats (no names, no raw notes) and returns 3
    insights + 1 action as JSON.
-   **Monthly report summary (1st):** a 5-line plain-language summary
    for the PDF.

# 6. App flow and screens

The app has 12 screens around one hub: the Home dashboard, from which a
single + button opens the Add Expense sheet with its Form, Type and
Speak tabs.

## Core user journey

1.  **Onboarding:** Landing page → Sign up / Login → Onboarding quiz
    (optional, skippable) → Home dashboard
2.  **Daily log (from Home, tap +):** choose Form, Type or Speak → Date
    → Expense name → Amount → AI picks category (user can edit) →
    Necessity tag → Mode of payment → Notes / Remarks (optional) → Save
3.  **Reward loop:** Saved, +2 coins (streak updated) → Sunday savings
    job (target met or missed) → Coins and badges → Rewards store → back
    to Home

The log loops daily: each save updates the streak, the Sunday job turns
avoidable spend into a savings result, and coins flow to the rewards
store before the user returns Home.

## Navigation

Bottom tab bar on mobile, left sidebar on desktop: **Home · Transactions
· + Add · Insights · Ask Wealthwise**. Rewards, Goals, Reports and
Settings sit under the profile avatar (top right); the coin balance on
Home also opens Rewards.

## Screens

  -----------------------------------------------------------------------------
  **\#**            **Screen**        **Route**            **Key components**
  ----------------- ----------------- -------------------- --------------------
  1                 Landing           /                    Hero ("Track. Tag.
                                                           Save."), feature
                                                           cards, demo GIF, Get
                                                           started CTA

  2                 Sign up / Login   /auth                Email + password,
                                                           Google button,
                                                           forgot password

  3                 Onboarding        /onboarding          Occupation, monthly
                    (optional)                             income range, fixed
                                                           costs (rent, EMIs,
                                                           subscriptions),
                                                           first savings goal,
                                                           daily reminder time;
                                                           Skip on every step;
                                                           ends with 50 welcome
                                                           coins

  4                 Home dashboard    /home                Greeting + streak
                                                           flame + coin
                                                           balance; month spend
                                                           vs budget ring;
                                                           "Avoidable this week
                                                           ₹X" card; weekly
                                                           savings target
                                                           progress; next-month
                                                           prediction card; AI
                                                           insight of the day;
                                                           recent 5 expenses;
                                                           quick-add tiles

  5                 Add expense       modal                Tabs: Form / Type /
                    (bottom sheet)                         Speak. Form: Date →
                                                           Name with live
                                                           category chip → ₹
                                                           amount keypad →
                                                           category chip (tap
                                                           to change) →
                                                           Necessary / Neutral
                                                           / Unnecessary →
                                                           payment mode chips →
                                                           notes → Save with
                                                           +coins animation.
                                                           Type: one sentence
                                                           box → Fill →
                                                           pre-filled form.
                                                           Speak: mic button
                                                           with live transcript
                                                           → Fill → pre-filled
                                                           form

  6                 Transactions      /transactions        Grouped by day with
                                                           daily totals;
                                                           columns Date · Name
                                                           · Amount · Category
                                                           · Necessity · Mode ·
                                                           Notes; search;
                                                           filters (date,
                                                           category, tag,
                                                           mode); swipe to
                                                           edit/delete; bulk
                                                           re-tag

  7                 Insights          /insights            Tabs: Overview
                                                           (category donut,
                                                           daily trend,
                                                           necessary vs
                                                           unnecessary split,
                                                           payment-mode split,
                                                           month-over-month),
                                                           Prediction
                                                           (next-month total
                                                           and per category
                                                           with range, accuracy
                                                           card, overspend
                                                           warnings), Heatmap,
                                                           Regret score

  8                 Goals and budgets /goals               Goal jars with
                                                           progress, add goal,
                                                           category budgets
                                                           with progress bars,
                                                           AI budget
                                                           suggestion, cool-off
                                                           wishlist

  9                 Rewards           /rewards             Level and progress
                                                           bar, streak
                                                           calendar, badges
                                                           grid
                                                           (earned/locked),
                                                           active challenges,
                                                           rewards store, coin
                                                           history ledger

  10                Monthly report    /reports/\[month\]   Summary stats,
                                                           charts, goals hit,
                                                           badges earned, AI
                                                           summary, Download
                                                           PDF and Share card

  11                Ask Wealthwise    /assistant           Pre-built question
                                                           chips, chat box with
                                                           mic, answers with
                                                           numbers in bold and
                                                           mini charts

  12                Profile and       /settings            Profile, occupation,
                    settings                               income, Neutral cut
                                                           %, default payment
                                                           mode, reminder time,
                                                           categories manager,
                                                           theme,
                                                           notifications,
                                                           export CSV, delete
                                                           account
  -----------------------------------------------------------------------------

## Key flows

1.  **First-time user:** Landing → Sign up → Onboarding (or Skip) → Home
    with a guided tour → prompt to log first expense → First Log badge.
2.  **Daily log (form):** notification or open app → + → Form → date →
    name → amount → confirm category → tag → payment mode → notes
    (optional) → Save → coins + streak animation → back to Home.
3.  **Daily log (sentence or voice):** + → Type or Speak → one sentence
    → Fill → review the pre-filled form, fix any highlighted field →
    Save.
4.  **Ask a question:** Ask Wealthwise → tap a question chip or type /
    speak → answer with numbers → follow-up chips.
5.  **Weekly review (Sunday):** push "Your week is in" → Weekly summary
    screen: avoidable spend, target hit or missed, coins earned, next
    week's target → optional challenge to join.
6.  **Monthly:** 1st of month push → Monthly report → download/share →
    forecast for the new month → adjust budgets.
7.  **Redeem:** Rewards → Store → pick item → confirm coin spend →
    applied (theme, streak freeze, badge frame).
8.  **Overspend alert:** budget hits 80% → push + Home banner → tap →
    category detail with suggestions.

# 7. Tech stack, data model and API

One TypeScript codebase on Next.js, with Supabase as the database and
auth, deployed on Vercel. It was chosen so one person can build, run and
fix the whole app in one repository: one language, managed database and
hosting, generous free tiers, and no servers to maintain.

## Tech stack

  -----------------------------------------------------------------------
  **Layer**               **Choice**              **Why**
  ----------------------- ----------------------- -----------------------
  Framework               Next.js (App Router) +  Front end and back end
                          TypeScript              (route handlers, server
                                                  actions) in one project

  UI                      Tailwind CSS +          Clean, accessible
                          shadcn/ui components,   components; quick to
                          lucide icons            build and restyle
                                                  

  Charts                  Recharts                Donut, line, bar and
                                                  heatmap with little
                                                  code

  Forms and validation    React Hook Form + Zod   One schema validates
                                                  the form, the AI parser
                                                  output and the API

  Data fetching           TanStack Query          Caching and instant
                                                  (optimistic) saves for
                                                  5-second logging

  Database                Supabase Postgres       Relational data, SQL
                                                  views for analytics,
                                                  row-level security per
                                                  user

  Auth                    Supabase Auth (email +  Built-in sessions;
                          Google)                 works directly with
                                                  row-level security

  Database access         Supabase JS client +    Type-safe queries
                          generated TypeScript    
                          types                   

  AI                      Claude API via the      Parsing,
                          official Anthropic      categorization, chatbot
                          TypeScript SDK; Haiku   with tool use, insights
                          5.5 and Sonnet 5.5      

  Speech-to-text          Browser Web Speech API  Free, no extra service;
                          (hi-IN, en-IN)          transcript is editable

  Scheduled jobs          Supabase Cron (pg_cron) Weekly savings,
                          calling Supabase Edge   streaks, recurring
                          Functions               expenses, reports

  Notifications           Web Push (service       Works on installed PWA;
                          worker) + email for     no app store needed
                          weekly/monthly          
                          summaries               

  PDF reports             pdf-lib (in the browser) on Monthly report download
                          the server              

  PWA                     Web app manifest +      Installable; logs
                          service worker; offline offline and syncs later
                          queue in IndexedDB      

  Testing                 Vitest (logic) +        Coin rules, savings
                          Playwright (key flows)  maths and the
                                                  add-expense flow stay
                                                  correct

  Hosting                 Vercel (app) + Supabase Push to GitHub →
                          (database, auth,        automatic deploy with
                          functions, cron)        preview links

  Monitoring              Vercel Analytics +      See slow pages and
                          Sentry (errors)         crashes
  -----------------------------------------------------------------------

**Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server
only), `ANTHROPIC_API_KEY` (server only), `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` (web push).

**Folder structure:**

    wealthwise/
      app/                 pages and route handlers (/home, /transactions, /api/...)
      components/          UI components (AddExpenseSheet, CategoryChip, ...)
      lib/
        ai/                Claude client, prompts, tool definitions, parser schema
        finance/           savings maths, forecast, coin rules (pure functions + tests)
        db/                Supabase client and typed queries
      supabase/
        migrations/        SQL tables, enums, RLS policies, views
        functions/         Edge Functions for scheduled jobs
        seed.sql           categories, merchant dictionary, badges, rewards
      public/              manifest, icons, service worker

## Data model (Postgres)

  -----------------------------------------------------------------------
  **Table**                           **Key columns**
  ----------------------------------- -----------------------------------
  profiles                            id (= auth user), name, email,
                                      occupation, monthly_income_range,
                                      has_income (bool), payday,
                                      neutral_cut_pct (default 25),
                                      savings_cap_pct (default 50),
                                      default_payment_mode,
                                      reminder_time, level, coin_balance,
                                      created_at

  categories                          id, user_id (null = default), name,
                                      emoji, colour, is_default

  expenses                            id, user_id, spent_on (date), name,
                                      amount_inr (numeric 12,2),
                                      category_id, ai_category_id,
                                      ai_confidence, necessity (enum:
                                      necessary / neutral / unnecessary),
                                      payment_mode (enum: cash / upi /
                                      credit_card / debit_card / cheque /
                                      netbanking), notes, mood,
                                      entry_method (enum: form / text /
                                      voice), raw_input (original
                                      sentence), is_recurring,
                                      recurring_id, created_at

  income                              id, user_id, source, amount_inr,
                                      received_on

  recurring_rules                     id, user_id, name, amount_inr,
                                      category_id, necessity,
                                      payment_mode, frequency, next_run

  budgets                             id, user_id, category_id, month,
                                      limit_inr

  goals                               id, user_id, name, target_inr,
                                      saved_inr, deadline, status, icon

  weekly_savings                      id, user_id, week_start,
                                      avoidable_inr, target_inr, achieved
                                      (bool), saved_inr

  predictions                         id, user_id, month, category_id
                                      (null = total), predicted_inr,
                                      low_inr, high_inr, model_version

  coin_ledger                         id, user_id, event_type, coins,
                                      ref_id, created_at (append-only)

  streaks                             user_id, current, longest,
                                      last_log_date, freezes_held

  badges / user_badges                badge id, name, rule; user_id,
                                      badge_id, earned_at

  challenges / user_challenges        id, name, rule_json, reward;
                                      user_id, challenge_id, status,
                                      progress

  rewards / redemptions               id, name, cost_coins, type;
                                      user_id, reward_id, redeemed_at

  wishlist                            id, user_id, item, amount_inr,
                                      cool_off_until, status (bought /
                                      skipped)

  merchant_dictionary                 keyword, category_id,
                                      default_necessity

  category_rules                      user_id, keyword, category_id,
                                      necessity, hits

  chat_messages                       id, user_id, role, content,
                                      created_at

  push_subscriptions                  id, user_id, endpoint, keys,
                                      created_at

  reports                             id, user_id, month, pdf_url,
                                      summary_json
  -----------------------------------------------------------------------

All user tables have row-level security: `user_id = auth.uid()`. The
coin ledger accepts inserts only from server code.

## Core API endpoints

  -------------------------------------------------------------------------------------------------
  **Method**              **Endpoint**                                      **Purpose**
  ----------------------- ------------------------------------------------- -----------------------
  POST                    /api/ai/categorize                                {name, amount} →
                                                                            {category, confidence,
                                                                            necessity_suggestion}

  POST                    /api/ai/parse                                     {text, language} → list
                                                                            of pre-filled
                                                                            expenses +
                                                                            clarifications (used by
                                                                            Type and Speak)

  POST                    /api/expenses                                     Create one or more
                                                                            expenses; awards coins
                                                                            and updates the streak

  GET                     /api/expenses?from&to&category&necessity&mode&q   List, search and filter

  PATCH / DELETE          /api/expenses/\[id\]                              Edit (stores correction
                                                                            for learning) / delete

  GET                     /api/dashboard?month                              Totals, budget status,
                                                                            avoidable spend,
                                                                            streak, coins, forecast
                                                                            card

  GET                     /api/analytics/\[breakdown, trend, heatmap,       Chart data
                          modes\]                                           

  GET                     /api/forecast?month                               Predicted total + per
                                                                            category with range

  GET                     /api/savings/weekly                               Avoidable spend,
                                                                            target, result

  CRUD                    /api/budgets, /api/goals, /api/income,            Standard resources
                          /api/recurring, /api/wishlist                     

  GET / POST              /api/gamification/\[status, badges, challenges,   Coins, level, store
                          redeem\]                                          

  POST                    /api/assistant                                    Ask Wealthwise; streams
                                                                            Claude's answer; runs
                                                                            tools on the server

  GET                     /api/assistant/suggestions                        Pre-built question
                                                                            chips for this user

  POST                    /api/reports/\[month\]                            Generate PDF and AI
                                                                            summary

  POST                    /api/push/subscribe                               Save a web-push
                                                                            subscription
  -------------------------------------------------------------------------------------------------

## Scheduled jobs (all times IST)

  -----------------------------------------------------------------------
  **When**                            **Job**
  ----------------------------------- -----------------------------------
  Daily 00:05                         Close the day: update streaks,
                                      apply streak freezes, create
                                      today's recurring expenses

  Daily at each user's reminder time  Log-reminder push

  Daily 21:00                         Streak-at-risk push if nothing
                                      logged today

  Daily 22:00                         Budget check: 80% / 100% alerts and
                                      overspend early warnings

  Sunday 23:00                        Weekly savings: avoidable spend,
                                      coins, next week's target, 3 AI
                                      insights

  1st of month 06:00                  Budget coins, new forecasts,
                                      monthly report PDF + AI summary
  -----------------------------------------------------------------------

# 8. Requirements, metrics, roadmap and build plan

## Non-functional requirements

-   **Speed:** add-expense to saved \< 1 s; dashboard load \< 2 s on 4G;
    sentence/voice parse \< 2 s.
-   **Mobile-first:** responsive PWA, installable on Android/iOS home
    screen, works on 360 px screens.
-   **Offline:** expenses logged offline queue locally and sync when
    online (Type and Speak need a connection).
-   **Localisation:** ₹ with Indian grouping (1,00,000), DD/MM/YYYY
    dates, IST everywhere, English first, Hindi UI in P2.
-   **Accessibility:** WCAG AA contrast, keyboard navigable,
    screen-reader labels on charts.
-   **AI cost control:** Haiku for every-entry jobs, Sonnet only for
    chat and summaries; cache category results per keyword; limit chat
    to a daily message cap per user.

## Security and privacy

-   Supabase RLS on every table; no user can read another user's rows.
-   No bank credentials are ever collected.
-   API keys stay on the server; the browser never sees the Claude key
    or the Supabase service key.
-   Only the minimum needed is sent to Claude: the sentence being
    parsed, or aggregated, de-identified stats for insights; no names or
    emails.
-   Voice is transcribed in the browser; audio is not stored.
-   Data export (CSV) and permanent account deletion in Settings, in
    line with India's DPDP Act 2023.
-   Clear disclaimer: Wealthwise gives spending insights, not
    investment, tax or financial advice.

## Success metrics

  -----------------------------------------------------------------------
  **Metric**                          **Target (first 3 months)**
  ----------------------------------- -----------------------------------
  Day-7 retention                     ≥ 40%

  Day-30 retention                    ≥ 20%

  Avg expenses logged / active user / ≥ 10
  week                                

  Users with 7+ day streak            ≥ 30% of actives

  Category auto-accept rate (no edit) ≥ 85%

  Sentence / voice entries saved      ≥ 70%
  without edits                       

  Forecast error (MAPE, total)        ≤ 15%

  Reduction in Unnecessary spend      ≥ 15% vs week 1
  after 4 weeks                       

  Weekly savings target hit rate      ≥ 50%
  -----------------------------------------------------------------------

## Roadmap

1.  **Phase 1 --- Foundation (week 1):** repo, Supabase project, tables,
    RLS, seed data, auth, onboarding, app shell and navigation.
2.  **Phase 2 --- Logging (week 2):** Form entry with all seven fields,
    keyword categorizer, necessity tags, Transactions screen, recurring
    expenses, income.
3.  **Phase 3 --- AI entry (week 3):** Claude categorization fallback,
    Type-a-sentence parser, Speak with Web Speech API, learning loop.
4.  **Phase 4 --- Insights and money logic (week 4):** dashboard,
    charts, heatmap, budgets and alerts, savings logic, goals, forecast.
5.  **Phase 5 --- Engagement (week 5):** coins, streaks, badges, levels,
    challenges, rewards store, cool-off wishlist, notifications.
6.  **Phase 6 --- Ask Wealthwise and reports (week 6):** chatbot with
    tools and question chips, weekly insights, what-if simulator,
    monthly PDF.
7.  **Phase 7 --- Polish and launch (week 7):** PWA and offline, tests,
    performance, accessibility, error monitoring, production deploy.

## Open questions

-   Will rewards include real partner coupons in v1, or in-app items
    only?
-   What monthly budget for Claude API usage, and what daily chat cap
    per user?
-   Is browser speech recognition accurate enough on Hinglish, or should
    a dedicated Indian-language speech service come in v1?
