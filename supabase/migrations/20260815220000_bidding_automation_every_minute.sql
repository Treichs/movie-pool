-- ============================================================================
-- The bidding automation ticks every MINUTE, not every hour.
--
-- The deadline never closed a week — it only made the RPCs refuse bids while
-- the hourly pg_cron job (20260801170000) came along to perform the close.
-- That left up to 59 minutes where a week reads `open`, nothing is biddable,
-- and the reveal waits on the top of the hour. Harmless by construction
-- (place_bids checks the clock, the reveal keys off status), but a player who
-- bids at 12:00 waits until 1:00 to see the sheet.
--
-- Considered and REJECTED before this change (2026-08-15 design review):
--   * Pure state control (deadline IS the transition, no derived checks) —
--     fails OPEN: if the scheduler dies, the deadline silently stops
--     existing and late bids flow. Today's shape fails SAFE: the clock check
--     is the law, the job is the janitor, and a sick janitor only delays the
--     ceremony. The `biddable` derivation in week-board.ts stays.
--   * One-shot pg_cron jobs at each exact deadline — real bookkeeping (a
--     trigger keeping jobs in sync with every deadline edit, self-
--     unscheduling) to buy ~59 seconds over this change.
--
-- This is the same philosophy 20260804080000 applied to the OPEN side: keep
-- the act, make its lag imperceptible. A minute-ly run of one idempotent SQL
-- statement over a handful of rows costs nothing that matters.
--
-- cron.schedule() with an existing jobname UPDATES that job in place, so this
-- is a one-call reschedule, not a drop-and-recreate.
-- ============================================================================

select cron.schedule(
  'bidding-automation',
  '* * * * *',
  $$select public.run_bidding_automation()$$
);

-- Housekeeping the faster tick makes necessary: pg_cron logs every run to
-- cron.job_run_details, and 1,440 rows/day accumulates forever unless purged.
-- Weekly sweep, keeping a week of history — enough to debug a misbehaving
-- tick, not enough to bloat.
select cron.schedule(
  'purge-cron-run-details',
  '0 4 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

comment on function public.run_bidding_automation() is
  'ADR-056: locks every open week past its deadline (the reveal), then opens '
  'every draft week thereby unblocked. Service-role only; driven every minute '
  'by the pg_cron job ''bidding-automation'' (hourly until 20260815220000); '
  '/api/cron/automate remains as a manual trigger.';
