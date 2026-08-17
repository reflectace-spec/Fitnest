-- Build 2.5.1: exercise_library contains only shared, non-user-specific catalog data.
-- Allow the PWA to render the exercise wiki before login while keeping RLS active.

grant select on table public.exercise_library to anon;

alter table public.exercise_library enable row level security;

drop policy if exists exercise_library_read_public on public.exercise_library;
create policy exercise_library_read_public
on public.exercise_library
for select
to anon
using (is_active = true);
