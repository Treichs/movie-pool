-- ============================================================================
-- The notify sweep goes hourly, driven from the database.
--
-- Vercel Hobby rejects sub-daily crons, so the four email sweeps ran once a
-- day at 15:00 UTC — a reveal that happens Thursday evening became Friday
---morning mail. The bidding automation already solved this shape (ADR-056,
-- then 20260815220000): pg_cron is the scheduler the platform actually gives
-- us. The sweeps live in the Next.js route (they compose templates and call
-- Resend — not SQL work), so unlike the bidding tick this job reaches OUT:
-- pg_net fires an async HTTP GET at the production route, authorized with
-- the same CRON_SECRET the Vercel cron uses.
--
-- THE SECRET IS NOT IN THIS FILE, and that is the point of the vault detour:
-- migrations are git history. The job reads CRON_SECRET from supabase_vault
-- at call time, and set_notify_secret() below is how it gets there — a
-- service-role-only RPC the provisioning script calls with the value from
-- .env.local. Until the secret is provisioned the job no-ops with a notice;
-- the daily Vercel cron remains as the backstop either way, and the
-- email_log dedupe makes the overlap harmless.
-- ============================================================================

create extension if not exists pg_net;

-- Provision (or rotate) the vault copy of CRON_SECRET. Service-role only:
-- anyone who can call this can redirect nothing — the URL is fixed — but the
-- secret itself must not be writable by users.
create or replace function public.set_notify_secret(p_secret text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role only';
  end if;
  delete from vault.secrets where name = 'cron_secret';
  perform vault.create_secret(p_secret, 'cron_secret');
end;
$$;

revoke all on function public.set_notify_secret(text) from public, anon, authenticated;
-- Revoking from PUBLIC strips the default grant from EVERY role, service_role
-- included — the provisioning script calls through PostgREST as service_role,
-- so it gets its execute back explicitly.
grant execute on function public.set_notify_secret(text) to service_role;

-- The hourly caller. Reads the secret, fires the async GET, and never
-- raises: a scheduler job that throws just fills cron.job_run_details with
-- red — the sweep's own route is where failures are meaningful.
create or replace function public.run_notify_sweep()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'cron_secret';

  if v_secret is null then
    raise notice 'notify-sweep: no cron_secret in vault; skipping';
    return;
  end if;

  perform net.http_get(
    url := 'https://www.moviepool.app/api/cron/notify',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret)
  );
end;
$$;

revoke all on function public.run_notify_sweep() from public, anon, authenticated;
grant execute on function public.run_notify_sweep() to service_role;

-- Hourly at :05 — clear of the automation tick's minute boundary and of the
-- daily Vercel run. cron.schedule() with an existing jobname updates in
-- place, so re-running this migration reschedules rather than duplicates.
select cron.schedule(
  'notify-sweep',
  '5 * * * *',
  $$select public.run_notify_sweep()$$
);

comment on function public.run_notify_sweep() is
  'Fires the /api/cron/notify email sweeps hourly via pg_net, authorized with '
  'the vault-held CRON_SECRET (set via set_notify_secret). The daily Vercel '
  'cron remains as backstop; email_log dedupe makes the overlap harmless.';
