-- Hidden yes_only flag on public.people so flagged rows stay invisible in public.people
-- (and related RPCs) unless that person has an active yes RSVP.
-- Roster rows, yes_only flags, Auth accounts, and login_emails rows are provisioned out of band.

alter table public.people
  add column if not exists yes_only boolean not null default false;

revoke select (yes_only) on table public.people from public, anon, authenticated;

drop policy if exists "people_read_authenticated" on public.people;
create policy "people_read_authenticated" on public.people
  for select to authenticated
  using (
    not yes_only
    or (
      first_signed_in_at is not null
      and declined_at is null
      and maybe_at is null
    )
  );

create or replace function public.list_bring_items()
returns table (id bigint, person_name text, ciphertext text, created_at timestamptz, mine boolean)
language sql
security definer
set search_path = ''
as $$
  select b.id, p.display_name, b.ciphertext, b.created_at, (p.user_id = (select auth.uid()))
    from public.bring_items b
    join public.people p on p.id = b.person_id
   where (select auth.uid()) is not null
     and (
       not p.yes_only
       or (
         p.first_signed_in_at is not null
         and p.declined_at is null
         and p.maybe_at is null
       )
     )
   order by b.created_at;
$$;

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
   where not pe.yes_only
      or (
        pe.first_signed_in_at is not null
        and pe.declined_at is null
        and pe.maybe_at is null
      )
   order by pe.sort_order, pe.display_name;
end;
$$;

create or replace function public.set_secret_liquor(p_pairs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair jsonb;
  v_giver text;
  v_target text;
  v_givers text[] := '{}';
  v_targets text[] := '{}';
  v_yes int;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  if not exists (
    select 1
      from public.people p
     where p.user_id = (select auth.uid())
       and p.is_admin
  ) then
    raise exception 'not allowed';
  end if;

  if jsonb_typeof(p_pairs) is distinct from 'array' then
    raise exception 'need at least 2 pairs';
  end if;
  if jsonb_array_length(p_pairs) < 2 then
    raise exception 'need at least 2 pairs';
  end if;

  for v_pair in select value from jsonb_array_elements(p_pairs)
  loop
    v_giver := trim(v_pair->>'giver');
    v_target := trim(v_pair->>'target');
    if v_giver is null or v_giver = '' or v_target is null or v_target = '' then
      raise exception 'each pair needs a giver and a target';
    end if;
    if v_giver = v_target then
      raise exception 'a person cannot be their own target';
    end if;
    v_givers := v_givers || v_giver;
    v_targets := v_targets || v_target;
  end loop;

  if (select count(distinct x) from unnest(v_givers) as x) <> cardinality(v_givers)
     or (select count(distinct x) from unnest(v_targets) as x) <> cardinality(v_targets) then
    raise exception 'each person can give once and receive once';
  end if;

  if exists (
    select unnest(v_givers)
    except
    select unnest(v_targets)
  ) or exists (
    select unnest(v_targets)
    except
    select unnest(v_givers)
  ) then
    raise exception 'givers and targets must be the same people';
  end if;

  if exists (
    select 1
      from unnest(v_givers) as u(slug)
      left join public.people p on p.slug = u.slug
     where p.id is null
        or p.first_signed_in_at is null
        or p.declined_at is not null
        or p.maybe_at is not null
  ) then
    raise exception 'every person must be a yes RSVP';
  end if;

  select count(*) into v_yes
    from public.people p
   where p.first_signed_in_at is not null
     and p.declined_at is null
     and p.maybe_at is null;

  if v_yes <> cardinality(v_givers) then
    raise exception 'pairs must cover every yes RSVP';
  end if;

  if exists (
    select 1
      from public.people p
     where not p.yes_only
       and p.first_signed_in_at is null
       and p.declined_at is null
       and p.maybe_at is null
  ) then
    raise exception 'not everyone has rsvped';
  end if;

  delete from public.secret_liquor;

  insert into public.secret_liquor (person_id, target_id)
  select g.id, t.id
    from unnest(v_givers, v_targets) as u(giver, target)
    join public.people g on g.slug = u.giver
    join public.people t on t.slug = u.target;
end;
$$;

revoke execute on function public.list_bring_items() from public, anon;
revoke execute on function public.list_potential_drivers() from public, anon;
revoke execute on function public.set_secret_liquor(jsonb) from public, anon;

grant execute on function public.list_bring_items() to authenticated;
grant execute on function public.list_potential_drivers() to authenticated;
grant execute on function public.set_secret_liquor(jsonb) to authenticated;

notify pgrst, 'reload schema';
