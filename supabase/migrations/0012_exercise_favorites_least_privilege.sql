-- Build 2.5 hardening: explicit least-privilege grants for browser clients.
revoke all on table public.exercise_favorites from anon;
revoke all on table public.exercise_favorites from authenticated;
grant select, insert, delete on table public.exercise_favorites to authenticated;
