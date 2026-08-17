-- Fitnest Build 1
-- Execute only in the dedicated Fitnest Supabase project.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  age integer check (age between 16 and 100),
  height_cm numeric(5,1) check (height_cm between 120 and 230),
  sex_for_energy_formula text check (sex_for_energy_formula in ('male','female')),
  activity_level text not null default 'low' check (activity_level in ('low','medium','high')),
  training_days integer not null default 3 check (training_days between 1 and 7),
  session_minutes integer not null default 30 check (session_minutes between 10 and 120),
  step_goal integer not null default 8000 check (step_goal between 1000 and 30000),
  water_goal_l numeric(3,1) not null default 2.5 check (water_goal_l between 0.5 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_weight_kg numeric(5,1) not null check (start_weight_kg between 35 and 300),
  target_weight_kg numeric(5,1) not null check (target_weight_kg between 35 and 300),
  target_date date not null,
  status text not null default 'active' check (status in ('active','paused','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_library (
  id text primary key,
  name text not null,
  muscle_groups text[] not null default '{}',
  level text not null default 'basis',
  instructions jsonb not null default '[]'::jsonb,
  common_errors jsonb not null default '[]'::jsonb,
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  plan jsonb not null,
  generation_version text not null default 'rules-v1',
  created_at timestamptz not null default now(),
  unique(user_id, week_start)
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  workout_type text not null,
  duration_minutes integer check (duration_minutes between 0 and 300),
  perceived_effort integer check (perceived_effort between 1 and 10),
  completed boolean not null default false,
  exercise_log jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,1) check (weight_kg between 35 and 300),
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  note text,
  created_at timestamptz not null default now(),
  unique(user_id, measured_on)
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  steps integer not null default 0 check (steps between 0 and 100000),
  water_l numeric(3,1) not null default 0 check (water_l between 0 and 12),
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  energy integer check (energy between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, checkin_date)
);

create table if not exists public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  valid_from date not null,
  calories integer check (calories between 1000 and 6000),
  protein_g integer check (protein_g between 20 and 400),
  fiber_g integer check (fiber_g between 5 and 100),
  source text not null default 'estimate',
  created_at timestamptz not null default now(),
  unique(user_id, valid_from)
);

create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  meals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, plan_date)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  device_label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.exercise_library enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.body_metrics enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.meal_plans enable row level security;
alter table public.push_subscriptions enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select on public.exercise_library to authenticated;
grant select, insert, update, delete on public.workout_plans to authenticated;
grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.body_metrics to authenticated;
grant select, insert, update, delete on public.daily_checkins to authenticated;
grant select, insert, update, delete on public.nutrition_targets to authenticated;
grant select, insert, update, delete on public.meal_plans to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "profiles_owner_select" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_owner_insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_owner_update" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "profiles_owner_delete" on public.profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy "goals_owner_all" on public.goals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "exercise_library_read" on public.exercise_library for select to authenticated using (is_active = true);
create policy "workout_plans_owner_all" on public.workout_plans for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "workout_sessions_owner_all" on public.workout_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "body_metrics_owner_all" on public.body_metrics for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "daily_checkins_owner_all" on public.daily_checkins for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "nutrition_targets_owner_all" on public.nutrition_targets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "meal_plans_owner_all" on public.meal_plans for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push_subscriptions_owner_all" on public.push_subscriptions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into public.exercise_library (id,name,muscle_groups,level,instructions,common_errors)
values
('squat','Kniebeugen',array['Beine','Core'],'basis','["Füße schulterbreit", "Hüfte nach hinten und unten", "Knie stabil führen", "Kontrolliert aufrichten"]','["Knie kippen ein", "Fersen lösen sich", "Rücken rundet stark"]'),
('pushup','Liegestütze',array['Brust','Trizeps','Core'],'basis','["Hände etwas breiter als Schulter", "Körperlinie halten", "Brust senken", "Boden wegdrücken"]','["Hüfte sinkt", "Ellbogen spreizen komplett", "Kopf schiebt vor"]'),
('reverse-lunge','Reverse Lunges',array['Beine','Gesäß'],'basis','["Fuß nach hinten", "Knie absenken", "Vorderes Knie stabil", "Über vorderes Bein aufrichten"]','["Stand zu schmal", "Knie kippt ein", "Zu viel Abstoß hinten"]'),
('glute-bridge','Glute Bridge',array['Gesäß','hintere Kette'],'basis','["Rückenlage", "Core stabilisieren", "Becken anheben", "Kontrolliert senken"]','["Hohlkreuz", "Füße zu weit weg", "Zu schnell"]'),
('bird-dog','Bird Dog',array['Core','Rücken'],'stabilität','["Vierfüßler", "Gegengleiche Extremitäten strecken", "Becken stabil", "Langsam wechseln"]','["Becken dreht", "Hohlkreuz", "Zu schnell"]'),
('plank','Plank',array['Core'],'stabilität','["Unterarme unter Schulter", "Beine strecken", "Core anspannen", "Ruhig atmen"]','["Hüfte sinkt", "Gesäß zu hoch", "Luft anhalten"]')
on conflict (id) do nothing;
