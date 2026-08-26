-- The season roster locks on the FIRST BID, not on the first open week
-- (2026-08-04). Corrects 20260804090000, written an hour earlier.
--
-- 090000 moved the lock off "the season row exists" — right, because seasons
-- are active from birth now and that moment means nothing. It put the lock on
-- "a week has opened", which is closer but still early, and the test case that
-- proved it is the ordinary one:
--
--   create a league, fill week 1's slate, invite your friends.
--
-- Filling the slate opens week 1 the moment its clock has passed. Under 090000
-- everyone invited after that was locked out of a season in which NOT ONE BID
-- had been placed — a season with no ownership, no spending and no standings.
-- The commissioner's reward for preparing before inviting was a league where
-- only they could play.
--
-- WHAT ADR-016 IS ACTUALLY PROTECTING. Its words are that a latecomer must not
-- "join a season already in progress and land mid-table with a full bankroll
-- against players who have spent theirs". Every clause of that is about BIDS.
-- A week being open is an invitation to spend; it is not spending. Until
-- somebody commits a dollar there is no position to join unfairly, because
-- there are no positions.
--
-- So the lock is the first bid, which is the event the ADR describes and the
-- last moment at which admitting someone is provably fair: they arrive with the
-- same bankroll everyone still has, into a week nobody has bid on. One second
-- after the first bid, the door shuts and stays shut.
--
-- The function KEEPS ITS NAME — season_bidding_has_begun — because the name was
-- always right and only the implementation was wrong. Both callers
-- (add_season_member, accept_league_invite) read the new meaning with no change
-- to either.

create or replace function public.season_bidding_has_begun(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  -- Through weeks rather than a season_id on bids: a bid belongs to a film,
  -- which belongs to a week, which belongs to the season. Bids carry no season
  -- of their own and inventing a denormalised copy for this one test would be a
  -- second source of truth about where a bid lives.
  select exists (
    select 1
    from bids b
    join films f on f.id = b.film_id
    join weeks w on w.id = f.week_id
    where w.season_id = p_season_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Backfill, again, under the corrected rule.
--
-- Anyone in a league whose active season has taken NO bids belongs in that
-- season. 090000's version of this could not reach the leagues whose week 1 had
-- already opened, which is precisely the case that showed the rule was wrong.
-- ---------------------------------------------------------------------------
insert into season_members (season_id, profile_id, role)
select s.id, lm.profile_id, lm.role
from seasons s
join league_members lm on lm.league_id = s.league_id
where s.status = 'active'
  and not season_bidding_has_begun(s.id)
  and not exists (
    select 1 from season_members sm
    where sm.season_id = s.id and sm.profile_id = lm.profile_id
  );
