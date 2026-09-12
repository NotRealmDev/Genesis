-- OPTIONAL ANNOUNCEMENT TEST
-- Run after RUN_THIS_SQL_ANNOUNCEMENT_FIX.sql.
-- This creates a test announcement directly in the database.

select public.genesis_send_announcement(
  'Genesis announcement test',
  12000
);

-- Then verify the newest announcement:
select * from public.genesis_get_latest_announcement();
