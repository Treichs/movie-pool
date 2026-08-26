-- SUPERSEDED IN PLACE by 20260801190000_fix_create_season_automation_default.
--
-- This migration originally recreated `create_season(uuid, text)` — the
-- phase-11 signature that ADR-020/025 had already dropped in favour of the
-- auto-numbering `create_season(uuid)` the app actually calls. Applied as
-- written it did nothing useful and resurrected a stale overload.
--
-- Its body is removed rather than corrected because it already ran against the
-- hosted database; the follow-up migration drops the overload it created and
-- puts the ADR-052 automation default on the real season-creation path. Left
-- as a no-op so the applied history stays contiguous.

select 1;
