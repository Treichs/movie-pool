-- ADR-052 amendment: the hourly automation runner moves from Vercel Cron to
-- pg_cron. Vercel's Hobby plan rejects any cron more frequent than daily —
-- the hourly schedule in vercel.json failed the entire production deployment.
-- pg_cron runs as the database owner, which bypasses the grant wall the same
-- way service_role does: deliberately, and without moving a secret anywhere.
-- /api/cron/automate stays as a CRON_SECRET-guarded manual trigger.

create extension if not exists pg_cron;

select cron.schedule(
  'bidding-automation',
  '0 * * * *',
  $$select public.run_bidding_automation()$$
);

comment on function public.run_bidding_automation() is
  'ADR-052: opens due weeks for seasons with bidding_automation on. '
  'Service-role only; scheduled hourly by the pg_cron job '
  '''bidding-automation''; /api/cron/automate remains as a manual trigger.';
