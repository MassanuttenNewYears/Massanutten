-- "Maybe" RSVP (idempotent). Declined > maybe > accepted in display; each RPC clears the others.
alter table public.people add column if not exists maybe_at timestamptz;

grant select (maybe_at) on public.people to authenticated;

create or replace function public.maybe_invite()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.people set maybe_at = now(), declined_at = null
   where user_id = auth.uid();
end;
$$;

create or replace function public.accept_invite()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.people set declined_at = null, maybe_at = null
   where user_id = auth.uid() and (declined_at is not null or maybe_at is not null);
end;
$$;

create or replace function public.decline_invite()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.people set declined_at = now(), maybe_at = null
   where user_id = auth.uid();
end;
$$;

revoke execute on function public.maybe_invite() from public, anon;
grant execute on function public.maybe_invite() to authenticated;
