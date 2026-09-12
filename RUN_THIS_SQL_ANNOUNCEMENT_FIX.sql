-- GENESIS ANNOUNCEMENT READ FIX
-- Run this ONE query in Supabase SQL Editor.

create or replace function public.genesis_get_latest_announcement()
returns table(
  id bigint,
  message text,
  duration_ms integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.message,
    a.duration_ms,
    a.created_at
  from public.genesis_announcements a
  order by a.created_at desc
  limit 1;
$$;

grant execute on function public.genesis_get_latest_announcement()
to anon, authenticated;
