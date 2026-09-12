-- GENESIS GLOBAL ANNOUNCEMENT FIX
-- Run this query by itself in Supabase SQL Editor.

create or replace function public.genesis_get_active_announcement()
returns table(
  id bigint,
  message text,
  remaining_ms integer
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.message,
    greatest(
      0,
      (
        a.duration_ms -
        (extract(epoch from (now() - a.created_at)) * 1000)::integer
      )
    ) as remaining_ms
  from public.genesis_announcements a
  where
    a.created_at
      + (a.duration_ms * interval '1 millisecond')
      > now()
  order by a.id desc
  limit 1;
$$;

grant usage on schema public to anon, authenticated;

revoke all on function public.genesis_get_active_announcement() from public;
grant execute on function public.genesis_get_active_announcement()
to anon, authenticated;
