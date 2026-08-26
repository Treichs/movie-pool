-- ============================================================================
-- SETTINGS REWORK — PHASE 1 (ADDITIVE, ZERO-DOWNTIME).
--
-- This phase adds everything the NEW code needs while KEEPING everything the
-- CURRENTLY-DEPLOYED code reads, so the live site keeps working the instant this
-- lands and stays working until the new code deploys. Nothing is dropped here.
-- Phase 2 (…_phase2_cleanup) removes the retired columns and old function paths
-- AFTER the new code is live and no longer references them.
--
-- What makes it backward-compatible:
--   • Retired columns (include_limited_releases, box_office_days) STAY — every
--     page-load read in the deployed app still resolves. New create_season omits
--     them, so they fall back to their column defaults.
--   • update_league_settings / update_season_settings STAY — the deployed rules
--     form still calls them. Phase 2 drops them once the form is read-only.
--   • create_league / create_season are REPLACED with supersets: new params
--     default to null and named-arg calls from the old code still match. When
--     create_season is called with no settings (the old path) it copies from the
--     league exactly as before; with settings, it freezes them (the new path).
--
-- Behavior changes that are safe for both old and new code:
--   • open_due_weeks → one week open at a time (reverts the two-week overlap).
--   • skip_week → cascades the open so a skipped weekend does not stall.
--   • seed_season_weeks → stops writing the display-only bids_open_at (made
--     nullable here; dropped in Phase 2). No src reads it.
--
-- Bodies start from the CURRENT live definitions (pg_get_functiondef 2026-08-05).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. bids_open_at becomes optional so the new seed can omit it while the column
--    still exists for Phase 2 to drop.
-- ---------------------------------------------------------------------------
alter table public.weeks alter column bids_open_at drop not null;

-- ---------------------------------------------------------------------------
-- 1. create_league — superset carrying league_type. Old 3-arg callers pass
--    named p_name/p_avatar_pair/p_avatar_glyph and match this with p_league_type
--    defaulting; new callers pass p_league_type too. ONE function, no overload.
--    DROP + create because the arg list changes.
-- ---------------------------------------------------------------------------
drop function if exists public.create_league(text, smallint, text);

create or replace function public.create_league(
  p_name         text,
  p_league_type  text     default 'cash',
  p_avatar_pair  smallint default null,
  p_avatar_glyph text     default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_league_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'league needs a name';
  end if;
  if coalesce(p_league_type, 'cash') not in ('cash', 'practice') then
    raise exception 'league type must be cash or practice';
  end if;

  insert into leagues (name, created_by, season_start_number, avatar_pair, avatar_glyph)
  values (trim(p_name), auth.uid(), 1, p_avatar_pair,
          nullif(trim(coalesce(p_avatar_glyph, '')), ''))
  returning id into v_league_id;

  insert into league_members (league_id, profile_id, role)
  values (v_league_id, auth.uid(), 'commissioner');

  insert into league_settings (league_id, league_type)
  values (v_league_id, coalesce(p_league_type, 'cash'));

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name),
                             'league_type', coalesce(p_league_type, 'cash')));

  return v_league_id;
end;
$$;

grant execute on function public.create_league(text, text, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_season — superset. Old callers pass only p_league_id and get the
--    historical copy-from-league behavior (the null branch); new callers pass
--    the full settings and freeze them. Phase 2 removes the old branch. league_
--    type always comes from the league. DROP + create (arg list changes).
-- ---------------------------------------------------------------------------
drop function if exists public.create_season(uuid);

create or replace function public.create_season(
  p_league_id             uuid,
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
  v_league      leagues%rowtype;
  v_league_type text;
  v_number      integer;
  v_name        text;
  v_frozen      boolean := p_fake_bankroll is not null;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can start a season';
  end if;

  select * into v_league from leagues where id = p_league_id;
  if not found then
    raise exception 'league not found';
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

  select v_league.season_start_number + count(*) into v_number
  from seasons where league_id = p_league_id;
  v_name := 'Season ' || v_number;

  insert into seasons (name, league_id, created_by, status)
  values (v_name, p_league_id, auth.uid(), 'active')
  returning id into v_season_id;

  if v_frozen then
    -- NEW: freeze the settings the wizard collected. buy_in / side bets are
    -- meaningless for a practice league, so they are neutralised rather than
    -- trusted from the form. The two retired columns are omitted and fall back
    -- to their season_settings defaults (Phase 2 drops them).
    if p_bids_due_dow is null or p_bids_due_dow < 1 or p_bids_due_dow > 4 then
      raise exception 'bids are due Monday through Thursday (1-4)';
    end if;
    insert into season_settings (
      season_id, fake_bankroll, top_n_distinct, min_bid, buy_in, payout_structure,
      bids_due_dow, bids_due_time, bids_due_tz, league_type, default_season_length,
      side_bets_enabled
    )
    values (
      v_season_id, p_fake_bankroll, p_top_n_distinct, p_min_bid,
      case when v_league_type = 'practice' then 0 else p_buy_in end,
      p_payout_structure, p_bids_due_dow, p_bids_due_time, p_bids_due_tz,
      v_league_type, p_default_season_length,
      case when v_league_type = 'practice' then false else coalesce(p_side_bets_enabled, true) end
    );
  else
    -- OLD (Phase-1 compatibility): copy the snapshot from league_settings, as
    -- create_season(uuid) always did. Removed in Phase 2.
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

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('name', v_name, 'league_id', p_league_id,
                             'number', v_number,
                             'settings_source', case when v_frozen then 'frozen at creation' else 'league' end));

  return v_season_id;
end;
$$;

grant execute on function public.create_season(
  uuid, integer, integer, integer, integer, jsonb, integer,
  time without time zone, text, integer, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. open_due_weeks — ONE week open at a time, opened by the previous close.
--    DISTINCT ON (season_id) opens only the earliest draft-with-slate per
--    season, and the not-exists guard is the one-open invariant. The global
--    clock (week_bids_open_at) is no longer consulted. Behaviour-only change:
--    both old and new code call this the same way.
-- ---------------------------------------------------------------------------
create or replace function public.open_due_weeks(p_season_id uuid default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_opened integer := 0;
  r record;
begin
  for r in
    select distinct on (w.season_id) w.id, w.season_id, w.number
    from weeks w
    join seasons s on s.id = w.season_id
    where w.status = 'draft'
      and s.status = 'active'
      and (p_season_id is null or w.season_id = p_season_id)
      and not exists (
        select 1 from weeks g
        where g.season_id = w.season_id and g.status = 'open'
      )
      and exists (
        select 1 from films f
        where f.week_id = w.id and f.status = 'active' and f.eligible
      )
    order by w.season_id, w.number
  loop
    update weeks set status = 'open' where id = r.id;
    insert into audit_log (season_id, actor, action, detail)
    values (r.season_id, auth.uid(), 'open_week',
            jsonb_build_object('week_id', r.id, 'week_number', r.number,
                               'on_clock', true));
    v_opened := v_opened + 1;
  end loop;

  return v_opened;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. skip_week — cascades the open so a skipped weekend hands the slot on.
-- ---------------------------------------------------------------------------
create or replace function public.skip_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week  weeks%rowtype;
  v_films integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can skip a week';
  end if;

  if v_week.status = 'skipped' then
    raise exception 'this week is already skipped';
  end if;
  if v_week.status <> 'draft' then
    raise exception 'only a week that has not opened can be skipped (status: %)',
      v_week.status;
  end if;

  select count(*) into v_films
  from films f
  where f.week_id = p_week_id and f.status = 'active';
  if v_films > 0 then
    raise exception 'this week has % film(s) on its slate — take them off before skipping it',
      v_films;
  end if;

  update weeks set status = 'skipped' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'skip_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number));

  perform open_due_weeks(v_week.season_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. seed_season_weeks — no longer writes the display-only bids_open_at (now
--    nullable; dropped in Phase 2). Gate and deadline seeding unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.seed_season_weeks(p_season_id uuid, p_first_opening_date date, p_week_count integer)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_config   league_settings%rowtype;
  v_opening  date;
  v_week_of  date;
  v_deadline timestamptz;
  i          integer;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can lay out the season';
  end if;
  if p_first_opening_date is null then
    raise exception 'the season needs a first opening date';
  end if;
  if p_week_count is null or p_week_count < 1 or p_week_count > 52 then
    raise exception 'a season runs between 1 and 52 weeks';
  end if;
  if exists (select 1 from weeks where season_id = p_season_id) then
    raise exception 'this season already has weeks — add or remove them individually';
  end if;

  v_config := settings_for_season(p_season_id);

  v_week_of  := p_first_opening_date - (extract(isodow from p_first_opening_date)::int - 1);
  v_deadline := league_default_bid_deadline(v_week_of, v_config.bids_due_dow,
                                            v_config.bids_due_time, v_config.bids_due_tz);
  if v_deadline <= now() then
    raise exception
      'bids for that first weekend were due % — the week would open and never close. Start the season a week later, or move the bids-due day.',
      to_char(v_deadline at time zone v_config.bids_due_tz, 'FMDay FMDD Mon at FMHH12:MIam');
  end if;

  for i in 0 .. p_week_count - 1 loop
    v_opening  := p_first_opening_date + (i * 7);
    v_week_of  := v_opening - (extract(isodow from v_opening)::int - 1);
    v_deadline := league_default_bid_deadline(v_week_of, v_config.bids_due_dow,
                                              v_config.bids_due_time, v_config.bids_due_tz);

    insert into weeks (season_id, number, opening_date, bid_deadline)
    values (p_season_id, i + 1, v_opening, v_deadline);
  end loop;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'seed_season_weeks',
          jsonb_build_object('week_count', p_week_count,
                             'first_opening_date', p_first_opening_date,
                             'last_opening_date',
                               p_first_opening_date + ((p_week_count - 1) * 7)));

  return p_week_count;
end;
$$;
