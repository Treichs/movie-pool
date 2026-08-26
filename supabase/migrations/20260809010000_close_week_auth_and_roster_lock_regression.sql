-- Two high-severity fixes from the 2026-08-09 state audit (H1, H2).
--
-- Both bodies start from the CURRENT effective definitions (close_week from
-- 20260805010000, season_bidding_has_begun from 20260804110000) with only the
-- fix applied — per the 2026-08-04 lesson that re-declaring a function from
-- any other copy is how regressions ship.

-- ---------------------------------------------------------------------------
-- H1. close_week: p_auto is a claim, and a claim must be checked.
--
-- p_auto marks the automation tick (pg_cron / service role), which carries no
-- JWT — but it was an ordinary caller-supplied argument on an RPC granted to
-- `authenticated`, so any signed-in account could pass p_auto := true and
-- close any open week, skipping the commissioner check. Closing computes
-- winners and charges bids in the same act, so that was an open door to
-- ending a rival's auction at a moment of the caller's choosing.
--
-- The gate now verifies the claim: p_auto is only honoured when auth.uid() is
-- null, which is true precisely for the pg_cron job and service-role callers
-- and never for a PostgREST call with a user JWT. The auto path also gains
-- the deadline check that previously lived only in run_bidding_automation's
-- loop — the function no longer trusts its caller to have done the filtering.
-- The commissioner path is unchanged: an early close remains legal (ADR-080,
-- "early close stays but warns").
--
-- Everything below the guard block is the 20260805010000 body, verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.close_week(p_week_id uuid, p_auto boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_top_n   integer;
  v_winners integer;
  v_sheets  integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if p_auto then
    -- The automation identity is the ABSENCE of a user, not a flag. A JWT
    -- caller claiming p_auto is lying and gets the commissioner's answer.
    if auth.uid() is not null then
      raise exception 'only the commissioner can close bidding';
    end if;
    if v_week.bid_deadline is null or now() < v_week.bid_deadline then
      raise exception 'week is not yet due to close';
    end if;
  elsif not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can close bidding';
  end if;
  if v_week.status <> 'open' then
    raise exception 'week is not open for bidding';
  end if;

  select (settings_for_season(v_week.season_id)).top_n_distinct into v_top_n;
  if v_top_n is null then
    raise exception 'season has no settings row — cannot decide winners';
  end if;

  -- A ZERO NEVER WINS. `b.amount > 0` is the load-bearing half; excluding
  -- zeros from the distinct list too is belt-and-braces, and the reasoning is
  -- worth keeping so nobody "simplifies" it away: zero sorts last descending,
  -- so it can only occupy one of the N slots when there are fewer than N
  -- distinct real amounts — where it displaces nothing. Filtered anyway,
  -- because that argument is subtle.
  --
  -- NOTE what is deliberately NOT here: any re-check against min_bid. min_bid
  -- is mutable mid-season, so testing it at resolution would retroactively void
  -- a bid that was legal when placed and silently change who owned what.
  update bids b
  set is_winning = (
    f.eligible
    and b.amount > 0
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = b.film_id
        and b2.amount > 0
      order by b2.amount desc
      limit v_top_n
    )
  )
  from films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and f.status = 'active';

  update weeks set status = 'closed' where id = p_week_id;

  -- Every open sheet closes with the week; `passed` is terminal and survives.
  update bid_sheets set status = 'closed', updated_at = now()
  where week_id = p_week_id and status = 'open';
  get diagnostics v_sheets = row_count;

  select count(*) into v_winners
  from bids b
  join films f on f.id = b.film_id
  where f.week_id = p_week_id
    and b.is_winning;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, case when p_auto then null else auth.uid() end,
          'close_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'automatic', p_auto,
                             'top_n_distinct', v_top_n,
                             'winning_bids', v_winners,
                             'sheets_closed', v_sheets));

  perform open_due_weeks(v_week.season_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- H2. season_bidding_has_begun: the roster locks on the FIRST BID, again.
--
-- 20260804110000 settled this deliberately: the lock is the first bid,
-- because until somebody commits a dollar there is no position to join
-- unfairly. Hours later 20260804220000 (skip weeks) re-declared the function
-- from the superseded 090000 week-status body — a stale-copy regression that
-- reintroduced exactly the lockout 110000 was written to fix: fill week 1's
-- slate, let it auto-open, and everyone invited after that is silently shut
-- out of a bid-free season.
--
-- The bids-exist formulation needs no skipped-week carve-out at all — a
-- skipped week simply has no bids — which was 220000's only stated goal.
-- Body from 20260804110000, verbatim.
-- ---------------------------------------------------------------------------
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
-- Backfill under the restored rule, same shape as 110000's: anyone in a
-- league whose active season has taken NO bids belongs in that season. This
-- repairs any member the regression locked out between 08-04 and today.
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
