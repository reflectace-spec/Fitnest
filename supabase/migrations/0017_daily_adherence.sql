create table if not exists public.daily_adherence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  item_type text not null check (item_type in ('meal', 'training')),
  item_key text not null check (char_length(item_key) between 1 and 128),
  status text not null check (status in ('planned', 'completed', 'skipped', 'replaced')),
  replacement_text text check (replacement_text is null or char_length(replacement_text) <= 160),
  difficulty smallint check (difficulty is null or difficulty between 1 and 5),
  energy smallint check (energy is null or energy between 1 and 5),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_date, item_type, item_key)
);

create index if not exists daily_adherence_user_date_idx
  on public.daily_adherence (user_id, activity_date desc);

alter table public.daily_adherence enable row level security;

revoke all on table public.daily_adherence from anon, authenticated;
grant select, insert, update, delete on table public.daily_adherence to authenticated;
grant all on table public.daily_adherence to service_role;

drop policy if exists "Users can view own daily adherence" on public.daily_adherence;
create policy "Users can view own daily adherence"
  on public.daily_adherence for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own daily adherence" on public.daily_adherence;
create policy "Users can insert own daily adherence"
  on public.daily_adherence for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own daily adherence" on public.daily_adherence;
create policy "Users can update own daily adherence"
  on public.daily_adherence for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own daily adherence" on public.daily_adherence;
create policy "Users can delete own daily adherence"
  on public.daily_adherence for delete
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.daily_adherence is
  'Daily meal and training adherence plus subjective training feedback for adaptive planning.';
