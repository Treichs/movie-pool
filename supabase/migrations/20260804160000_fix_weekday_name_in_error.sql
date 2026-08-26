-- Fix the weekday names in update_league_settings' error (2026-08-04).
-- Corrects 20260804150000.
--
-- I wrote `to_char(to_timestamp(d::text, 'ID'), 'FMDay')` expecting it to turn
-- an ISO weekday NUMBER into that day's name. It does not: 'ID' as an INPUT
-- pattern does not seek to a weekday, so every number rendered as the same
-- fixed date's day — 1, 2, 3 and 4 all came out "Saturday". The refusal was
-- correct and its explanation was nonsense, which is the worse half to get
-- wrong: a commissioner would have been told to avoid Saturday while Saturday
-- was one of the days still allowed.
--
-- Caught by running the expression rather than reading it. An array lookup is
-- the whole fix, and it lives in one function so both the name and the
-- Monday=1 convention have a single home.

create or replace function public.iso_weekday_name(p_dow integer)
returns text
language sql immutable
as $$
  -- ISO 8601: Monday is 1, Sunday is 7 — the same convention bids_due_dow and
  -- box_office_days use, and the one extract(isodow) returns.
  select (array['Monday','Tuesday','Wednesday','Thursday',
                'Friday','Saturday','Sunday'])[p_dow];
$$;

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
  r     record;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can change the league settings';
  end if;

  if p_box_office_days is null or array_length(p_box_office_days, 1) is null then
    raise exception 'at least one box-office day must be counted';
  end if;

  -- Every counted day must come after bidding has closed.
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

  -- ADR-059's promise, kept since 20260804130000.
  for r in select id from seasons where league_id = p_league_id and status = 'active' loop
    perform sync_week_deadlines(r.id);
  end loop;

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
