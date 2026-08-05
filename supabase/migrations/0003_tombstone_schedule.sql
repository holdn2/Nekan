-- Run the tombstone cleanup on a schedule.
--
-- purge_expired_tombstones() has existed since 0001 with nothing calling it, so
-- expired tombstones have simply been piling up. A tombstone is a row whose one
-- job is to tell other devices that a task is gone; after the 90 days that
-- src/shared/core.js also waits, no device that far behind is coming back.
--
-- This is its own file rather than the tail of 0002 because the SQL editor runs
-- a script as one transaction: if pg_cron turns out not to be enabled, the
-- failure here would roll back the account deletion function with it. Split,
-- the worst case is that this file does nothing and 0002 still stands.
--
-- If it fails on the extension, enable pg_cron under Database -> Extensions and
-- run this file again. Nothing else depends on it -- tombstones only accumulate
-- and never break a sync.

create extension if not exists pg_cron;

-- Re-running this file must not stack up duplicate jobs.
select cron.unschedule('nekan-purge-tombstones')
 where exists (
   select 1 from cron.job where jobname = 'nekan-purge-tombstones'
 );

-- 04:00 UTC daily. Nothing about this is urgent, and it has no business landing
-- in the middle of anybody's day.
select cron.schedule(
  'nekan-purge-tombstones',
  '0 4 * * *',
  $$select public.purge_expired_tombstones()$$
);
