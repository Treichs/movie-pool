-- Three granted RPCs with no caller anywhere in src/ or scripts/ go (state
-- audit 2026-08-09, L1). The project's own rule, stated when get_week_bidders
-- went in 20260805010000: an exposed RPC nobody calls is still an endpoint; a
-- dropped one cannot be re-granted by accident.
--
-- • discard_draft_season — deleted seasons with status 'draft', a state
--   create_season has been unable to produce since 20260804080000 (seasons
--   are born active). Its last src caller went with the setup page on
--   2026-08-04. When a season-deletion story is actually wanted, it gets
--   designed for active seasons, not resurrected from this.
-- • update_peep — superseded a day after it shipped by update_peep_parts
--   (20260807050000, the dress-up builder); nothing calls the numbered form.
-- • week_bidding_open — a phase-1 helper no policy or function has referenced
--   since the original bids policy was replaced.

drop function if exists public.discard_draft_season(uuid);
drop function if exists public.update_peep(smallint);
drop function if exists public.week_bidding_open(uuid);
