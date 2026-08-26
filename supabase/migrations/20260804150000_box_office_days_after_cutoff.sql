-- Box-office days must fall AFTER the bids-due day (2026-08-04).
--
-- The two settings were independent, and one combination of them is incoherent:
-- a box-office day on or before the cutoff counts grosses from a day that had
-- already happened when bidding closed — or, worse, from days before the film
-- opens at all, since the week's Monday precedes its Friday opening. A league
-- could set "bids due Thursday" and "count Monday's box office" and the app
-- would score it without complaint.
--
-- The rule is the developer's, stated as the form's behaviour: choose Thursday
-- as the cutoff and Monday through Thursday stop being selectable. It is
-- enforced here as well as there, because a gate that exists only in a form is
-- not a gate — the RPC is the boundary, and the form is the courtesy.
--
-- It also fixes the ORDER these are entered in: the cutoff has to be chosen
-- before the days, since it decides which days are available. The form is
-- reordered to match.
--
-- No existing league violates this (checked before writing), so there is
-- nothing to migrate — this only refuses future bad combinations. Body from the
-- definition 20260804130000 installed, with the validation block added.

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

  -- THE RULE. Every counted day must come after bidding has closed.
  select array_agg(d order by d) into v_bad
  from unnest(p_box_office_days) d
  where d <= p_bids_due_dow;

  if v_bad is not null then
    raise exception
      'box office cannot be counted on % — bidding is still open until %. Pick days after the cutoff.',
      (select string_agg(to_char(to_timestamp(d::text, 'ID'), 'FMDay'), ', ') from unnest(v_bad) d),
      to_char(to_timestamp(p_bids_due_dow::text, 'ID'), 'FMDay');
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

  -- ADR-059's promise, kept since 20260804130000: the bids-due trio is a
  -- DEFAULT, and every week still being played that has not been pinned by
  -- hand follows it. sync_week_deadlines will not move a deadline into the
  -- past, so a live week keeps the cutoff its players were promised.
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
