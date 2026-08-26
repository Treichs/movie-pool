-- ============================================================================
-- films.screen_count is DROPPED. This is the remaining half of the ADR-059/061
-- cleanup, whose other half — the rule_configs compatibility view — went in
-- 20260804050000.
--
-- The column has been deprecated since 20260803030000 (ADR-061): eligibility is
-- release type, not screen count, so nothing writes it any more. add_film,
-- capture_film and update_film were all redefined in that migration to stop
-- touching it, and no function, view or trigger reads it now — checked against
-- the migration history, not by grep: the only surviving references are the
-- superseded function bodies those redefinitions replaced, plus this file's
-- lineage of comments. The app never reads it (src/ has zero references).
--
-- It carried a deprecation comment promising a cleanup migration "once old
-- readers are gone". The reshaped code deployed 2026-08-03; the readers are
-- gone; this is that migration.
-- ============================================================================

alter table public.films drop column if exists screen_count;
