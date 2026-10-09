-- Accept / decline support. Declined people get a red X on the roster.
alter table public.people add column if not exists declined_at timestamptz;

create or replace function public.decline_invite()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.people set declined_at = now()
   where user_id = auth.uid() and declined_at is null;
end;
$$;

create or replace function public.accept_invite()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.people set declined_at = null
   where user_id = auth.uid() and declined_at is not null;
end;
$$;

revoke execute on function public.decline_invite() from public, anon;
revoke execute on function public.accept_invite() from public, anon;
grant execute on function public.decline_invite() to authenticated;
grant execute on function public.accept_invite() to authenticated;
