-- ============================================================================
-- ADR-022 — Symmetric bid visibility
--
-- Supersedes the visibility clause of ADR-006. Phase 1's bids_select had three
-- clauses: (a) your own bids, (b) everyone's bids once the week is locked+,
-- and (c) the commissioner sees every bid at any time — including while
-- bidding is OPEN. Clause (c) gave a playing commissioner (and the
-- commissioner always plays, rulebook §1) every rival's amount before placing
-- their own. This migration removes it.
--
-- The new rule, now canonical in the rulebook §4:
--   * AMOUNTS are blind to everyone — commissioner included — until close.
--   * PARTICIPATION is public: during an open week every season member may see
--     which players have bid on a film, and therefore how many have.
--
-- Why participation needs its own read path: RLS is row-level, so it cannot
-- return a bid row with the amount masked. Exposing "who has bid" during an
-- open week therefore cannot come from a policy on `bids` — it needs a
-- projection that never selects `amount` at all. That is get_week_bidders
-- below. This is why the change is a policy DROP plus a function, rather than
-- a policy rewrite.
--
-- ADR-006's OTHER clause is untouched: place_bid still accepts bids from any
-- season member, commissioner included.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. bids_select — drop the commissioner-sees-all-while-open clause.
-- ---------------------------------------------------------------------------
drop policy if exists bids_select on public.bids;

-- Now symmetric: the commissioner is just another member here.
--   (a) your own bids, always — you must be able to see what you bid;
--   (b) all bids on films of a locked/resolved/scored week, if you are a
--       member of that season (the reveal at close).
-- No third clause. While a week is open, NOBODY reads another player's amount.
create policy bids_select on public.bids
  for select to authenticated
  using (
    public.is_own_member(season_member_id)
    or exists (
      select 1
      from public.films f
      join public.weeks w on w.id = f.week_id
      where f.id = bids.film_id
        and w.status in ('locked', 'resolved', 'scored')
        and public.is_season_member(w.season_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. get_week_bidders — the "who's in play" signal (ADR-022).
--
-- Deliberately a SECURITY DEFINER function, not a view: every view in this
-- schema is security_invoker precisely so it can never reveal more than the
-- underlying tables (see v_standings). This read must reveal more than the
-- bids table does — other players' participation during an open week — so it
-- is an explicitly privileged function instead, keeping the "all views are
-- invoker" invariant intact and making the escalation obvious to a reader.
--
-- It CANNOT leak an amount: `amount` is never selected. The worst a bug here
-- could expose is who bid on what, never how much.
-- ---------------------------------------------------------------------------
create or replace function public.get_week_bidders(p_week_id uuid)
returns table (
  film_id          uuid,
  season_member_id uuid,
  display_name     text
)
language sql stable security definer set search_path = public
as $$
  select
    b.film_id,
    b.season_member_id,
    pr.display_name
  from bids b
  join films f          on f.id  = b.film_id
  join weeks w          on w.id  = f.week_id
  join season_members sm on sm.id = b.season_member_id
  join profiles pr      on pr.id = sm.profile_id
  where f.week_id = p_week_id
    -- The gate: you only ever see participation in a season you play in.
    and public.is_season_member(w.season_id)
$$;

comment on function public.get_week_bidders(uuid) is
  'ADR-022: per-film bidder identities for a week (count = row count per film). '
  'Never returns bid amounts — those stay sealed from everyone, commissioner '
  'included, until the week is locked and bids_select reveals them.';

-- ---------------------------------------------------------------------------
-- 3. Grants — ADR-004 deliberate exposure.
-- ---------------------------------------------------------------------------
revoke all on function public.get_week_bidders(uuid) from public, anon;
grant execute on function public.get_week_bidders(uuid) to authenticated;
