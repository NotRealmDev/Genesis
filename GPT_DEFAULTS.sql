-- Optional Genesis GPT defaults.
-- Run this once in the Genesis Supabase project before publishing a shared key
-- from the administrator-only GPT panel.
--
-- IMPORTANT: because the current GPT app calls the provider from the browser,
-- a shared api_key can be inspected by users. For a production deployment,
-- replace the direct provider call with a server/edge-function proxy and keep
-- the provider secret in that server's environment.

create table if not exists public.genesis_gpt_config (
  id integer primary key check (id = 1),
  endpoint text not null default 'https://api.openai.com/v1/responses',
  model text not null default 'gpt-5-mini',
  api_key text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.genesis_gpt_config enable row level security;

drop policy if exists "Genesis GPT defaults are readable" on public.genesis_gpt_config;
create policy "Genesis GPT defaults are readable"
  on public.genesis_gpt_config for select
  to anon, authenticated
  using (true);

drop policy if exists "Genesis admins manage GPT defaults" on public.genesis_gpt_config;
create policy "Genesis admins manage GPT defaults"
  on public.genesis_gpt_config for all
  to authenticated
  using ((auth.jwt() ->> 'email') = 'admin@genesisos.lol')
  with check ((auth.jwt() ->> 'email') = 'admin@genesisos.lol');

insert into public.genesis_gpt_config (id)
values (1)
on conflict (id) do nothing;
