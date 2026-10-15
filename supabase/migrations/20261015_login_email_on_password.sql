-- When someone saves a password, switch their Auth login to the invited address.
-- The address rows are inserted out of band. Do not put them in this file.

create table if not exists public.login_emails (
  slug text primary key references public.people (slug),
  email text not null unique
    check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

alter table public.login_emails enable row level security;

revoke all on table public.login_emails from public, anon, authenticated;

comment on table public.login_emails is
  'Auth login address for each slug. No API access. Values are set out of band.';

create or replace function public.mark_first_sign_in()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text;
  v_email text;
begin
  if v_uid is null then
    raise exception 'not allowed';
  end if;

  select slug into v_slug
    from public.people
   where user_id = v_uid;

  if v_slug is not null then
    select email into v_email
      from public.login_emails
     where slug = v_slug;
  end if;

  if v_email is not null then
    if exists (
      select 1 from auth.users
       where lower(email) = v_email and id <> v_uid
    ) then
      raise exception 'email already belongs to another account';
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
  end if;

  update public.people
     set first_signed_in_at = now()
   where user_id = v_uid and first_signed_in_at is null;
end;
$$;

revoke execute on function public.mark_first_sign_in() from public, anon;
grant execute on function public.mark_first_sign_in() to authenticated;
