-- OPTIONAL CROSS-CLIENT TEST
-- Open Genesis on TWO browsers/devices first.
-- Then run this query.

select public.genesis_send_announcement(
  'GLOBAL TEST — this should appear on every open Genesis client',
  15000
);
