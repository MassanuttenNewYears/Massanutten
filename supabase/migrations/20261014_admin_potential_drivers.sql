-- Hidden admin flag. Not granted to API roles, so the site cannot read or display it.
-- list_potential_drivers() returns names only when the signed-in roster row has the flag.

alter table public.people
  add column if not exists is_admin boolean not null default false;

revoke select (is_admin) on table public.people from public, anon, authenticated;

update public.people
   set is_admin = true
 where slug in ('jack', 'john');

create or replace function public.list_potential_drivers()
returns table (driver_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select exists (
    select 1
      from public.people p
     where p.user_id = auth.uid()
       and p.is_admin
  ) into v_admin;

  if not v_admin then
    raise exception 'not allowed';
  end if;

  return query
  select pe.display_name
    from public.potential_drivers d
    join public.people pe on pe.id = d.person_id
   order by pe.sort_order, pe.display_name;
end;
$$;

revoke execute on function public.list_potential_drivers() from public, anon;
grant execute on function public.list_potential_drivers() to authenticated;

notify pgrst, 'reload schema';
