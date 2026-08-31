-- ============================================================================
-- PHASE 2, PART TWO — DROP `include_limited_releases` AND `box_office_days`.
--
-- The 2026-08-05 rework listed both as RETIRED and kept them only so the
-- then-deployed app would not break:
--
--   "Retired columns (include_limited_releases, box_office_days) STAY … Phase 2
--    (…_phase2_cleanup) removes the retired columns and old function paths
--    AFTER the new code is live and no longer references them."
--
-- The new code went live and Phase 2 was never written, so both columns
-- outlived their own retirement by four weeks. ADR-078 had already replaced
-- what they described: eligibility is a per-film call the commissioner makes at
-- settlement (`films.eligible`), and the box-office capture window went with
-- it. Nothing has branched on either since — verified 2026-08-31 against the
-- live database: no view, no index, no policy reads them, and the only
-- app-side references were the settings form carrying them through untouched.
--
-- THE UI TOGGLE WENT FIRST (7ebf231, 2026-08-31). "Include limited releases"
-- had been a switch that saved, re-rendered your choice, and changed nothing.
--
-- WHAT CHANGES FOR CALLERS. `update_league_settings` and
-- `update_season_settings` lose two parameters each, so both are DROP + CREATE
-- rather than REPLACE. `settings_for_season` returns `league_settings`, whose
-- row type narrows with the table — its callers name columns individually and
-- are unaffected.
--
-- ONE VALIDATION IS DELIBERATELY LOST: both update functions refused a
-- box-office day that fell on or before the bidding cutoff. It guarded a value
-- nothing reads, and there is no longer a way to express the impossible pair.
--
-- THE ONLY NON-DEFAULT DATA IN ANY OF THESE COLUMNS, recorded here because the
-- column is about to stop existing and this file is where a reader will look:
--
--   include_limited_releases  false on all 32 rows. No information to lose.
--   box_office_days           default '{5,6,7}' (Fri–Sun) everywhere EXCEPT
--                             the league "Personal Pool" and its season 1,
--                             both '{3,4,5,6,7}' — Wednesday through Sunday.
--   weeks.bids_open_at        163 of 194 non-null, all derived from
--                             opening_date and the timezone (part one).
--
-- That Wednesday–Sunday window is a real preference someone expressed. It has
-- never had any effect — no code has read the column since ADR-078 — and there
-- is no surface left that could honour it. If counting box office from midweek
-- is wanted again it comes back as a new decision, not as a resurrected column.
--
-- Function bodies below are the LIVE definitions (pg_get_functiondef,
-- 2026-08-31) with only the retired-column lines removed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. settings_for_season — stops assigning the two onto the row it returns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settings_for_season(p_season_id uuid)
 RETURNS league_settings
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.league_settings%rowtype;
  s public.season_settings%rowtype;
begin
  -- The league row still supplies id/league_id, and remains the answer for a
  -- season created before this migration ran and somehow missed the backfill.
  select ls.* into v
  from league_settings ls
  join seasons se on se.league_id = ls.league_id
  where se.id = p_season_id;
  if not found then
    return v; -- all-null: the old "season has no rule configuration" signal
  end if;

  select * into s from season_settings where season_id = p_season_id;
  if not found then
    return v;
  end if;

  v.fake_bankroll            := s.fake_bankroll;
  v.top_n_distinct           := s.top_n_distinct;
  v.min_bid                  := s.min_bid;
  v.buy_in                   := s.buy_in;
  v.payout_structure         := s.payout_structure;
  v.bids_due_dow             := s.bids_due_dow;
  v.bids_due_time            := s.bids_due_time;
  v.bids_due_tz              := s.bids_due_tz;
  v.league_type              := s.league_type;
  v.default_season_length    := s.default_season_length;
  v.side_bets_enabled        := s.side_bets_enabled;
  return v;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 2. create_season — stops copying them from the league's defaults.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_season(p_league_id uuid, p_first_opening_date date, p_fake_bankroll integer DEFAULT NULL::integer, p_top_n_distinct integer DEFAULT NULL::integer, p_min_bid integer DEFAULT NULL::integer, p_buy_in integer DEFAULT NULL::integer, p_payout_structure jsonb DEFAULT NULL::jsonb, p_bids_due_dow integer DEFAULT NULL::integer, p_bids_due_time time without time zone DEFAULT NULL::time without time zone, p_bids_due_tz text DEFAULT NULL::text, p_default_season_length integer DEFAULT NULL::integer, p_side_bets_enabled boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    insert into season_settings (season_id, league_type)
    values (v_season_id, v_league_type);

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
    insert into season_settings (
      season_id, fake_bankroll, top_n_distinct, min_bid, buy_in, payout_structure,
      bids_due_dow, bids_due_time, bids_due_tz, league_type, default_season_length,
      side_bets_enabled
    )
    select v_season_id, ls.fake_bankroll, ls.top_n_distinct, ls.min_bid, ls.buy_in,
           ls.payout_structure, ls.bids_due_dow, ls.bids_due_time, ls.bids_due_tz,
           ls.league_type, ls.default_season_length, ls.side_bets_enabled
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
$function$
;

-- ---------------------------------------------------------------------------
-- 3. ingest_completed_season — stops reading them out of the payload.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_completed_season(p_league_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_number     integer;
  v_derived    integer;
  v_created    timestamptz;
  v_settings   jsonb;
  v_top_n      integer;
  v_bankroll   integer;
  v_season_id  uuid;
  v_row        record;
  v_week       record;
  v_film       record;
  v_bid        record;
  v_film_id    uuid;
  v_prev_date  date := null;
  v_n_weeks    integer;
  v_n_final    integer := 0;
  v_n_skipped  integer := 0;
  v_n_films    integer := 0;
  v_n_bids     integer := 0;
  v_n_winning  integer;
  v_n_suppress integer;
begin
  -- ---- league ------------------------------------------------------------
  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league % not found', p_league_id;
  end if;
  perform 1 from leagues where id = p_league_id for update;

  -- ---- season header -----------------------------------------------------
  v_number  := (p_payload #>> '{season,number}')::integer;
  if v_number is null or v_number < 1 then
    raise exception 'season.number must be a positive integer';
  end if;
  v_created := (p_payload #>> '{season,created_at}')::timestamptz;
  if v_created is null or v_created >= now() then
    raise exception 'season.created_at must be a past timestamp (the backdate that orders League Home)';
  end if;

  -- ---- REDO GUARD: this league already holds one of these weeks -----------
  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'weeks') e
    join weeks w
      on w.week_of = ((e ->> 'opening_date')::date
                      - (extract(isodow from (e ->> 'opening_date')::date)::int - 1))
    join seasons s on s.id = w.season_id
    where s.league_id = p_league_id
  ) then
    raise exception
      'this league already holds one of these calendar weeks — call remove_ingested_season on the existing season first if this is a redo';
  end if;

  -- ---- settings (complete row, validated) ---------------------------------
  v_settings := p_payload #> '{season,settings}';
  if v_settings is null then
    raise exception 'season.settings is required (a season is seeded complete)';
  end if;
  v_bankroll := (v_settings ->> 'fake_bankroll')::integer;
  v_top_n    := (v_settings ->> 'top_n_distinct')::integer;
  if v_bankroll is null or v_bankroll <= 0 then raise exception 'settings.fake_bankroll must be > 0'; end if;
  if v_top_n is null or v_top_n < 1 then raise exception 'settings.top_n_distinct must be >= 1'; end if;
  if (v_settings ->> 'min_bid')::integer is null or (v_settings ->> 'min_bid')::integer < 1 then
    raise exception 'settings.min_bid must be >= 1';
  end if;
  if (v_settings ->> 'buy_in')::integer is null or (v_settings ->> 'buy_in')::integer < 0 then
    raise exception 'settings.buy_in must be >= 0';
  end if;
  if jsonb_typeof(v_settings -> 'payout_structure') is distinct from 'object' then
    raise exception 'settings.payout_structure must be an object';
  end if;
  if (v_settings ->> 'bids_due_dow')::integer not between 1 and 4 then
    raise exception 'settings.bids_due_dow must be 1..4';
  end if;
  if (v_settings ->> 'league_type') not in ('cash', 'practice') then
    raise exception 'settings.league_type must be cash or practice';
  end if;
  if (v_settings ->> 'default_season_length')::integer not between 1 and 52 then
    raise exception 'settings.default_season_length must be 1..52';
  end if;

  -- ---- roster -------------------------------------------------------------
  if jsonb_typeof(p_payload -> 'roster') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'roster') < 1 then
    raise exception 'roster must be a non-empty array';
  end if;
  for v_row in
    select (e ->> 'profile_id')::uuid as profile_id, e ->> 'role' as role
    from jsonb_array_elements(p_payload -> 'roster') e
  loop
    if v_row.profile_id is null then raise exception 'roster entry missing profile_id'; end if;
    if v_row.role not in ('player', 'commissioner') then
      raise exception 'roster role must be player or commissioner, got %', v_row.role;
    end if;
    if not exists (select 1 from profiles where id = v_row.profile_id) then
      raise exception 'roster profile % does not exist — mint placeholder accounts before calling ingest', v_row.profile_id;
    end if;
  end loop;
  if (select count(distinct e ->> 'profile_id') from jsonb_array_elements(p_payload -> 'roster') e)
     <> jsonb_array_length(p_payload -> 'roster') then
    raise exception 'roster contains a duplicate profile_id';
  end if;

  -- ---- weeks --------------------------------------------------------------
  if jsonb_typeof(p_payload -> 'weeks') is distinct from 'array'
     or jsonb_array_length(p_payload -> 'weeks') < 1 then
    raise exception 'weeks must be a non-empty array';
  end if;
  v_n_weeks := jsonb_array_length(p_payload -> 'weeks');
  for v_week in
    select (w.elem ->> 'number')::integer      as number,
           (w.elem ->> 'opening_date')::date   as opening_date,
           w.elem ->> 'status'                 as status,
           w.ord
    from jsonb_array_elements(p_payload -> 'weeks') with ordinality as w(elem, ord)
    order by w.ord
  loop
    if v_week.number is distinct from v_week.ord::integer then
      raise exception 'weeks must be numbered exactly 1..N in order; position % carries number %',
        v_week.ord, v_week.number;
    end if;
    if v_week.opening_date is null then
      raise exception 'week % has no opening_date', v_week.number;
    end if;
    if v_prev_date is not null and v_week.opening_date <= v_prev_date then
      raise exception 'week % opening_date % does not ascend past week %''s %',
        v_week.number, v_week.opening_date, v_week.number - 1, v_prev_date;
    end if;
    v_prev_date := v_week.opening_date;
    if v_week.status not in ('final', 'skipped') then
      raise exception 'week % status must be final or skipped (a completed season has no live weeks), got %',
        v_week.number, v_week.status;
    end if;
  end loop;

  -- ---- films: structural checks against their weeks -----------------------
  if jsonb_typeof(p_payload -> 'films') is distinct from 'array' then
    raise exception 'films must be an array';
  end if;
  for v_film in
    select (e ->> 'week')::integer          as week,
           e ->> 'title'                    as title,
           (e ->> 'box_office_m')::numeric  as box_office_m,
           (e ->> 'tomatometer')::integer   as tomatometer,
           (e ->> 'tmdb_id')::integer       as tmdb_id,
           e -> 'bids'                      as bids
    from jsonb_array_elements(p_payload -> 'films') e
  loop
    if v_film.week is null or v_film.week < 1 or v_film.week > v_n_weeks then
      raise exception 'film "%" references week %, outside 1..%', v_film.title, v_film.week, v_n_weeks;
    end if;
    if (p_payload -> 'weeks' -> (v_film.week - 1) ->> 'status') = 'skipped' then
      raise exception 'film "%" sits on skipped week % — skipped weeks own no films', v_film.title, v_film.week;
    end if;
    if v_film.title is null or length(trim(v_film.title)) = 0 then
      raise exception 'film on week % has no title', v_film.week;
    end if;
    if v_film.box_office_m is null or v_film.box_office_m < 0 then
      raise exception 'film "%" must carry box_office_m >= 0 (a final week is fully captured)', v_film.title;
    end if;
    if v_film.tomatometer is null or v_film.tomatometer not between 0 and 100 then
      raise exception 'film "%" must carry tomatometer 0..100', v_film.title;
    end if;
    if v_film.tmdb_id is not null
       and not exists (select 1 from film_catalog fc where fc.tmdb_id = v_film.tmdb_id) then
      raise exception 'film "%" names tmdb_id % which is not in film_catalog — upsert the catalog first',
        v_film.title, v_film.tmdb_id;
    end if;
    if jsonb_typeof(v_film.bids) is distinct from 'array' then
      raise exception 'film "%" bids must be an array (possibly empty)', v_film.title;
    end if;
    for v_bid in
      select (b ->> 'profile_id')::uuid as profile_id, (b ->> 'amount')::integer as amount
      from jsonb_array_elements(v_film.bids) b
    loop
      if v_bid.amount is null or v_bid.amount < 0 then
        raise exception 'bid on "%" must be a whole dollar amount >= 0', v_film.title;
      end if;
      if not exists (
        select 1 from jsonb_array_elements(p_payload -> 'roster') r
        where (r ->> 'profile_id')::uuid = v_bid.profile_id
      ) then
        raise exception 'bid on "%" names profile % who is not on the season roster', v_film.title, v_bid.profile_id;
      end if;
    end loop;
  end loop;

  -- Every final week must carry at least one film.
  for v_week in
    select (e ->> 'number')::integer as number, e ->> 'status' as status
    from jsonb_array_elements(p_payload -> 'weeks') e
  loop
    if v_week.status = 'final' and not exists (
      select 1 from jsonb_array_elements(p_payload -> 'films') f
      where (f ->> 'week')::integer = v_week.number
    ) then
      raise exception 'final week % has no films', v_week.number;
    end if;
  end loop;

  -- ---- writes -------------------------------------------------------------
  insert into seasons (league_id, status, created_by, created_at)
  values (p_league_id, 'completed', null, v_created)
  returning id into v_season_id;

  insert into season_settings (
    season_id, fake_bankroll, top_n_distinct, min_bid, buy_in, payout_structure,
    bids_due_dow, bids_due_time, bids_due_tz, league_type, default_season_length,
    side_bets_enabled
  ) values (
    v_season_id,
    v_bankroll,
    v_top_n,
    (v_settings ->> 'min_bid')::integer,
    (v_settings ->> 'buy_in')::integer,
    v_settings -> 'payout_structure',
    (v_settings ->> 'bids_due_dow')::integer,
    coalesce((v_settings ->> 'bids_due_time')::time, '12:00:00'),
    coalesce(v_settings ->> 'bids_due_tz', 'America/New_York'),
    v_settings ->> 'league_type',
    (v_settings ->> 'default_season_length')::integer,
    coalesce((v_settings ->> 'side_bets_enabled')::boolean, true)
  );

  insert into season_members (season_id, profile_id, role)
  select v_season_id, (e ->> 'profile_id')::uuid, (e ->> 'role')::public.member_role
  from jsonb_array_elements(p_payload -> 'roster') e;

  for v_week in
    select (w.elem ->> 'number')::integer     as number,
           (w.elem ->> 'opening_date')::date  as opening_date,
           w.elem ->> 'status'                as status,
           w.ord
    from jsonb_array_elements(p_payload -> 'weeks') with ordinality as w(elem, ord)
    order by w.ord
  loop
    insert into weeks (season_id, number, opening_date, bid_deadline, status)
    values (v_season_id, v_week.number, v_week.opening_date, null, v_week.status::public.week_status);
    if v_week.status = 'final' then v_n_final := v_n_final + 1;
    else v_n_skipped := v_n_skipped + 1;
    end if;
  end loop;

  -- ---- The number is DERIVED, not declared (ADR-099) ----------------------
  select number into v_derived from v_seasons where id = v_season_id;

  -- Films + bids.
  for v_film in
    select (e ->> 'week')::integer          as week,
           e ->> 'title'                    as title,
           (e ->> 'box_office_m')::numeric  as box_office_m,
           (e ->> 'tomatometer')::integer   as tomatometer,
           (e ->> 'tmdb_id')::integer       as tmdb_id,
           (e ->> 'release_date')::date     as release_date,
           e -> 'bids'                      as bids
    from jsonb_array_elements(p_payload -> 'films') e
  loop
    insert into films (week_id, title, box_office_m, tomatometer, tmdb_id, release_date, captured_at)
    select w.id, v_film.title, v_film.box_office_m, v_film.tomatometer,
           v_film.tmdb_id, v_film.release_date,
           (w.week_of + 7)::timestamptz
    from weeks w
    where w.season_id = v_season_id and w.number = v_film.week
    returning id into v_film_id;
    v_n_films := v_n_films + 1;

    insert into bids (film_id, season_member_id, amount)
    select v_film_id, sm.id, (b ->> 'amount')::integer
    from jsonb_array_elements(v_film.bids) b
    join season_members sm
      on sm.season_id = v_season_id
     and sm.profile_id = (b ->> 'profile_id')::uuid;
    v_n_bids := v_n_bids + jsonb_array_length(v_film.bids);
  end loop;

  update bids b
  set is_winning = (
    f.eligible
    and b.amount > 0
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = b.film_id
        and b2.amount > 0
      order by b2.amount desc
      limit v_top_n
    )
  )
  from films f, weeks w
  where f.id = b.film_id
    and f.week_id = w.id
    and w.season_id = v_season_id
    and f.status = 'active';

  select count(*) into v_n_winning
  from bids b join films f on f.id = b.film_id join weeks w on w.id = f.week_id
  where w.season_id = v_season_id and b.is_winning;

  for v_row in
    select f.title, count(distinct b.amount) filter (where b.is_winning and b.amount > 0) as tiers
    from films f
    join weeks w on w.id = f.week_id
    left join bids b on b.film_id = f.id
    where w.season_id = v_season_id
    group by f.id, f.title
  loop
    if v_row.tiers > v_top_n then
      raise exception 'film "%" resolved % winning tiers, above top_n_distinct % — fixture contradicts settings',
        v_row.title, v_row.tiers, v_top_n;
    end if;
  end loop;
  for v_row in
    select sm.profile_id, coalesce(sum(b.amount) filter (where b.is_winning), 0) as spent
    from season_members sm
    left join bids b on b.season_member_id = sm.id
    where sm.season_id = v_season_id
    group by sm.id, sm.profile_id
  loop
    if v_row.spent > v_bankroll then
      raise exception 'member % winning spend $% exceeds bankroll $%', v_row.profile_id, v_row.spent, v_bankroll;
    end if;
  end loop;

  insert into email_log (week_id, profile_id, kind, status, error)
  select w.id, sm.profile_id, 'results_up', 'sent',
         'suppressed: historical ingest ' || current_date || ', never delivered'
  from weeks w
  cross join season_members sm
  where w.season_id = v_season_id
    and sm.season_id = v_season_id
    and w.status = 'final';
  get diagnostics v_n_suppress = row_count;

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, null, 'ingest_completed_season',
          jsonb_build_object(
            'league_id', p_league_id, 'season_id', v_season_id,
            'declared_number', v_number, 'season_number', v_derived,
            'weeks_final', v_n_final, 'weeks_skipped', v_n_skipped,
            'films', v_n_films, 'bids', v_n_bids, 'winning_bids', v_n_winning,
            'email_suppressions', v_n_suppress));

  return jsonb_build_object(
    'season_id', v_season_id,
    'declared_number', v_number,
    'season_number', v_derived,
    'weeks', jsonb_build_object('final', v_n_final, 'skipped', v_n_skipped),
    'films', v_n_films,
    'bids', v_n_bids,
    'winning_bids', v_n_winning,
    'email_suppressions', v_n_suppress,
    'totals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'profile_id', t.profile_id,
        'points', t.points,
        'spent', t.spent
      ) order by t.points desc), '[]'::jsonb)
      from (
        select sm.profile_id,
               coalesce(sum(f.score) filter (where b.is_winning and f.status = 'active'), 0) as points,
               coalesce(sum(b.amount) filter (where b.is_winning and f.status = 'active'), 0) as spent
        from season_members sm
        left join bids b on b.season_member_id = sm.id
        left join films f on f.id = b.film_id
        where sm.season_id = v_season_id
        group by sm.profile_id
      ) t
    )
  );
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 4. The two writers. DROP + CREATE: the argument list changes, so this is not
--    a REPLACE, and the old signatures must go or they linger as overloads
--    that still name dropped columns.
-- ---------------------------------------------------------------------------
drop function if exists public.update_league_settings(uuid, integer, integer, integer, integer, jsonb, integer, time without time zone, text, text, integer, boolean, boolean, smallint[]);

CREATE OR REPLACE FUNCTION public.update_league_settings(p_league_id uuid, p_fake_bankroll integer, p_top_n_distinct integer, p_min_bid integer, p_buy_in integer, p_payout_structure jsonb, p_bids_due_dow integer, p_bids_due_time time without time zone, p_bids_due_tz text, p_league_type text DEFAULT 'cash'::text, p_default_season_length integer DEFAULT 10, p_side_bets_enabled boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    side_bets_enabled        = p_side_bets_enabled
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
              'side_bets_enabled', p_side_bets_enabled)));
end;
$function$
;

drop function if exists public.update_season_settings(uuid, integer, integer, integer, integer, jsonb, integer, time without time zone, text, text, integer, boolean, boolean, smallint[], boolean);

CREATE OR REPLACE FUNCTION public.update_season_settings(p_season_id uuid, p_fake_bankroll integer, p_top_n_distinct integer, p_min_bid integer, p_buy_in integer, p_payout_structure jsonb, p_bids_due_dow integer, p_bids_due_time time without time zone, p_bids_due_tz text, p_league_type text DEFAULT 'cash'::text, p_default_season_length integer DEFAULT 10, p_side_bets_enabled boolean DEFAULT true, p_also_set_league_default boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old    season_settings%rowtype;
  v_season seasons%rowtype;
begin
  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can change this season''s rules';
  end if;

  select * into v_old from season_settings where season_id = p_season_id for update;
  if not found then
    raise exception 'this season has no settings row';
  end if;

  -- THE BANKROLL GATE. CHANGED (ADR-070): closed, not resolved.
  if p_fake_bankroll is distinct from v_old.fake_bankroll
     and exists (
       select 1 from weeks w
       where w.season_id = p_season_id and w.status in ('closed', 'final')
     )
  then
    raise exception
      'the bankroll cannot change once a week has closed — winners have already been charged, and changing it now would rewrite what everyone has spent. It can be set on the next season.';
  end if;

  update season_settings set
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
    side_bets_enabled        = p_side_bets_enabled
  where season_id = p_season_id;

  if p_also_set_league_default then
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
      side_bets_enabled        = p_side_bets_enabled
    where league_id = v_season.league_id;
  end if;

  -- The bids-due trio is this season's default for its weeks, so a change to
  -- it moves every week that is not pinned and has not already closed.
  perform sync_week_deadlines(p_season_id);

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'update_season_settings',
          jsonb_build_object(
            'old', to_jsonb(v_old) - 'season_id' - 'created_at',
            'also_set_league_default', p_also_set_league_default,
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
              'side_bets_enabled', p_side_bets_enabled)));
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 5. Grants, because DROP + CREATE does not carry them.
-- ---------------------------------------------------------------------------
revoke all on function public.update_league_settings(uuid, integer, integer, integer, integer, jsonb, integer, time without time zone, text, text, integer, boolean) from public, anon;
grant execute on function public.update_league_settings(uuid, integer, integer, integer, integer, jsonb, integer, time without time zone, text, text, integer, boolean) to authenticated;

revoke all on function public.update_season_settings(uuid, integer, integer, integer, integer, jsonb, integer, time without time zone, text, text, integer, boolean, boolean) from public, anon;
grant execute on function public.update_season_settings(uuid, integer, integer, integer, integer, jsonb, integer, time without time zone, text, text, integer, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The columns. The CHECK constraint on league_settings.box_office_days
--    drops with its column.
-- ---------------------------------------------------------------------------
alter table public.league_settings drop column if exists include_limited_releases;
alter table public.league_settings drop column if exists box_office_days;
alter table public.season_settings drop column if exists include_limited_releases;
alter table public.season_settings drop column if exists box_office_days;
