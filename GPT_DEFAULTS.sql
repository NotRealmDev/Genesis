-- Genesis GPT: clean up legacy browser-readable defaults.
-- IMPORTANT: Run this migration in Supabase SQL Editor.
-- The OpenAI key must be stored only in Edge Function Secrets as OPENAI_API_KEY.
create table if not exists public.genesis_gpt_config (
  id integer primary key check (id=1),
  endpoint text not null default 'https://api.openai.com/v1/responses',
  model text not null default 'gpt-5-mini',
  updated_at timestamptz not null default now()
);
alter table public.genesis_gpt_config drop column if exists api_key;
alter table public.genesis_gpt_config enable row level security;
drop policy if exists "Genesis GPT defaults are readable" on public.genesis_gpt_config;
drop policy if exists "Genesis admins manage GPT defaults" on public.genesis_gpt_config;
revoke all on public.genesis_gpt_config from anon, authenticated;

-- Per-user hourly quota, stored atomically in PostgreSQL (not Edge Function memory).
create table if not exists public.genesis_gpt_usage (
  user_id uuid primary key,
  window_started timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.genesis_gpt_usage enable row level security;
revoke all on public.genesis_gpt_usage from anon, authenticated;

create or replace function public.genesis_gpt_consume_quota(p_user_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare request_count integer;
begin
  insert into public.genesis_gpt_usage as usage (user_id, window_started, hits)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
  set window_started = case when usage.window_started <= now()-interval '1 hour' then now() else usage.window_started end,
      hits = case when usage.window_started <= now()-interval '1 hour' then 1 else usage.hits+1 end
  returning hits into request_count;
  return request_count <= 30;
end;
$$;
revoke all on function public.genesis_gpt_consume_quota(uuid) from public, anon, authenticated;
grant execute on function public.genesis_gpt_consume_quota(uuid) to service_role;
