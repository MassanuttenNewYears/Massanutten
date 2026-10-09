-- Security hardening after audit (idempotent).

-- 1. Strip every API-role privilege, then grant back only what is needed.
revoke all on public.people, public.cars, public.car_passengers, public.itinerary_days from anon, authenticated;
revoke all on public.profiles, public.user_logs from anon;
revoke truncate, references, trigger on public.profiles, public.user_logs from authenticated;

-- 2. Trip data: signed-in users can only read. people: hide user_id and slug columns.
grant select on public.cars, public.car_passengers, public.itinerary_days to authenticated;
grant select (id, display_name, group_label, sort_order, first_signed_in_at, declined_at)
  on public.people to authenticated;

-- 3. Own-data tables keep per-row RLS; make sure the identity columns cannot be reassigned.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- 4. Internal helper functions must not be callable through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 5. RPCs: signed-in only (never anon / public).
revoke execute on function public.mark_first_sign_in() from public, anon;
revoke execute on function public.accept_invite() from public, anon;
revoke execute on function public.decline_invite() from public, anon;
grant execute on function public.mark_first_sign_in() to authenticated;
grant execute on function public.accept_invite() to authenticated;
grant execute on function public.decline_invite() to authenticated;

-- 6. Future tables/functions created in public get no automatic API access.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
