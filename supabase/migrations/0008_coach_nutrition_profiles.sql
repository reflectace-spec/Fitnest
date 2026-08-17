-- Build 2.4: named nutrition profiles, flexible meal timing, food budget and coach insights.

create table if not exists public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  diet_style text not null default 'omnivore' check (diet_style in ('omnivore','vegetarian','vegan')),
  allergies text[] not null default '{}',
  dislikes text[] not null default '{}',
  calories integer not null check (calories between 1000 and 6000),
  protein_g integer not null check (protein_g between 20 and 400),
  eating_pattern text not null default 'regular' check (eating_pattern in ('regular','time_restricted','omad','custom')),
  meals_per_day smallint not null default 4 check (meals_per_day between 1 and 6),
  meal_schedule jsonb not null default '[]'::jsonb check (jsonb_typeof(meal_schedule)='array'),
  budget_amount numeric(10,2) not null default 0 check (budget_amount between 0 and 5000),
  budget_period text not null default 'week' check (budget_period in ('day','week','month')),
  currency text not null default 'EUR' check (currency='EUR'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_profiles_user_id_idx on public.nutrition_profiles(user_id);
create unique index if not exists nutrition_profiles_one_active_idx on public.nutrition_profiles(user_id) where is_active;

alter table public.nutrition_profiles enable row level security;
revoke all on public.nutrition_profiles from anon, authenticated;
grant select, insert, update, delete on public.nutrition_profiles to authenticated;

drop policy if exists nutrition_profiles_select_own on public.nutrition_profiles;
create policy nutrition_profiles_select_own on public.nutrition_profiles for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists nutrition_profiles_insert_own on public.nutrition_profiles;
create policy nutrition_profiles_insert_own on public.nutrition_profiles for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists nutrition_profiles_update_own on public.nutrition_profiles;
create policy nutrition_profiles_update_own on public.nutrition_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists nutrition_profiles_delete_own on public.nutrition_profiles;
create policy nutrition_profiles_delete_own on public.nutrition_profiles for delete to authenticated using ((select auth.uid())=user_id);

alter table public.nutrition_preferences drop constraint if exists nutrition_preferences_meals_per_day_check;
alter table public.nutrition_preferences add constraint nutrition_preferences_meals_per_day_check check (meals_per_day between 1 and 6);

alter table public.meal_logs drop constraint if exists meal_logs_slot_check;
alter table public.meal_logs add constraint meal_logs_slot_check check (slot ~ '^[a-z0-9_-]{1,32}$');
alter table public.meal_logs add column if not exists scheduled_time time;
alter table public.meal_logs add column if not exists estimated_cost_eur numeric(8,2) check (estimated_cost_eur is null or estimated_cost_eur between 0 and 500);
alter table public.meal_logs add column if not exists nutrition_profile_id uuid references public.nutrition_profiles(id) on delete set null;
create index if not exists meal_logs_profile_date_idx on public.meal_logs(nutrition_profile_id,eaten_on desc);

alter table public.saved_meals drop constraint if exists saved_meals_slot_check;
alter table public.saved_meals add constraint saved_meals_slot_check check (slot ~ '^[a-z0-9_-]{1,32}$');
alter table public.saved_meals add column if not exists estimated_cost_eur numeric(8,2) check (estimated_cost_eur is null or estimated_cost_eur between 0 and 500);

alter table public.meal_plans add column if not exists nutrition_profile_id uuid references public.nutrition_profiles(id) on delete set null;
create index if not exists meal_plans_profile_date_idx on public.meal_plans(nutrition_profile_id,plan_date desc);

alter table public.shopping_items add column if not exists estimated_cost_eur numeric(8,2) check (estimated_cost_eur is null or estimated_cost_eur between 0 and 500);
alter table public.shopping_items add column if not exists nutrition_profile_id uuid references public.nutrition_profiles(id) on delete set null;

create table if not exists public.coach_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insight_date date not null default current_date,
  source text not null default 'rules' check (source in ('rules','ai')),
  analysis jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists coach_insights_user_date_idx on public.coach_insights(user_id,insight_date desc,created_at desc);
alter table public.coach_insights enable row level security;
revoke all on public.coach_insights from anon, authenticated;
grant select on public.coach_insights to authenticated;
drop policy if exists coach_insights_select_own on public.coach_insights;
create policy coach_insights_select_own on public.coach_insights for select to authenticated using ((select auth.uid())=user_id);
