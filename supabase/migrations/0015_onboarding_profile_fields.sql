alter table public.profiles
  add column if not exists training_level text not null default 'beginner',
  add column if not exists primary_goal text not null default 'weight_loss',
  add column if not exists equipment text[] not null default '{}',
  add column if not exists onboarding_version text,
  add column if not exists onboarding_completed_at timestamptz;

do $$ begin
  alter table public.profiles add constraint profiles_training_level_check check (training_level in ('beginner','intermediate','advanced'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_primary_goal_check check (primary_goal in ('weight_loss','fitness','strength'));
exception when duplicate_object then null; end $$;
