-- Fitnest Build 2.1: personal nutrition planning and meal logging.
-- Applies only to the dedicated Fitnest Supabase project.

create table if not exists public.nutrition_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diet_style text not null default 'omnivore' check (diet_style in ('omnivore','vegetarian','vegan')),
  allergies text[] not null default '{}',
  dislikes text[] not null default '{}',
  meals_per_day integer not null default 4 check (meals_per_day between 3 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eaten_on date not null,
  slot text not null check (slot in ('breakfast','lunch','snack','dinner')),
  meal_key text,
  meal_name text not null,
  servings numeric(3,2) not null default 1 check (servings between 0.25 and 4),
  calories integer not null default 0 check (calories between 0 and 4000),
  protein_g numeric(6,1) not null default 0 check (protein_g between 0 and 300),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id,eaten_on,slot)
);

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slot text not null check (slot in ('breakfast','lunch','snack','dinner')),
  calories integer not null default 0 check (calories between 0 and 4000),
  protein_g numeric(6,1) not null default 0 check (protein_g between 0 and 300),
  ingredients jsonb not null default '[]'::jsonb,
  diet_style text not null default 'omnivore' check (diet_style in ('omnivore','vegetarian','vegan')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  item_key text not null,
  item_name text not null,
  amount_text text,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,week_start,item_key)
);

alter table public.nutrition_preferences enable row level security;
alter table public.meal_logs enable row level security;
alter table public.saved_meals enable row level security;
alter table public.shopping_items enable row level security;

grant select,insert,update,delete on public.nutrition_preferences to authenticated;
grant select,insert,update,delete on public.meal_logs to authenticated;
grant select,insert,update,delete on public.saved_meals to authenticated;
grant select,insert,update,delete on public.shopping_items to authenticated;

drop policy if exists "nutrition_preferences_owner_all" on public.nutrition_preferences;
create policy "nutrition_preferences_owner_all" on public.nutrition_preferences
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "meal_logs_owner_all" on public.meal_logs;
create policy "meal_logs_owner_all" on public.meal_logs
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "saved_meals_owner_all" on public.saved_meals;
create policy "saved_meals_owner_all" on public.saved_meals
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "shopping_items_owner_all" on public.shopping_items;
create policy "shopping_items_owner_all" on public.shopping_items
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists nutrition_preferences_user_id_idx on public.nutrition_preferences(user_id);
create index if not exists meal_logs_user_date_idx on public.meal_logs(user_id,eaten_on desc);
create index if not exists saved_meals_user_id_idx on public.saved_meals(user_id);
create index if not exists shopping_items_user_week_idx on public.shopping_items(user_id,week_start);

-- Existing Build 1 tables are retained. These grants make the client paths explicit
-- for projects using opt-in Data API grants.
grant select,insert,update,delete on public.nutrition_targets to authenticated;
grant select,insert,update,delete on public.meal_plans to authenticated;
