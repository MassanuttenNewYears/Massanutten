-- People who said they can drive on the yes RSVP. Not the cars roster.
-- No API role can read or write the table. offer_to_drive() inserts only the caller's own people row.

create table if not exists public.potential_drivers (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint potential_drivers_person_id_key unique (person_id)
);

alter table public.potential_drivers enable row level security;

revoke all on table public.potential_drivers from public, anon, authenticated;
revoke all on sequence public.potential_drivers_id_seq from public, anon, authenticated;

create or replace function public.offer_to_drive()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_id bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select p.id into v_person_id
    from public.people p
   where p.user_id = auth.uid();

  if v_person_id is null then
    raise exception 'no roster row for this account';
  end if;

  insert into public.potential_drivers (person_id)
  values (v_person_id)
  on conflict (person_id) do nothing;
end;
$$;

revoke execute on function public.offer_to_drive() from public, anon;
grant execute on function public.offer_to_drive() to authenticated;
