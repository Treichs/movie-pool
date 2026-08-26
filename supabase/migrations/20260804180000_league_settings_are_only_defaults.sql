-- update_league_settings stops reaching into a running season (2026-08-04).
--
-- 20260804130000 taught it to re-sync every active season's week deadlines,
-- because at that point the league row WAS what a season obeyed and ADR-059
-- promised changes were live. 20260804170000 gave seasons their own settings,
-- so both halves of that reasoning are gone: a running season reads its own
-- row, and the league row is the default the NEXT season is seeded from.
--
-- Leaving the sync in would be the worst of both models — the league would
-- silently move the weeks of a season whose rules it no longer governs, and the
-- deadline would be the one setting that still leaked across the boundary
-- everything else now respects.
--
-- Week deadlines follow the SEASON's bids-due trio, and update_season_settings
-- is what re-syncs them.

create or replace function public.update_league_settings(
  p_league_id uuid,
  p_fake_bankroll integer,
  p_top_n_distinct integer,
  p_min_bid integer,
  p_buy_in integer,
  p_payout_structure jsonb,
  p_bids_due_dow integer,
  p_bids_due_time time without time zone,
  p_bids_due_tz text,
  p_league_type text default 'cash',
  p_default_season_length integer default 10,
  p_include_limited_releases boolean default false,
  p_side_bets_enabled boolean default true,
  p_box_office_days smallint[] default '{5,6,7}'::smallint[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old league_settings%rowtype;
  v_bad smallint[];
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can change the league settings';
  end if;

  if p_box_office_days is null or array_length(p_box_office_days, 1) is null then
    raise exception 'at least one box-office day must be counted';
  end if;

  -- The same rule the season form enforces: a counted day must fall after
  -- bidding closes. Checked here too because these values are what the next
  -- season is seeded from, and seeding must not import an impossible pair.
  select array_agg(d order by d) into v_bad
  from unnest(p_box_office_days) d
  where d <= p_bids_due_dow;
  if v_bad is not null then
    raise exception
      'box office cannot be counted on % — bidding is open until %. Pick days after the cutoff.',
      (select string_agg(iso_weekday_name(d), ', ') from unnest(v_bad) d),
      iso_weekday_name(p_bids_due_dow);
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

  -- NO week sync. These are the defaults the next season starts from; a season
  -- already under way carries its own copy and is not touched.
  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'update_league_settings',
          jsonb_build_object(
            'league_id', p_league_id,
            'scope', 'league defaults only — seasons under way are unaffected',
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
