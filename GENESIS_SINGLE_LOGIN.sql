-- One active sign-in per account. A second overlapping sign-in revokes both.
begin;
create table genesis_private.login_names(
  name_key text primary key,
  username text not null,
  user_id uuid unique not null references auth.users(id) on delete cascade
);
alter table genesis_private.login_names enable row level security;
revoke all on genesis_private.login_names from public,anon,authenticated;
update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('login_alias',v.alias)
from (values ('admin','realmgames7@gmail.com'),('lk','lk@accounts.genesisoss.lol'),('kl','kl@accounts.genesisoss.lol')) v(alias,email)
where auth.users.email=v.email;
insert into genesis_private.login_names(name_key,username,user_id)
select lower(v.username),v.username,u.id from (values
  ('Admin','realmgames7@gmail.com'),('LK','lk@accounts.genesisoss.lol'),('KL','kl@accounts.genesisoss.lol')
) v(username,email) join auth.users u on u.email=v.email;

create function genesis_private.resolve_login(p_username text) returns text
language sql stable security definer set search_path='' as $$
  select u.raw_app_meta_data->>'login_alias' from genesis_private.login_names n join auth.users u on u.id=n.user_id
  where n.name_key=lower(btrim(p_username)) and (u.banned_until is null or u.banned_until<now())
    and (u.raw_app_meta_data->>'role'='admin' or exists(select 1 from genesis_private.account_access a
      where a.user_id=u.id and a.approved and not a.suspended))
$$;
create function public.genesis_resolve_login(p_username text) returns text
language sql security invoker set search_path='' as $$ select genesis_private.resolve_login(p_username) $$;
revoke all on function genesis_private.resolve_login(text),public.genesis_resolve_login(text) from public;
grant usage on schema genesis_private to anon;
grant execute on function genesis_private.resolve_login(text),public.genesis_resolve_login(text) to anon,authenticated;

create function genesis_private.set_username(p_username text) returns text
language plpgsql security definer set search_path='' as $$
declare uid uuid:=genesis_private.trusted_user_id(); clean text:=btrim(p_username);
begin
  if uid is null or not genesis_private.is_approved() then raise exception 'Sign in to continue'; end if;
  if clean is null or clean!~'^[A-Za-z0-9][A-Za-z0-9 _.-]{1,23}$' then raise exception 'Use 2-24 letters, numbers, spaces, dots, dashes or underscores'; end if;
  insert into genesis_private.login_names(name_key,username,user_id) values(lower(clean),clean,uid)
    on conflict(user_id) do update set name_key=excluded.name_key,username=excluded.username;
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('display_name',clean),updated_at=now() where id=uid;
  return clean;
end;
$$;
create function public.genesis_set_username(p_username text) returns text
language sql security invoker set search_path='' as $$ select genesis_private.set_username(p_username) $$;
revoke all on function genesis_private.set_username(text),public.genesis_set_username(text) from public,anon;
grant execute on function genesis_private.set_username(text),public.genesis_set_username(text) to authenticated;

create table genesis_private.login_presence(
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  seen_at timestamptz not null default now()
);
alter table genesis_private.login_presence enable row level security;
revoke all on genesis_private.login_presence from public,anon,authenticated;

create function genesis_private.claim_login() returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=genesis_private.trusted_user_id(); sid uuid; previous genesis_private.login_presence%rowtype;
begin
  if uid is null or not genesis_private.is_approved() then return false; end if;
  sid:=(auth.jwt()->>'session_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,731));
  select * into previous from genesis_private.login_presence where user_id=uid;
  if found and previous.session_id<>sid and previous.seen_at>now()-interval '90 seconds'
    and exists(select 1 from auth.sessions s where s.id=previous.session_id and s.user_id=uid) then
    delete from auth.sessions where user_id=uid;
    delete from genesis_private.login_presence where user_id=uid;
    return false;
  end if;
  insert into genesis_private.login_presence(user_id,session_id,seen_at) values(uid,sid,now())
    on conflict(user_id) do update set session_id=excluded.session_id,seen_at=excluded.seen_at;
  return true;
end;
$$;

create function genesis_private.release_login() returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=genesis_private.trusted_user_id();
begin
  if uid is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,731));
  delete from genesis_private.login_presence where user_id=uid and session_id::text=auth.jwt()->>'session_id';
  return true;
end;
$$;
create function public.genesis_release_login() returns boolean
language sql security invoker set search_path='' as $$ select genesis_private.release_login() $$;
revoke all on function genesis_private.claim_login(),genesis_private.release_login(),public.genesis_release_login() from public,anon;
grant execute on function genesis_private.claim_login(),genesis_private.release_login(),public.genesis_release_login() to authenticated;

create or replace function genesis_private.session_access()
returns table(user_id uuid,display_id smallint,active boolean,role text)
language plpgsql security definer set search_path='' as $$
declare uid uuid:=genesis_private.trusted_user_id(); did smallint; allowed boolean;
begin
  if uid is null then return; end if;
  perform pg_advisory_xact_lock(71639426);
  allowed:=genesis_private.is_approved();
  if allowed and not genesis_private.claim_login() then
    return query select uid,null::smallint,false,'conflict'::text;
    return;
  end if;
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
commit;
