-- ============================================================================
-- Phase 6 — Manual results capture + scoring + standings
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §5 (domain logic) §6 (application structure)
--   Docs/reference/movie_pool_official_rules.md §6 (scoring) §7 (standings)
--   ADR-004 deny-by-default exposure   ADR-009 audited post-activation edits
--   ADR-011 ineligible-but-active films are automatic losers
--
-- films.score has been a generated column since phase 1
-- (round(box_office_m × tomatometer / 100, 2) — golden test 81.4 × 89 → 72.45).
-- This migration adds the write path (capture_film) and the read path
-- (v_standings); standings stay DERIVED, never stored (build plan §3).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. capture_film — the commissioner records the Monday-morning numbers
--    (rulebook §6.1). Requires a resolved (or already scored) week: capture
--    happens after the weekend and resolution happens right after close, so
--    ownership is always settled first. Re-capture is allowed for corrections
--    and is audit-logged with the old values (ADR-009 precedent).
-- ---------------------------------------------------------------------------
create or replace function public.capture_film(
  p_film_id      uuid,
  p_box_office_m numeric,
  p_tomatometer  integer,
  p_screen_count integer default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film  films%rowtype;
  v_week  weeks%rowtype;
  v_score numeric;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;

  select * into v_week from weeks where id = v_film.week_id for update;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can capture results';
  end if;
  if v_week.status not in ('resolved', 'scored') then
    raise exception 'resolve winners before capturing results (status: %)', v_week.status;
  end if;
  -- Removed films are never evaluated (rulebook §3); the remove path is phase 7.
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the roster and is not scored';
  end if;
  if p_box_office_m is null or p_box_office_m < 0 then
    raise exception 'box office must be 0 or more, in $ millions (e.g. 81.4)';
  end if;
  if p_tomatometer is null or p_tomatometer < 0 or p_tomatometer > 100 then
    raise exception 'Tomatometer must be a whole number between 0 and 100';
  end if;

  update films set
    box_office_m = p_box_office_m,
    tomatometer  = p_tomatometer,
    screen_count = coalesce(p_screen_count, screen_count),
    captured_at  = now()
  where id = p_film_id;

  select score into v_score from films where id = p_film_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'capture_film',
          jsonb_build_object(
            'film_id', p_film_id, 'title', v_film.title,
            'box_office_m', p_box_office_m, 'tomatometer', p_tomatometer,
            'score', v_score,
            'recapture', v_film.captured_at is not null)
          || case when v_film.captured_at is not null then
               jsonb_build_object('old', jsonb_build_object(
                 'box_office_m', v_film.box_office_m,
                 'tomatometer', v_film.tomatometer,
                 'score', v_film.score))
             else '{}'::jsonb end);

  -- Once every active ELIGIBLE film has its numbers the week is scored.
  -- Ineligible films score for no one (ADR-011), so they don't hold this up.
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

-- ---------------------------------------------------------------------------
-- 2. v_standings — cumulative points / spent / efficiency per member
--    (rulebook §7, §7.1). security_invoker: the view runs under the caller's
--    own RLS, so it can never reveal more than the tables themselves —
--    winning bids only exist on locked-or-later weeks, which every season
--    member can already read; open-week bids have is_winning NULL and are
--    excluded by the join. Uncaptured films have NULL score and simply don't
--    count yet, which is what makes the standings "live" as capture happens.
-- ---------------------------------------------------------------------------
create view public.v_standings
with (security_invoker = true)
as
select
  sm.season_id,
  sm.id                               as season_member_id,
  pr.display_name,
  sm.role,
  count(b.id)::integer                as films_owned,
  coalesce(sum(f.score), 0)::numeric  as points,
  coalesce(sum(b.amount), 0)::integer as spent,
  -- Efficiency = points per dollar spent; NULL until the member has spent.
  case when coalesce(sum(b.amount), 0) > 0
       then round(coalesce(sum(f.score), 0) / sum(b.amount), 3)
  end                                 as efficiency
from season_members sm
join profiles pr on pr.id = sm.profile_id
left join (
  bids b
  -- Removed films drop out here: refund-by-derivation (build plan §3).
  join films f on f.id = b.film_id and f.status = 'active'
) on b.season_member_id = sm.id and b.is_winning
group by sm.season_id, sm.id, pr.display_name, sm.role;

-- ---------------------------------------------------------------------------
-- 3. Grants — ADR-004 deliberate exposure.
-- ---------------------------------------------------------------------------
grant select on public.v_standings to authenticated, service_role;

revoke all on function public.capture_film(uuid, numeric, integer, integer) from public, anon;
grant execute on function public.capture_film(uuid, numeric, integer, integer) to authenticated;
