-- ---------------------------------------------------------------------------
-- The five designed emails (settlement project, email-templates task).
--
-- The ledger knew two kinds of mail and only week-shaped news. Three more
-- kinds arrive — slate_up (the week opened), bids_revealed (the sheet is
-- open), payouts_final (the season statement) — and the last one is about a
-- SEASON, not a week, so week_id loosens to nullable and season_id joins it.
-- Exactly one of the two must be set: a mail is about one thing.
--
-- Dedupe stays structural: the existing unique (week_id, profile_id, kind)
-- keeps covering week mail, and a sibling unique (season_id, profile_id,
-- kind) covers season mail. Plain constraints, not partial indexes — NULLs
-- are distinct under UNIQUE, so each constraint simply ignores the other
-- scope's rows, and supabase-js upserts can name either as its conflict
-- target (ON CONFLICT cannot infer a partial index through that client).
-- ---------------------------------------------------------------------------

alter table public.email_log
  alter column week_id drop not null;

alter table public.email_log
  add column season_id uuid references public.seasons (id) on delete cascade;

alter table public.email_log
  drop constraint email_log_kind_check;

alter table public.email_log
  add constraint email_log_kind_check check (kind in (
    'slate_up', 'deadline_reminder', 'bids_revealed', 'results_up',
    'payouts_final'
  ));

alter table public.email_log
  add constraint email_log_one_scope check (
    (week_id is not null)::int + (season_id is not null)::int = 1
  );

alter table public.email_log
  add constraint email_log_season_dedupe unique (season_id, profile_id, kind);

create index email_log_season_idx on public.email_log (season_id);

comment on table public.email_log is
  'Outbound mail ledger: one row per (scope, profile, kind) attempt, upserted '
  'so a retry overwrites a failure. week_id for week news, season_id for the '
  'payouts statement — exactly one is set.';
