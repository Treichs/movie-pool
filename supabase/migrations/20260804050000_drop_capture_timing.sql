-- ============================================================================
-- capture_timing is REMOVED. It never controlled anything.
--
-- The setting has existed since the phase-1 schema and was read at exactly two
-- places: a label on the week page ("as of Monday morning"), and the two forms
-- that wrote it back. No cron consulted it — the two scheduled jobs are the
-- deadline notifier and the Tomatometer cache, and neither looks at it — and no
-- gate, trigger or RPC branched on its value. Capture has always been manual:
-- the commissioner types the box office and the Tomatometer, whenever they do.
--
-- So the field asked a question, stored the answer, and then acted as though
-- the answer had been implemented. That is worse than absent: a commissioner
-- who set "Sunday estimates" had every reason to believe something in the app
-- would behave differently, and nothing did. Removing it is the honest fix; a
-- reworded description would have kept a control whose only job was to be
-- explained away.
--
-- Also drops the rule_configs COMPATIBILITY VIEW, which is dead. ADR-059
-- replaced per-season rule_configs with league_settings and left the view
-- behind for callers that had not moved; the cleanup migration was filed and
-- never written. Nothing references it now — not the app, not a spike, not
-- another function (checked against pg_proc and pg_get_viewdef, not by grep) —
-- and it is the only other object that mentions capture_timing, so it has to
-- go for the column to drop anyway. That closes half of the filed
-- adr059-cleanup task; films.screen_count is the remaining half.
-- ============================================================================

-- The view first: it selects the column, so the column cannot drop under it.
drop view if exists public.rule_configs;

-- update_league_settings must be DROPPED, not replaced. `create or replace`
-- with a different argument list produces an OVERLOAD rather than a
-- replacement, and PostgREST calling the 14-argument form would then match two
-- candidates and fail as ambiguous — the same trap 20260803060000 documented
-- for create_league.
drop function if exists public.update_league_settings(
  uuid, integer, integer, integer, text, integer, jsonb, integer, time, text,
  text, integer, boolean, boolean, smallint[]);

alter table public.league_settings drop column if exists capture_timing;

-- Recreated from the LIVE definition (pg_get_functiondef), with p_capture_timing
-- and its two references removed and nothing else touched.
create or replace function public.update_league_settings(
  p_league_id                uuid,
  p_fake_bankroll            integer,
  p_top_n_distinct           integer,
  p_min_bid                  integer,
  p_buy_in                   integer,
  p_payout_structure         jsonb,
  p_bids_due_dow             integer,
  p_bids_due_time            time,
  p_bids_due_tz              text,
  p_league_type              text default 'cash',
  p_default_season_length    integer default 10,
  p_include_limited_releases boolean default false,
  p_side_bets_enabled        boolean default true,
  p_box_office_days          smallint[] default '{5,6,7}'
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old league_settings%rowtype;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can change the league settings';
  end if;

  select * into v_old from league_settings where league_id = p_league_id for update;
  if not found then
    raise exception 'league has no settings row';
  end if;

  update league_settings set
    fake_bankroll            = p_fake_bankroll,
    top_n_distinct           = p_top_n_distinct,
    min_bid                  = p_min_bid,
    buy_in                   = p_buy_in,
    payout_structure         = p_payout_structure,
    bids_due_dow             = p_bids_due_dow,
    bids_due_time            = p_bids_due_time,
    bids_due_tz              = p_bids_due_tz,
    league_type              = p_league_type,
    default_season_length    = p_default_season_length,
    include_limited_releases = p_include_limited_releases,
    side_bets_enabled        = p_side_bets_enabled,
    box_office_days          = p_box_office_days
  where league_id = p_league_id;

  -- ADR-059 makes every settings change LIVE for the running season, so the
  -- audit trail always records old and new — there is no draft grace period
  -- in which a change touches nothing.
  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'update_league_settings',
          jsonb_build_object(
            'league_id', p_league_id,
            'old', to_jsonb(v_old) - 'id' - 'league_id' - 'created_at',
            'new', jsonb_build_object(
              'fake_bankroll', p_fake_bankroll,
              'top_n_distinct', p_top_n_distinct,
              'min_bid', p_min_bid,
              'buy_in', p_buy_in,
              'payout_structure', p_payout_structure,
              'bids_due_dow', p_bids_due_dow,
              'bids_due_time', p_bids_due_time,
              'bids_due_tz', p_bids_due_tz,
              'league_type', p_league_type,
              'default_season_length', p_default_season_length,
              'include_limited_releases', p_include_limited_releases,
              'side_bets_enabled', p_side_bets_enabled,
              'box_office_days', p_box_office_days)));
end;
$$;

revoke all on function public.update_league_settings(
  uuid, integer, integer, integer, integer, jsonb, integer, time, text,
  text, integer, boolean, boolean, smallint[]) from public, anon;
grant execute on function public.update_league_settings(
  uuid, integer, integer, integer, integer, jsonb, integer, time, text,
  text, integer, boolean, boolean, smallint[]) to authenticated;
