-- ============================================================================
-- Phase 5 — Winner resolution (resolve_week)
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §5 (domain logic) §6 (application structure)
--   Docs/reference/movie_pool_official_rules.md §4.1 (determining winners)
--   ADR-004 deny-by-default exposure
--
-- close_week already exists (phase 1): open → locked, which is what reveals
-- bids via the bids_select RLS policy. This migration adds the second half of
-- the weekly close-out: locked → resolved, computing ownership from the bids.
--
-- Rulebook §4.1, per film:
--   1. Rank all bids highest → lowest.
--   2. Take the top `top_n_distinct` DISTINCT dollar amounts (rule_configs).
--   3. EVERY bid at one of those amounts wins — ties honored, so a film may
--      have more than N owners; 1–2 bidders still win.
-- Golden test (Backrooms): $11, $8, $6, $6, $6, $6 → all six bids win.
--
-- Payment falls out of the flags: member_remaining_budget (phase 1) already
-- charges each member the sum of their is_winning bids on active films.
-- ============================================================================

create or replace function public.resolve_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_top_n   integer;
  v_winners integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can resolve winners';
  end if;
  -- Bids must be frozen first: place_bid only accepts while the week is
  -- 'open', so requiring 'locked' here means no bid can change under us.
  if v_week.status <> 'locked' then
    raise exception 'close bidding before resolving winners (status: %)', v_week.status;
  end if;

  select top_n_distinct into v_top_n
  from rule_configs where season_id = v_week.season_id;
  if v_top_n is null then
    raise exception 'season has no rule configuration';
  end if;

  -- One flag per bid on this week's active films. A bid wins iff its film is
  -- still eligible AND its amount is one of the film's top N distinct amounts.
  -- Ineligible films are off the slate (rulebook §3), so bids that slipped in
  -- before the commissioner flipped eligibility can never win; the full
  -- remove-with-refund path is phase 7. Bids on removed films are untouched
  -- (refund-by-derivation excludes them anyway).
  update bids b
  set is_winning = (
    f.eligible
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = b.film_id
      order by b2.amount desc
      limit v_top_n
    )
  )
  from films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and f.status = 'active';

  update weeks set status = 'resolved' where id = p_week_id;

  select count(*) into v_winners
  from bids b
  join films f on f.id = b.film_id
  where f.week_id = p_week_id
    and b.is_winning;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'resolve_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'top_n_distinct', v_top_n, 'winning_bids', v_winners));
end;
$$;

-- Grants — ADR-004 deliberate exposure.
revoke all on function public.resolve_week(uuid) from public, anon;
grant execute on function public.resolve_week(uuid) to authenticated;
