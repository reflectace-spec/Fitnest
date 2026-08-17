-- Build 2.5.1: shared exercise catalog is browser read-only.
revoke all privileges on table public.exercise_library from anon;
revoke all privileges on table public.exercise_library from authenticated;
grant select on table public.exercise_library to anon, authenticated;
