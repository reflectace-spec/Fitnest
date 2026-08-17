create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  metrics jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  status text not null default 'generated' check (status in ('generated','accepted','dismissed')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.weekly_reviews enable row level security;

grant select, insert, update, delete on table public.weekly_reviews to authenticated;
revoke all on table public.weekly_reviews from anon;

create policy "weekly_reviews_owner_all"
on public.weekly_reviews
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists weekly_reviews_user_week_idx
on public.weekly_reviews(user_id, week_start desc);
