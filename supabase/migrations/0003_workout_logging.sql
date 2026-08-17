-- Fitnest Build 2.0: structured workout logging and generated exercise artwork metadata.

alter table public.workout_sessions add column if not exists status text not null default 'in_progress';
alter table public.workout_sessions add column if not exists started_at timestamptz not null default now();
alter table public.workout_sessions add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_sessions_status_check') then
    alter table public.workout_sessions add constraint workout_sessions_status_check check (status in ('in_progress','completed','cancelled'));
  end if;
end $$;

update public.workout_sessions set status = 'completed' where completed = true and status = 'in_progress';

create table if not exists public.workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null references public.exercise_library(id),
  set_number integer not null check (set_number between 1 and 20),
  reps integer check (reps between 0 and 500),
  duration_seconds integer check (duration_seconds between 0 and 3600),
  effort integer check (effort between 1 and 10),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  unique(session_id, exercise_id, set_number)
);

alter table public.workout_set_logs enable row level security;
grant select, insert, update, delete on public.workout_set_logs to authenticated;

drop policy if exists "workout_set_logs_owner_all" on public.workout_set_logs;
create policy "workout_set_logs_owner_all" on public.workout_set_logs
for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
)
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
);

create index if not exists workout_set_logs_user_id_idx on public.workout_set_logs(user_id);
create index if not exists workout_set_logs_session_id_idx on public.workout_set_logs(session_id);
create index if not exists workout_set_logs_exercise_id_idx on public.workout_set_logs(exercise_id);
create index if not exists workout_sessions_user_completed_idx on public.workout_sessions(user_id, completed_at desc) where completed = true;

insert into public.exercise_library (id,name,muscle_groups,level,instructions,common_errors,image_path,is_active)
values
('jumping-jack','Jumping Jacks',array['Cardio','Ganzkörper'],'kondition','["Aufrecht starten", "Füße öffnen und Arme anheben", "Weich landen", "Rhythmisch zurück"]','["Hart landen", "Schultern hochziehen", "Tempo vor Kontrolle"]','/assets/exercise-sprite.webp#jumping-jack',true)
on conflict (id) do update set name=excluded.name,muscle_groups=excluded.muscle_groups,level=excluded.level,instructions=excluded.instructions,common_errors=excluded.common_errors,image_path=excluded.image_path,is_active=true;

update public.exercise_library set image_path='/assets/exercise-sprite.webp#squat' where id='squat';
update public.exercise_library set image_path='/assets/exercise-sprite.webp#pushup' where id='pushup';
update public.exercise_library set image_path='/assets/exercise-sprite.webp#reverse-lunge' where id='reverse-lunge';
update public.exercise_library set image_path='/assets/exercise-sprite.webp#glute-bridge' where id='glute-bridge';
update public.exercise_library set image_path='/assets/exercise-sprite.webp#bird-dog' where id='bird-dog';
update public.exercise_library set image_path='/assets/exercise-sprite.webp#plank' where id='plank';
update public.exercise_library set image_path='/assets/exercise-sprite.webp#mountain' where id='mountain';
