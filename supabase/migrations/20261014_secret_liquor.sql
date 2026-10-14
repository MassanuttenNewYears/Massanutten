-- Secret liquor targets. No API role can read or write the table.
-- my_secret_liquor() returns only the signed-in person's target name.
-- list_yes_rsvps() and set_secret_liquor() require people.is_admin.

create table if not exists public.secret_liquor (
  person_id bigint primary key references public.people (id) on delete cascade,
  target_id bigint not null unique references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint secret_liquor_not_self check (person_id <> target_id)
);

alter table public.secret_liquor enable row level security;

revoke all on table public.secret_liquor from public, anon, authenticated;

create or replace function public.my_secret_liquor()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.display_name
    from public.secret_liquor s
    join public.people me on me.id = s.person_id
    join public.people t on t.id = s.target_id
   where me.user_id = (select auth.uid());
$$;

create or replace function public.list_yes_rsvps()
returns table (slug text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
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

  return query
  select p.slug, p.display_name
    from public.people p
   where p.first_signed_in_at is not null
     and p.declined_at is null
     and p.maybe_at is null
   order by p.slug;
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
     where p.first_signed_in_at is null
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

revoke execute on function public.my_secret_liquor() from public, anon;
revoke execute on function public.list_yes_rsvps() from public, anon;
revoke execute on function public.set_secret_liquor(jsonb) from public, anon;

grant execute on function public.my_secret_liquor() to authenticated;
grant execute on function public.list_yes_rsvps() to authenticated;
grant execute on function public.set_secret_liquor(jsonb) to authenticated;

notify pgrst, 'reload schema';
