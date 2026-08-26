-- ============================================================================
-- Phase 7 — Film removal + refund-by-derivation (remove_film)
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §3 (refund-by-derivation) §6 (application structure)
--   Docs/reference/movie_pool_official_rules.md §3 (eligibility + removal)
--   ADR-004 deny-by-default exposure   ADR-012 capture auto-flips to scored
--
-- Rulebook §3: a film confirmed under the screen threshold — or removed by
-- the commissioner for any reason — is removed from the roster, scores for
-- no one, and every winner is fully refunded.
--
-- The refund needs NO money movement: every derivation already filters on
-- films.status = 'active' —
--   * member_remaining_budget (phase 1) stops charging the winning bids,
--   * place_bid's sum-exposure (phase 1) stops counting open-week bids,
--   * v_standings (phase 6) drops the film's score and spend,
--   * resolve_week / capture_film (phases 5/6) skip removed films.
-- So remove_film only flips the status, records why, and audit-logs what
-- was refunded. Bids keep their is_winning flags as season history.
-- ============================================================================

create or replace function public.remove_film(p_film_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film         films%rowtype;
  v_week         weeks%rowtype;
  v_bid_count    integer;
  v_refund_count integer;
  v_refund_total integer;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;

  select * into v_week from weeks where id = v_film.week_id for update;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can remove films';
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has already been removed';
  end if;
  -- Rulebook §3 allows removal for any reason — but there must BE a reason;
  -- it goes in the audit log and is shown to players.
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'give a removal reason (e.g. "confirmed 850 screens")';
  end if;

  -- Snapshot what this removal refunds, for the audit trail. Winning bids
  -- were charged (locked+ weeks); open-week bids only counted as exposure.
  select count(*),
         count(*) filter (where is_winning),
         coalesce(sum(amount) filter (where is_winning), 0)
    into v_bid_count, v_refund_count, v_refund_total
  from bids
  where film_id = p_film_id;

  update films
  set status         = 'removed',
      removed_reason = trim(p_reason)
  where id = p_film_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'remove_film',
          jsonb_build_object(
            'film_id', p_film_id, 'title', v_film.title,
            'week_id', v_week.id, 'week_number', v_week.number,
            'week_status', v_week.status, 'reason', trim(p_reason),
            'bids', v_bid_count,
            'refunded_winning_bids', v_refund_count,
            'refunded_total', v_refund_total));

  -- Mirror capture_film's auto-flip (ADR-012): if this removal took away the
  -- last uncaptured eligible film of a resolved week, the week is scored —
  -- otherwise it would be stuck at resolved forever.
  if v_week.status = 'resolved' and not exists (
    select 1 from films f
    where f.week_id = v_week.id
      and f.status = 'active'
      and f.eligible
      and f.captured_at is null
  ) then
    update weeks set status = 'scored' where id = v_week.id;
    insert into audit_log (season_id, actor, action, detail)
    values (v_week.season_id, auth.uid(), 'week_scored',
            jsonb_build_object('week_id', v_week.id, 'week_number', v_week.number));
  end if;
end;
$$;

-- Grants — ADR-004 deliberate exposure.
revoke all on function public.remove_film(uuid, text) from public, anon;
grant execute on function public.remove_film(uuid, text) to authenticated;
