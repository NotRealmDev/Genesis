-- Review before deployment: create the owner in Supabase Auth and set
-- raw_app_meta_data.role = 'admin' using trusted server-side administration.
-- Never use user_metadata for authorization.
begin;
create schema if not exists genesis_private;
revoke all on schema genesis_private from public, anon;
grant usage on schema genesis_private to authenticated;

create or replace function genesis_private.set_device_status(p_display_id smallint, p_active boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.raw_app_meta_data->>'role' = 'admin'
      and (u.banned_until is null or u.banned_until < now())
  ) then
    raise insufficient_privilege using message = 'Verified Genesis administrator required';
  end if;
  if p_active is null then raise exception 'Status is required'; end if;
  update public.genesis_devices set active = p_active where display_id = p_display_id;
  if not found then raise exception 'Genesis ID was not found'; end if;
  insert into public.genesis_admin_actions(display_id, action)
    values (p_display_id, case when p_active then 'reactivated' else 'deactivated' end);
  return true;
end;
$$;
revoke all on function genesis_private.set_device_status(smallint,boolean) from public,anon;
grant execute on function genesis_private.set_device_status(smallint,boolean) to authenticated;

create or replace function public.genesis_set_device_status(p_display_id smallint, p_active boolean)
returns boolean language sql security invoker set search_path = ''
as $$ select genesis_private.set_device_status(p_display_id,p_active); $$;
revoke all on function public.genesis_set_device_status(smallint,boolean) from public,anon;
grant execute on function public.genesis_set_device_status(smallint,boolean) to authenticated,service_role;

-- Existing approvals remain unchanged. A reset browser must be approved again.
alter table public.genesis_devices alter column active set default false;
create or replace function public.genesis_register_device(p_token uuid)
returns table(display_id smallint,active boolean)
language plpgsql security definer set search_path = '' as $$
declare
  candidate smallint;
  existing public.genesis_devices%rowtype;
begin
  if p_token is null then raise exception 'Device token is required'; end if;
  -- Serialize registration to avoid concurrent unique-token collisions.
  perform pg_advisory_xact_lock(71639426);
  select * into existing from public.genesis_devices d where d.device_token=p_token;
  if found then
    update public.genesis_devices set last_seen=now() where id=existing.id;
    return query select existing.display_id,existing.active;
    return;
  end if;
  select n::smallint into candidate
    from generate_series(100,999) n
    where not exists(select 1 from public.genesis_devices d where d.display_id=n)
    order by random() limit 1;
  if candidate is null then raise exception 'No browser IDs available; contact an administrator'; end if;
  insert into public.genesis_devices(device_token,display_id,active)
    values(p_token,candidate,false);
  return query select candidate,false;
end;
$$;
revoke all on function public.genesis_register_device(uuid) from public;
grant execute on function public.genesis_register_device(uuid) to anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
