-- Staged cutover: provision and verify an owner before applying with the frontend.
begin;
create schema if not exists genesis_private;
revoke all on schema genesis_private from public,anon;
grant usage on schema genesis_private to authenticated;
create table if not exists genesis_private.account_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approved boolean not null default false,
  suspended boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table genesis_private.account_access enable row level security;
revoke all on genesis_private.account_access from public,anon,authenticated;
alter table public.genesis_devices add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists genesis_devices_auth_user_unique on public.genesis_devices(auth_user_id) where auth_user_id is not null;
create table if not exists public.genesis_security_incidents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_id smallint,
  reason text not null check(reason='unauthorized_admin_request'),
  created_at timestamptz not null default now()
);
create index if not exists genesis_security_incidents_user_time on public.genesis_security_incidents(user_id,created_at desc);
alter table public.genesis_security_incidents enable row level security;
revoke all on public.genesis_security_incidents from public,anon,authenticated;
grant select on public.genesis_security_incidents to authenticated;

create or replace function genesis_private.trusted_user_id() returns uuid
language sql stable security definer set search_path='' as $$
  select u.id from auth.users u
  where u.id=auth.uid() and (u.banned_until is null or u.banned_until<now())
    and exists(select 1 from auth.sessions s where s.user_id=u.id
      and s.id::text=(auth.jwt()->>'session_id'))
$$;
create or replace function genesis_private.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=genesis_private.trusted_user_id()
    and u.raw_app_meta_data->>'role'='admin'
    and not exists(select 1 from genesis_private.account_access a where a.user_id=u.id and a.suspended))
$$;
create or replace function genesis_private.is_approved() returns boolean
language sql stable security definer set search_path='' as $$
  select genesis_private.is_admin() or exists(select 1 from genesis_private.account_access a
    where a.user_id=genesis_private.trusted_user_id() and a.approved and not a.suspended)
$$;

-- Only server-observed unauthorized privileged operations trigger suspension.
-- No client-supplied target ID, DOM change, DevTools probe, or password is logged.
create or replace function genesis_private.security_guard(p_operation text) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=genesis_private.trusted_user_id(); did smallint;
begin
  if uid is null then return false; end if;
  if p_operation<>'admin' then return false; end if;
  if genesis_private.is_admin() then return true; end if;
  insert into genesis_private.account_access(user_id,approved,suspended)
    values(uid,false,true) on conflict(user_id) do update
    set approved=false,suspended=true,updated_at=now();
  update public.genesis_devices set active=false where auth_user_id=uid
    returning display_id into did;
  insert into public.genesis_security_incidents(user_id,display_id,reason)
    select uid,did,'unauthorized_admin_request'
    where not exists(select 1 from public.genesis_security_incidents
      where user_id=uid and created_at>now()-interval '1 minute');
  -- Return a denial; raising here would roll back the suspension and alert.
  return false;
end;
$$;
create or replace function public.genesis_security_guard(p_operation text) returns boolean
language sql security invoker set search_path='' as $$ select genesis_private.security_guard(p_operation) $$;

create or replace function genesis_private.session_access()
returns table(user_id uuid,display_id smallint,active boolean,role text)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=genesis_private.trusted_user_id(); did smallint; allowed boolean;
begin
  if uid is null then return; end if;
  perform pg_advisory_xact_lock(71639426);
  allowed:=genesis_private.is_approved();
  insert into genesis_private.account_access(user_id) values(uid) on conflict do nothing;
  select d.display_id into did from public.genesis_devices d where d.auth_user_id=uid;
  if not found then
    select n::smallint into did from generate_series(100,999) n
      where not exists(select 1 from public.genesis_devices d where d.display_id=n)
      order by random() limit 1;
    if did is null then raise exception 'No IDs available. Contact an administrator.'; end if;
    insert into public.genesis_devices(device_token,display_id,active,auth_user_id)
      values(gen_random_uuid(),did,allowed,uid);
  end if;
  update public.genesis_devices d set last_seen=now(),active=allowed where d.auth_user_id=uid;
  return query select uid,did,allowed,case when genesis_private.is_admin() then 'admin' else 'user' end;
end;
$$;
create or replace function public.genesis_session_access()
returns table(user_id uuid,display_id smallint,active boolean,role text)
language sql security invoker set search_path='' as $$ select * from genesis_private.session_access() $$;
create or replace function public.genesis_register_device(p_token uuid)
returns table(display_id smallint,active boolean)
language sql security invoker set search_path='' as $$ select a.display_id,a.active from genesis_private.session_access() a $$;
create or replace function public.genesis_check_device(p_token uuid)
returns table(display_id smallint,active boolean)
language sql security invoker set search_path='' as $$ select a.display_id,a.active from genesis_private.session_access() a $$;

create or replace function genesis_private.set_device_status(p_display_id smallint,p_active boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
  if not genesis_private.security_guard('admin') then return false; end if;
  if p_active is null then raise exception 'Status is required'; end if;
  select d.auth_user_id into uid from public.genesis_devices d where d.display_id=p_display_id;
  if not found then raise exception 'ID not found'; end if;
  if uid is not null then
    if uid=auth.uid() and p_active=false then raise exception 'Another admin must deactivate your own account'; end if;
    insert into genesis_private.account_access(user_id,approved,suspended)
      values(uid,p_active,not p_active) on conflict(user_id) do update
      set approved=p_active,suspended=not p_active,updated_at=now();
  end if;
  update public.genesis_devices set active=p_active where display_id=p_display_id;
  insert into public.genesis_admin_actions(display_id,action)
    values(p_display_id,case when p_active then 'reactivated' else 'deactivated' end);
  return true;
end;
$$;
create or replace function public.genesis_set_device_status(p_display_id smallint,p_active boolean)
returns boolean language sql security invoker set search_path='' as $$ select genesis_private.set_device_status(p_display_id,p_active) $$;

-- Existing anonymous definer API must not bypass the new privileged guard.
create or replace function genesis_private.send_announcement(p_message text,p_duration_ms integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
  if not genesis_private.security_guard('admin') then return null; end if;
  if length(trim(coalesce(p_message,'')))=0 then raise exception 'Message is required'; end if;
  insert into public.genesis_announcements(message,duration_ms)
    values(left(trim(p_message),2000),greatest(3000,least(coalesce(p_duration_ms,7000),30000))) returning id into result;
  return result;
end;
$$;
create or replace function public.genesis_send_announcement(p_message text,p_duration_ms integer)
returns bigint language sql security invoker set search_path='' as $$ select genesis_private.send_announcement(p_message,p_duration_ms) $$;

revoke all on all functions in schema genesis_private from public,anon;
grant execute on all functions in schema genesis_private to authenticated;
revoke all on function public.genesis_security_guard(text),public.genesis_session_access(),
  public.genesis_register_device(uuid),public.genesis_check_device(uuid),
  public.genesis_set_device_status(smallint,boolean),public.genesis_send_announcement(text,integer) from public,anon;
grant execute on function public.genesis_security_guard(text),public.genesis_session_access(),
  public.genesis_register_device(uuid),public.genesis_check_device(uuid),
  public.genesis_set_device_status(smallint,boolean),public.genesis_send_announcement(text,integer) to authenticated;

-- Scope direct reads to approved accounts or verified administrators.
alter table public.genesis_devices enable row level security;
alter table public.genesis_admin_actions enable row level security;
alter table public.genesis_announcements enable row level security;
revoke all on public.genesis_devices,public.genesis_admin_actions,public.genesis_announcements from anon,authenticated;
grant select on public.genesis_devices,public.genesis_admin_actions,public.genesis_announcements to authenticated;
create policy genesis_devices_admin_read on public.genesis_devices for select to authenticated using(genesis_private.is_admin());
create policy genesis_actions_admin_read on public.genesis_admin_actions for select to authenticated using(genesis_private.is_admin());
create policy genesis_announcements_approved_read on public.genesis_announcements for select to authenticated using(genesis_private.is_approved());
create policy genesis_incidents_admin_read on public.genesis_security_incidents for select to authenticated using(genesis_private.is_admin());
notify pgrst,'reload schema';
commit;
