alter table public.profiles
  add column if not exists email text,
  add column if not exists avatar_url text,
  add column if not exists timezone text not null default 'Europe/Berlin',
  add column if not exists last_synced_at timestamptz;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.fitnest_sync_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    user_id,
    display_name,
    email,
    avatar_url,
    timezone,
    updated_at
  ) values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    'Europe/Berlin',
    now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    updated_at = now();
  return new;
end;
$$;

revoke all on function private.fitnest_sync_auth_profile() from public;
revoke all on function private.fitnest_sync_auth_profile() from anon;
revoke all on function private.fitnest_sync_auth_profile() from authenticated;

drop trigger if exists fitnest_auth_user_created on auth.users;
create trigger fitnest_auth_user_created
after insert on auth.users
for each row execute function private.fitnest_sync_auth_profile();

drop trigger if exists fitnest_auth_user_identity_updated on auth.users;
create trigger fitnest_auth_user_identity_updated
after update of email, raw_user_meta_data on auth.users
for each row execute function private.fitnest_sync_auth_profile();

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.goals from anon, authenticated;
revoke all on table public.body_metrics from anon, authenticated;
revoke all on table public.daily_checkins from anon, authenticated;
revoke all on table public.workout_plans from anon, authenticated;
revoke all on table public.workout_sessions from anon, authenticated;
revoke all on table public.workout_set_logs from anon, authenticated;
revoke all on table public.nutrition_preferences from anon, authenticated;
revoke all on table public.nutrition_targets from anon, authenticated;
revoke all on table public.nutrition_profiles from anon, authenticated;
revoke all on table public.meal_plans from anon, authenticated;
revoke all on table public.meal_logs from anon, authenticated;
revoke all on table public.saved_meals from anon, authenticated;
revoke all on table public.shopping_items from anon, authenticated;
revoke all on table public.weekly_reviews from anon, authenticated;
revoke all on table public.exercise_favorites from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.goals to authenticated;
grant select, insert, update, delete on table public.body_metrics to authenticated;
grant select, insert, update, delete on table public.daily_checkins to authenticated;
grant select, insert, update, delete on table public.workout_plans to authenticated;
grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.workout_set_logs to authenticated;
grant select, insert, update, delete on table public.nutrition_preferences to authenticated;
grant select, insert, update, delete on table public.nutrition_targets to authenticated;
grant select, insert, update, delete on table public.nutrition_profiles to authenticated;
grant select, insert, update, delete on table public.meal_plans to authenticated;
grant select, insert, update, delete on table public.meal_logs to authenticated;
grant select, insert, update, delete on table public.saved_meals to authenticated;
grant select, insert, update, delete on table public.shopping_items to authenticated;
grant select, insert, update, delete on table public.weekly_reviews to authenticated;
grant select, insert, delete on table public.exercise_favorites to authenticated;
