-- ============================================================================
-- Phase 8 — email notification log
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §7 (email & scheduled jobs)
--
-- The notify cron (src/app/api/cron/notify/route.ts) sends two kinds of
-- email via Resend:
--   * deadline_reminder — an open week's advisory deadline is near and the
--     member hasn't bid (the "chasing players" pain point)
--   * results_up        — the week reached scored; here's the standings link
--
-- This table is the dedup ledger: one row per (week, member, kind). A 'sent'
-- row means never send again; a 'failed' row is retried on the next run
-- (upsert refreshes status/error). Service-role only — no user-facing reads.
-- ============================================================================

create table public.email_log (
  id         bigint generated always as identity primary key,
  week_id    uuid not null references public.weeks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('deadline_reminder', 'results_up')),
  status     text not null check (status in ('sent', 'failed')),
  error      text,
  created_at timestamptz not null default now(),
  unique (week_id, profile_id, kind)
);

create index email_log_week_idx on public.email_log (week_id);

alter table public.email_log enable row level security;
-- Deliberately NO policies: with RLS enabled and no policy, authenticated
-- users can't touch it. Only the service role (the cron) reads and writes.

grant select, insert, update, delete on public.email_log to service_role;
