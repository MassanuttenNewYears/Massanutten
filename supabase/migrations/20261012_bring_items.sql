-- "What I'm bringing" list. The browser encrypts each entry (AES-256-GCM, key derived from the
-- passphrase + salt below) so this table only ever holds ciphertext. The passphrase/salt live in
-- app_secrets, which no API role can read directly; signed-in users get them via get_bring_secret().
create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets (name, value) values
  ('bring_passphrase', 'REDACTED'),
  ('bring_salt', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

create table if not exists public.bring_items (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people (id) on delete cascade,
  ciphertext text not null check (length(ciphertext) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.bring_items enable row level security;
revoke all on public.bring_items from anon, authenticated;

create or replace function public.get_bring_secret()
returns table (passphrase text, salt text)
language sql security definer set search_path = '' as $$
  select
    (select value from public.app_secrets where name = 'bring_passphrase'),
    (select value from public.app_secrets where name = 'bring_salt');
$$;

create or replace function public.list_bring_items()
returns table (id bigint, person_name text, ciphertext text, created_at timestamptz, mine boolean)
language sql security definer set search_path = '' as $$
  select b.id, p.display_name, b.ciphertext, b.created_at, (p.user_id = auth.uid())
    from public.bring_items b
    join public.people p on p.id = b.person_id
   where auth.uid() is not null
   order by b.created_at;
$$;

create or replace function public.add_bring_item(p_cipher text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_person bigint;
  v_id bigint;
begin
  select id into v_person from public.people where user_id = auth.uid();
  if v_person is null then raise exception 'no roster entry for this user'; end if;
  if (select count(*) from public.bring_items where person_id = v_person) >= 50 then
    raise exception 'too many items';
  end if;
  insert into public.bring_items (person_id, ciphertext) values (v_person, p_cipher)
    returning bring_items.id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_bring_item(p_id bigint, p_cipher text)
returns void
language sql security definer set search_path = '' as $$
  update public.bring_items b set ciphertext = p_cipher
   where b.id = p_id
     and b.person_id = (select id from public.people where user_id = auth.uid());
$$;

create or replace function public.delete_bring_item(p_id bigint)
returns void
language sql security definer set search_path = '' as $$
  delete from public.bring_items b
   where b.id = p_id
     and b.person_id = (select id from public.people where user_id = auth.uid());
$$;

revoke execute on function public.get_bring_secret() from public, anon;
revoke execute on function public.list_bring_items() from public, anon;
revoke execute on function public.add_bring_item(text) from public, anon;
revoke execute on function public.update_bring_item(bigint, text) from public, anon;
revoke execute on function public.delete_bring_item(bigint) from public, anon;
grant execute on function public.get_bring_secret() to authenticated;
grant execute on function public.list_bring_items() to authenticated;
grant execute on function public.add_bring_item(text) to authenticated;
grant execute on function public.update_bring_item(bigint, text) to authenticated;
grant execute on function public.delete_bring_item(bigint) to authenticated;
