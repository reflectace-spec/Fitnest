-- Fitnest Build 3.8: work-aware training and configurable water cadence.

create table if not exists public.work_schedules (
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_workday boolean not null default false,
  start_time time not null default '09:00',
  end_time time not null default '17:00',
  updated_at timestamptz not null default now(),
  primary key (user_id, weekday),
  constraint work_schedules_distinct_times check (start_time <> end_time)
);

alter table public.work_schedules enable row level security;

revoke all on table public.work_schedules from anon, authenticated;
grant select, insert, update, delete on table public.work_schedules to authenticated;
grant all on table public.work_schedules to service_role;

drop policy if exists "work_schedules_owner_select" on public.work_schedules;
create policy "work_schedules_owner_select"
on public.work_schedules for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "work_schedules_owner_insert" on public.work_schedules;
create policy "work_schedules_owner_insert"
on public.work_schedules for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "work_schedules_owner_update" on public.work_schedules;
create policy "work_schedules_owner_update"
on public.work_schedules for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "work_schedules_owner_delete" on public.work_schedules;
create policy "work_schedules_owner_delete"
on public.work_schedules for delete to authenticated
using ((select auth.uid()) = user_id);

alter table public.reminder_preferences
  add column if not exists water_start_time time not null default '09:00',
  add column if not exists water_end_time time not null default '20:00',
  add column if not exists water_interval_minutes integer not null default 120,
  add column if not exists water_weekdays smallint[] not null default array[1,2,3,4,5,6,7];

update public.reminder_preferences
set water_start_time = water_time
where water_start_time = '09:00'::time
  and water_time <> '09:00'::time;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reminder_water_interval_valid') then
    alter table public.reminder_preferences
      add constraint reminder_water_interval_valid
      check (water_interval_minutes between 30 and 240);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reminder_water_weekdays_valid') then
    alter table public.reminder_preferences
      add constraint reminder_water_weekdays_valid
      check (water_weekdays <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(water_weekdays) > 0);
  end if;
end $$;
