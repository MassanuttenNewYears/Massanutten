-- Security hardening v2:
-- 1. Authenticated-only site_config table so trip-specific copy does not sit in public HTML/git.
-- 2. Revoke API privileges on unused tables (user_logs, cars, car_passengers) and cap profiles.display_name.
-- 3. Pre-flight check_invite_ready() RPC so invite.js verifies no email conflict before rotating a user's password.

create table if not exists public.site_config (
  key text primary key check (char_length(key) between 1 and 64),
  value text not null check (char_length(value) <= 500)
);

alter table public.site_config enable row level security;

revoke all on table public.site_config from public, anon, authenticated;
grant select on table public.site_config to authenticated;

drop policy if exists "site_config_read_authenticated" on public.site_config;
create policy "site_config_read_authenticated" on public.site_config
  for select to authenticated
  using (true);

-- Unused / inactive tables: deny direct PostgREST access.
revoke all on table public.user_logs from public, anon, authenticated;
revoke all on table public.cars, public.car_passengers from public, anon, authenticated;

-- Profiles: only read + bounded display_name update on own row (created by auth trigger).
revoke insert, delete on table public.profiles from public, anon, authenticated;
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 100);

-- Pre-flight check before invite.js mutates auth.users.encrypted_password, preventing strand-on-conflict.
create or replace function public.check_invite_ready()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_slug text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;

  select p.slug into v_slug
    from public.people p
   where p.user_id = v_uid;

  if v_slug is null then
    raise exception 'no roster row for this account';
  end if;

  select le.email into v_email
    from public.login_emails le
   where le.slug = v_slug;

  if v_email is not null and exists (
    select 1
      from auth.users u
     where lower(u.email) = v_email
       and u.id <> v_uid
  ) then
    raise exception 'email already belongs to another account';
  end if;
end;
$$;

revoke execute on function public.check_invite_ready() from public, anon;
grant execute on function public.check_invite_ready() to authenticated;

notify pgrst, 'reload schema';
