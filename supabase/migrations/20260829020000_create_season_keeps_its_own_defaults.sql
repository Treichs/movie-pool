-- ---------------------------------------------------------------------------
-- create_season stops inserting the nulls it was handed.
--
-- THE TRAP. Every settings parameter on this function is `default null`, which
-- reads as "omit it and the column default applies". It does not: the frozen
-- branch names all twelve columns in its INSERT, so an omitted parameter is
-- inserted AS NULL — and `buy_in`, `payout_structure`, `bids_due_time`,
-- `bids_due_tz` and `default_season_length` are all NOT NULL with perfectly
-- good defaults sitting unused on the table.
--
-- The practical shape of it: passing `p_fake_bankroll` is what flips the branch
-- on, so ANY caller that sets a bankroll must also set all four of the others
-- or the insert fails on a not-null violation. Found on 2026-08-29 by the
-- /leagues/new wizard, which sets bankroll, tiers, minimum bid and the bid
-- deadline — a sensible set of house rules — and got
-- "null value in column buy_in of relation season_settings violates not-null
-- constraint". `/leagues/[leagueId]/seasons/new` would have hit it next.
--
-- THE FIX INSERTS THE ROW WITH ITS DEFAULTS AND THEN OVERWRITES WHAT WAS
-- ACTUALLY SUPPLIED. `coalesce(p_x, x)` reads the value the table just
-- defaulted to, so the defaults stay in exactly one place — the column
-- definitions — instead of being copied into this function, or worse into
-- application code, where they would drift the first time one changed.
--
-- Nothing else about the function moves: the same gates, the same practice-league
-- neutralisation of buy-in and side bets, the same roster copy, schedule seed
-- and audit row. Only the frozen branch's write changes.
-- ---------------------------------------------------------------------------

create or replace function public.create_season(
  p_league_id             uuid,
  p_first_opening_date    date,
  p_fake_bankroll         integer default null,
  p_top_n_distinct        integer default null,
  p_min_bid               integer default null,
  p_buy_in                integer default null,
  p_payout_structure      jsonb   default null,
  p_bids_due_dow          integer default null,
  p_bids_due_time         time without time zone default null,
  p_bids_due_tz           text    default null,
  p_default_season_length integer default null,
  p_side_bets_enabled     boolean default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id   uuid;
  v_league_type text;
  v_frozen      boolean := p_fake_bankroll is not null;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can start a season';
  end if;

  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league not found';
  end if;

  if p_first_opening_date is null then
    raise exception 'the season needs a first opening date (ADR-099: a season cannot exist without a schedule)';
  end if;

  if exists (
    select 1 from seasons
    where league_id = p_league_id and status in ('draft', 'active')
  ) then
    raise exception
      'this league already has a season under way — finish it before starting the next';
  end if;

  select league_type into v_league_type from league_settings where league_id = p_league_id;
  v_league_type := coalesce(v_league_type, 'cash');

  insert into seasons (league_id, created_by, status)
  values (p_league_id, auth.uid(), 'active')
  returning id into v_season_id;

  if v_frozen then
    if p_bids_due_dow is null or p_bids_due_dow < 1 or p_bids_due_dow > 4 then
      raise exception 'bids are due Monday through Thursday (1-4)';
    end if;

    -- Every column default applies here...
    insert into season_settings (season_id, league_type)
    values (v_season_id, v_league_type);

    -- ...and only what the caller actually supplied overwrites it.
    update season_settings set
      fake_bankroll         = coalesce(p_fake_bankroll, fake_bankroll),
      top_n_distinct        = coalesce(p_top_n_distinct, top_n_distinct),
      min_bid               = coalesce(p_min_bid, min_bid),
      buy_in                = case when v_league_type = 'practice' then 0
                                   else coalesce(p_buy_in, buy_in) end,
      payout_structure      = coalesce(p_payout_structure, payout_structure),
      bids_due_dow          = p_bids_due_dow,
      bids_due_time         = coalesce(p_bids_due_time, bids_due_time),
      bids_due_tz           = coalesce(p_bids_due_tz, bids_due_tz),
      default_season_length = coalesce(p_default_season_length, default_season_length),
      side_bets_enabled     = case when v_league_type = 'practice' then false
                                   else coalesce(p_side_bets_enabled, side_bets_enabled) end
    where season_id = v_season_id;
  else
    -- Phase-1 compatibility: copy the snapshot from league_settings.
    insert into season_settings (
      season_id, fake_bankroll, top_n_distinct, min_bid, buy_in, payout_structure,
      bids_due_dow, bids_due_time, bids_due_tz, league_type, default_season_length,
      include_limited_releases, side_bets_enabled, box_office_days
    )
    select v_season_id, ls.fake_bankroll, ls.top_n_distinct, ls.min_bid, ls.buy_in,
           ls.payout_structure, ls.bids_due_dow, ls.bids_due_time, ls.bids_due_tz,
           ls.league_type, ls.default_season_length, ls.include_limited_releases,
           ls.side_bets_enabled, ls.box_office_days
    from league_settings ls where ls.league_id = p_league_id;
  end if;

  insert into season_members (season_id, profile_id, role)
  select v_season_id, lm.profile_id, lm.role
  from league_members lm where lm.league_id = p_league_id;

  perform seed_season_weeks(
    v_season_id, p_first_opening_date, coalesce(p_default_season_length, 10));

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('league_id', p_league_id,
                             'first_opening_date', p_first_opening_date,
                             'frozen_settings', v_frozen,
                             'league_type', v_league_type));

  return v_season_id;
end;
$$;
