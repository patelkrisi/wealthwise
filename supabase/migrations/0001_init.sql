-- Wealthwise schema v1 (generated from lib/db/schema-sql.ts — edit that file, then run: npm run db:sql)


do $$ begin
  create type necessity as enum ('necessary','neutral','unnecessary');
exception when duplicate_object then null; end $$;
do $$ begin
  create type payment_mode as enum ('cash','upi','credit_card','debit_card','cheque','netbanking');
exception when duplicate_object then null; end $$;
do $$ begin
  create type entry_method as enum ('form','text','voice','recurring','quick');
exception when duplicate_object then null; end $$;

create table if not exists schema_meta (
  key text primary key,
  value text not null
);

-- ---------- auth ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
  google_id text unique,
  session_version int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists password_resets (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false
);

-- ---------- profile ----------
create table if not exists profiles (
  id uuid primary key references users(id) on delete cascade,
  name text not null default '',
  email text not null,
  occupation text,                       -- student | professional | self_employed | homemaker | other
  monthly_income_range text,             -- e.g. '50k-1L'
  monthly_income numeric(12,2),          -- midpoint/actual, used for cost-in-hours
  has_income boolean not null default false,
  payday int,                            -- day of month 1-31
  fixed_rent numeric(12,2) default 0,
  fixed_emi numeric(12,2) default 0,
  fixed_subscriptions numeric(12,2) default 0,
  spending_personality text,
  neutral_cut_pct int not null default 25,
  savings_cap_pct int not null default 50,
  default_payment_mode payment_mode,
  reminder_time text not null default '21:00',
  notifications_enabled boolean not null default true,
  theme text not null default 'system',          -- light | dark | system
  accent text not null default 'teal',           -- teal + purchasable themes
  avatar_frame text,
  advanced_analytics boolean not null default false,
  extra_icons boolean not null default false,
  level int not null default 1,
  coin_balance int not null default 0,
  lifetime_coins int not null default 0,
  onboarded boolean not null default false,
  weekly_goal_id uuid,
  chat_day date,
  chat_count int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- categories ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,  -- null = default
  name text not null,
  emoji text not null default '🏷️',
  colour text not null default '#64748b',
  is_default boolean not null default false,
  bucket text not null default 'want',  -- need | want | save (for 50/30/20)
  sort int not null default 100,
  created_at timestamptz not null default now()
);
create unique index if not exists categories_default_name on categories(name) where user_id is null;
create unique index if not exists categories_user_name on categories(user_id, name) where user_id is not null;

-- ---------- expenses ----------
create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  amount_inr numeric(12,2) not null check (amount_inr > 0),
  category_id uuid references categories(id) on delete set null,
  necessity necessity not null default 'necessary',
  payment_mode payment_mode not null default 'upi',
  frequency text not null default 'monthly' check (frequency in ('daily','weekly','monthly','yearly')),
  next_run date not null,
  anchor_day int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  spent_on date not null,
  name text not null,
  amount_inr numeric(12,2) not null check (amount_inr > 0),
  category_id uuid references categories(id) on delete set null,
  ai_category_id uuid references categories(id) on delete set null,
  ai_confidence real,
  necessity necessity,
  ai_necessity necessity,
  payment_mode payment_mode not null,
  notes text,
  mood text,
  entry_method entry_method not null default 'form',
  raw_input text,
  is_recurring boolean not null default false,
  recurring_id uuid references recurring_rules(id) on delete set null,
  edit_count int not null default 0,
  coins_revoked boolean not null default false,
  client_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists expenses_client_ref on expenses(user_id, client_ref) where client_ref is not null;
create index if not exists expenses_user_date on expenses(user_id, spent_on desc);
create index if not exists expenses_user_cat on expenses(user_id, category_id);

create table if not exists income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source text not null,
  kind text not null default 'salary',   -- salary | freelance | pocket_money | refund | other
  amount_inr numeric(12,2) not null check (amount_inr > 0),
  received_on date not null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists income_user_date on income(user_id, received_on desc);

-- ---------- budgets, goals, savings ----------
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  month date not null,                      -- first day of month
  limit_inr numeric(12,2) not null check (limit_inr > 0),
  unique (user_id, category_id, month)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  target_inr numeric(12,2) not null check (target_inr > 0),
  saved_inr numeric(12,2) not null default 0,
  deadline date,
  status text not null default 'active' check (status in ('active','completed','archived')),
  icon text not null default '🎯',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists weekly_savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_start date not null,                 -- Monday (IST)
  avoidable_inr numeric(12,2) not null default 0,
  prev_avoidable_inr numeric(12,2) not null default 0,
  target_inr numeric(12,2) not null default 0,
  achieved boolean,
  saved_inr numeric(12,2) not null default 0,
  cut_pct int not null default 30,
  goal_id uuid references goals(id) on delete set null,
  closed boolean not null default false,
  unique (user_id, week_start)
);

create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  month date not null,
  category_id uuid references categories(id) on delete cascade,  -- null = total
  predicted_inr numeric(12,2) not null,
  low_inr numeric(12,2) not null,
  high_inr numeric(12,2) not null,
  model_version text not null,
  drivers jsonb,
  created_at timestamptz not null default now()
);
create index if not exists predictions_user_month on predictions(user_id, month);

-- ---------- gamification ----------
create table if not exists coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  coins int not null,
  ref_id text,
  event_day date not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_user on coin_ledger(user_id, created_at desc);
create index if not exists coin_ledger_user_day on coin_ledger(user_id, event_day, event_type);

create or replace function coin_ledger_immutable() returns trigger as $$
begin
  raise exception 'coin_ledger is append-only';
end; $$ language plpgsql;
drop trigger if exists coin_ledger_no_update on coin_ledger;
create trigger coin_ledger_no_update before update on coin_ledger
  for each row execute function coin_ledger_immutable();

create table if not exists streaks (
  user_id uuid primary key references users(id) on delete cascade,
  current int not null default 0,
  longest int not null default 0,
  last_log_date date,
  freezes_held int not null default 0,
  had_break boolean not null default false
);

create table if not exists day_marks (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  kind text not null default 'no_spend',
  primary key (user_id, day)
);

create table if not exists activity_days (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  frozen boolean not null default false,
  primary key (user_id, day)
);

create table if not exists badges (
  id text primary key,
  name text not null,
  description text not null,
  emoji text not null,
  rule text not null,
  sort int not null default 100
);
create table if not exists user_badges (
  user_id uuid not null references users(id) on delete cascade,
  badge_id text not null references badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists challenges (
  id text primary key,
  name text not null,
  description text not null,
  emoji text not null,
  rule_json jsonb not null,
  reward int not null,
  duration_days int not null
);
create table if not exists user_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  challenge_id text not null references challenges(id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed','failed','abandoned')),
  progress int not null default 0,
  started_on date not null,
  ends_on date not null,
  completed_at timestamptz
);

create table if not exists rewards (
  id text primary key,
  name text not null,
  description text not null,
  emoji text not null,
  cost_coins int not null,
  type text not null,     -- theme | frame | freeze | icons | analytics | real_world
  value text,
  available boolean not null default true,
  sort int not null default 100
);
create table if not exists redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  reward_id text not null references rewards(id),
  redeemed_at timestamptz not null default now()
);

create table if not exists wishlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  item text not null,
  amount_inr numeric(12,2) not null check (amount_inr > 0),
  category_id uuid references categories(id) on delete set null,
  cool_off_until timestamptz not null,
  status text not null default 'waiting' check (status in ('waiting','bought','skipped')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- AI / learning ----------
create table if not exists merchant_dictionary (
  keyword text primary key,
  category_name text not null,
  default_necessity necessity
);

create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  keyword text not null,
  category_id uuid references categories(id) on delete cascade,
  category_hits int not null default 0,
  necessity necessity,
  necessity_hits int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, keyword)
);

create table if not exists ai_category_cache (
  keyword text primary key,
  category_name text not null,
  confidence real not null,
  created_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_user on chat_messages(user_id, created_at);

create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_start date not null,
  content jsonb not null,
  source text not null default 'rules',
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  month date not null,
  pdf_url text,
  summary_json jsonb,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

-- ---------- notifications ----------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  link text,
  dedupe_key text,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists job_runs (
  user_id uuid not null references users(id) on delete cascade,
  job text not null,
  period_key text not null,
  ran_at timestamptz not null default now(),
  primary key (user_id, job, period_key)
);

-- ---------- Indian context packs ----------
create table if not exists kirana_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  item text not null,
  qty text,
  est_inr numeric(12,2),
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
-- The app talks to Postgres only from server code (its own connection role),
-- and every query is scoped by the signed-in user's id.  RLS is enabled with no
-- policies so that, on Supabase, the public REST API (anon / authenticated keys)
-- can read nothing at all.
alter table users enable row level security;
alter table password_resets enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table recurring_rules enable row level security;
alter table expenses enable row level security;
alter table income enable row level security;
alter table budgets enable row level security;
alter table goals enable row level security;
alter table weekly_savings enable row level security;
alter table predictions enable row level security;
alter table coin_ledger enable row level security;
alter table streaks enable row level security;
alter table day_marks enable row level security;
alter table activity_days enable row level security;
alter table user_badges enable row level security;
alter table user_challenges enable row level security;
alter table redemptions enable row level security;
alter table wishlist enable row level security;
alter table category_rules enable row level security;
alter table chat_messages enable row level security;
alter table insights enable row level security;
alter table reports enable row level security;
alter table push_subscriptions enable row level security;
alter table notifications enable row level security;
alter table job_runs enable row level security;
alter table kirana_items enable row level security;
alter table badges enable row level security;
alter table challenges enable row level security;
alter table rewards enable row level security;
alter table merchant_dictionary enable row level security;
alter table ai_category_cache enable row level security;
alter table schema_meta enable row level security;

insert into schema_meta(key,value) values('version','1') on conflict(key) do update set value=excluded.value;
