create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  device_id uuid not null unique,
  secret_hash text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  timezone text not null default 'Europe/Berlin',
  platform text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminder_preferences (
  device_id uuid primary key references public.push_devices(device_id) on delete cascade,
  training_enabled boolean not null default true,
  training_time time not null default '18:00',
  training_weekdays smallint[] not null default array[1,3,5],
  weigh_enabled boolean not null default true,
  weigh_time time not null default '08:00',
  weigh_weekdays smallint[] not null default array[1,5],
  water_enabled boolean not null default true,
  water_time time not null default '14:00',
  steps_enabled boolean not null default true,
  steps_time time not null default '19:30',
  evening_enabled boolean not null default true,
  evening_time time not null default '21:00',
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  updated_at timestamptz not null default now(),
  constraint reminder_training_weekdays_valid check (training_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  constraint reminder_weigh_weekdays_valid check (weigh_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);

create table if not exists public.push_delivery_log (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.push_devices(device_id) on delete cascade,
  reminder_type text not null check (reminder_type in ('training','weigh','water','steps','evening','test')),
  local_date date not null,
  scheduled_time time not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','expired')),
  response_code integer,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(device_id, reminder_type, local_date, scheduled_time)
);

create index if not exists push_devices_user_id_idx on public.push_devices(user_id) where user_id is not null;
create index if not exists push_devices_enabled_idx on public.push_devices(enabled) where enabled = true;
create index if not exists push_delivery_log_device_date_idx on public.push_delivery_log(device_id, local_date desc);

alter table public.push_devices enable row level security;
alter table public.reminder_preferences enable row level security;
alter table public.push_delivery_log enable row level security;

revoke all on public.push_devices from anon, authenticated;
revoke all on public.reminder_preferences from anon, authenticated;
revoke all on public.push_delivery_log from anon, authenticated;
grant all on public.push_devices to service_role;
grant all on public.reminder_preferences to service_role;
grant all on public.push_delivery_log to service_role;
grant usage, select on sequence public.push_delivery_log_id_seq to service_role;

create or replace function public.fitnest_push_server_config()
returns table(vapid_public_key text, vapid_private_key text, scheduler_token text)
language sql
security definer
set search_path = ''
as $$
  select
    max(case when name = 'fitnest_vapid_public_key' then decrypted_secret end),
    max(case when name = 'fitnest_vapid_private_key' then decrypted_secret end),
    max(case when name = 'fitnest_push_scheduler_token' then decrypted_secret end)
  from vault.decrypted_secrets
  where name in ('fitnest_vapid_public_key','fitnest_vapid_private_key','fitnest_push_scheduler_token');
$$;

revoke all on function public.fitnest_push_server_config() from public, anon, authenticated;
grant execute on function public.fitnest_push_server_config() to service_role;
