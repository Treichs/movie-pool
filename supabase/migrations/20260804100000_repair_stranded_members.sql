-- Repair: league members stranded by the ORDER of the two migrations before
-- this one (2026-08-04).
--
-- 20260804080000 flipped every draft season to active and then called
-- open_due_weeks, which opened any week whose clock had passed and whose slate
-- was filled. 20260804090000 then backfilled league members into seasons where
-- "bidding has not begun" — and for those seasons it now had, one statement
-- earlier, because of that very open.
--
-- The people it skipped had joined the league while the season was still a
-- draft. Under the rule 090000 establishes they belong in it: the week they are
-- being locked out of opened AFTER they joined, and only because a migration
-- opened it. Writing them in is restoring the state the two migrations were
-- supposed to land on together, not granting anyone a late entry.
--
-- SCOPED TO EXACTLY THAT CASE. Only seasons carrying the audit row 080000
-- wrote — `update_season_status` with reason 'seasons_start_active migration' —
-- qualify. A season whose weeks opened normally is untouched, so a genuine
-- latecomer to a genuinely running season stays locked out, which is what
-- ADR-016 is for.

insert into season_members (season_id, profile_id, role)
select s.id, lm.profile_id, lm.role
from seasons s
join league_members lm on lm.league_id = s.league_id
where s.status = 'active'
  and exists (
    select 1 from audit_log a
    where a.season_id = s.id
      and a.action = 'update_season_status'
      and a.detail->>'reason' = 'seasons_start_active migration'
  )
  and not exists (
    select 1 from season_members sm
    where sm.season_id = s.id and sm.profile_id = lm.profile_id
  );
