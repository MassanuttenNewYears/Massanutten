-- Roster, cars, itinerary, first-sign-in tracking, and admin email switching.

create table if not exists public.people (
  id bigint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_name text not null,
  group_label text not null,
  sort_order int not null default 0,
  user_id uuid unique references auth.users(id) on delete set null,
  first_signed_in_at timestamptz
);

create table if not exists public.cars (
  id bigint generated always as identity primary key,
  name text not null,
  sort_order int not null default 0
);

create table if not exists public.car_passengers (
  id bigint generated always as identity primary key,
  car_id bigint not null references public.cars(id) on delete cascade,
  name text not null,
  sort_order int not null default 0
);
create index if not exists car_passengers_car_id_idx on public.car_passengers (car_id);

create table if not exists public.itinerary_days (
  id bigint generated always as identity primary key,
  day_number int not null unique,
  day_date date,
  items text[] not null default '{}'
);

alter table public.people enable row level security;
alter table public.cars enable row level security;
alter table public.car_passengers enable row level security;
alter table public.itinerary_days enable row level security;

revoke all on public.people, public.cars, public.car_passengers, public.itinerary_days from anon;
revoke insert, update, delete on public.people, public.cars, public.car_passengers, public.itinerary_days from authenticated;
grant select on public.people, public.cars, public.car_passengers, public.itinerary_days to authenticated;

drop policy if exists "people_read_authenticated" on public.people;
create policy "people_read_authenticated" on public.people for select to authenticated using (true);
drop policy if exists "cars_read_authenticated" on public.cars;
create policy "cars_read_authenticated" on public.cars for select to authenticated using (true);
drop policy if exists "car_passengers_read_authenticated" on public.car_passengers;
create policy "car_passengers_read_authenticated" on public.car_passengers for select to authenticated using (true);
drop policy if exists "itinerary_days_read_authenticated" on public.itinerary_days;
create policy "itinerary_days_read_authenticated" on public.itinerary_days for select to authenticated using (true);

create or replace function public.mark_first_sign_in()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.people
     set first_signed_in_at = now()
   where user_id = auth.uid() and first_signed_in_at is null;
end;
$$;
revoke execute on function public.mark_first_sign_in() from public, anon;
grant execute on function public.mark_first_sign_in() to authenticated;

create or replace function public.admin_set_login_email(p_slug text, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email: %', p_email;
  end if;

  select user_id into v_uid from public.people where slug = p_slug;
  if not found then
    raise exception 'unknown slug: %', p_slug;
  end if;
  if v_uid is null then
    raise exception 'slug % has no auth account', p_slug;
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email and id <> v_uid) then
    raise exception 'email % already belongs to another account', v_email;
  end if;

  update auth.users
     set email = v_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = v_uid and email is distinct from v_email;

  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_email, 'email_verified', true),
         updated_at = now()
   where user_id = v_uid and provider = 'email';

  return v_email;
end;
$$;
revoke execute on function public.admin_set_login_email(text, text) from public, anon, authenticated;
grant execute on function public.admin_set_login_email(text, text) to service_role;
