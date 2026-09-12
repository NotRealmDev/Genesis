-- NEXT STEP: ANNOUNCEMENT SENDER
-- Run this by itself in a new Supabase SQL Editor query.

create or replace function public.genesis_send_announcement(
  p_message text,
  p_duration_ms integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
  safe_duration integer;
begin
  if trim(coalesce(p_message, '')) = '' then
    raise exception 'Message cannot be empty';
  end if;

  safe_duration := greatest(
    3000,
    least(coalesce(p_duration_ms, 7000), 30000)
  );

  insert into public.genesis_announcements(message, duration_ms)
  values (
    left(trim(p_message), 2000),
    safe_duration
  )
  returning id into new_id;

  return new_id;
end;
$$;
