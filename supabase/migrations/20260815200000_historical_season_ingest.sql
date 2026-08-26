-- ============================================================================
-- Historical season ingest into an EXISTING league (backend only).
--
-- Sources of truth:
--   Docs/design/user-flow-and-domain-map.md §"Found during the seasons 31-32
--   ingest" item 9 (season_start_number has no writer — "blocks migrating the
--   real pool"), and the approved 2026-08-15 plan (pp-memory:
--   backlog/historical-season-ingest).
--
-- Why a dedicated RPC instead of replaying through the game RPCs:
--   * seasons_one_live_per_league_idx (schema-level) forbids a second
--     draft/active season per league, and replaying bids REQUIRES an active
--     season — while nothing can create a season born 'completed'. The
--     partial index never touches 'completed', so a direct completed insert
--     is legal; this function is the one sanctioned place that does it.
--   * place_bid(s) is auth.uid()-scoped; ingesting real members' history via
--     replay means minting login sessions for their accounts. Refused.
--   * create_season's name derivation is season_start_number + count(*),
--     order-blind: nine ingested seasons would silently corrupt the next
--     real season's number. Ingest owns the name and keeps the invariant
--     "seasons contiguous from season_start_number" true instead.
--
-- EMAIL SAFETY (defense in depth). The notify cron's results sweep is windowed
-- by opening_date (RESULTS_WINDOW_DAYS, src/lib/notifications.ts) after the
-- 2026-08-12 replica-ingest blast. This function does not rely on that: it
-- pre-populates the email_log dedupe ledger with a 'sent' suppression row for
-- every (final week x roster member) pair in the same transaction, so an
-- ingested week can never email anyone even under code that predates or
-- regresses the window. Deadline reminders are structurally impossible for
-- ingested weeks (final/skipped status, null deadlines; the reminder sweep
-- wants an open week with a future deadline).
--
-- Both functions are SERVICE-ROLE ONLY (grant pattern of 20260814010000):
-- the orchestration already requires the service key (placeholder auth users,
-- film_catalog writes), and a commissioner-callable surface would let any
-- commissioner attach arbitrary profiles to fabricated history.
--
-- Also here: the profiles_select RLS widening. Ingested placeholder players
-- are season_members ONLY (league membership would copy them into every
-- future real season via create_season's roster copy, and
-- remove_league_member could never take them out). The phase-11 policy only
-- grants visibility through shared league_members, so without a third arm a
-- placeholder renders as a blank name in standings and records. The arm
-- restores the app's original phase-1 "season-mates" visibility alongside
-- the league-mates arm. Invite search (visible_profiles) is a separate
-- definer function and deliberately stays unwidened.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles_select: third arm — season-mates in my leagues are visible.
--    Index-backed by season_members_profile_idx (phase 1).
-- ---------------------------------------------------------------------------
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.league_members mine
      join public.league_members theirs on theirs.league_id = mine.league_id
      where mine.profile_id = auth.uid()
        and theirs.profile_id = profiles.id
    )
    or exists (
      select 1
      from public.season_members sm
      join public.seasons s   on s.id = sm.season_id
      join public.league_members me on me.league_id = s.league_id
      where sm.profile_id = profiles.id
        and me.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. ingest_completed_season — one call, one transaction, one season.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_completed_season(
  p_league_id uuid,
  p_payload   jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_number     integer;
  v_name       text;
  v_created    timestamptz;
  v_settings   jsonb;
  v_top_n      integer;
  v_bankroll   integer;
  v_season_id  uuid;
  v_numbers    integer[];
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
  v_start      integer;
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
  v_name    := coalesce(p_payload #>> '{season,name}', 'Season ' || v_number);
  v_created := (p_payload #>> '{season,created_at}')::timestamptz;
  if v_created is null or v_created >= now() then
    raise exception 'season.created_at must be a past timestamp (the backdate that orders League Home)';
  end if;

  if exists (select 1 from seasons where league_id = p_league_id and name = v_name) then
    raise exception '% already exists in this league — remove_ingested_season first if this is a redo', v_name;
  end if;

  -- ---- contiguity of season numbers --------------------------------------
  -- Every existing name must parse as 'Season N' (a hand-renamed season fails
  -- loudly here — documented and deliberate), and {existing} ∪ {new} must be
  -- contiguous so create_season's start + count(*) formula keeps producing
  -- max+1 for the next REAL season.
  v_numbers := array[v_number];
  for v_row in select name from seasons where league_id = p_league_id loop
    if v_row.name !~ '^Season \d+$' then
      raise exception 'existing season "%" does not parse as ''Season N'' — ingest cannot maintain the numbering invariant', v_row.name;
    end if;
    v_numbers := v_numbers || substring(v_row.name from '\d+')::integer;
  end loop;
  if (select count(distinct n) from unnest(v_numbers) n) <> array_length(v_numbers, 1) then
    raise exception 'season number % collides with an existing season', v_number;
  end if;
  select min(n), max(n) - min(n) + 1 into v_start, v_n_weeks from unnest(v_numbers) n;
  if v_n_weeks <> array_length(v_numbers, 1) then
    raise exception 'season numbers % are not contiguous — ingest seasons in an unbroken run', v_numbers;
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
    select (e ->> 'number')::integer      as number,
           (e ->> 'opening_date')::date   as opening_date,
           e ->> 'status'                 as status,
           e ->> 'skip_reason'            as skip_reason,
           ordinality
    from jsonb_array_elements(p_payload -> 'weeks') with ordinality e
    order by ordinality
  loop
    if v_week.number is distinct from v_week.ordinality::integer then
      raise exception 'weeks must be numbered exactly 1..N in order; position % carries number %',
        v_week.ordinality, v_week.number;
    end if;
    if v_week.opening_date is null then
      raise exception 'week % has no opening_date', v_week.number;
    end if;
    if v_prev_date is not null and v_week.opening_date <= v_prev_date then
      -- The app-wide unstated invariant: week number ascends with date
      -- (trend charts, getWeeks). Asserted, never assumed.
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
  -- Born 'completed': the one-live-season partial unique index only covers
  -- draft/active, so this coexists with a live real season by design.
  insert into seasons (league_id, name, status, created_by, created_at)
  values (p_league_id, v_name, 'completed', null, v_created)
  returning id into v_season_id;

  insert into season_settings (
    season_id, fake_bankroll, top_n_distinct, min_bid, buy_in, payout_structure,
    bids_due_dow, bids_due_time, bids_due_tz, league_type, default_season_length,
    include_limited_releases, side_bets_enabled, box_office_days
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
    coalesce((v_settings ->> 'include_limited_releases')::boolean, false),
    coalesce((v_settings ->> 'side_bets_enabled')::boolean, true),
    coalesce(
      (select array_agg(x::smallint) from jsonb_array_elements_text(v_settings -> 'box_office_days') x),
      '{5,6,7}'::smallint[]
    )
  );

  -- Roster: direct insert, deliberately NOT the league-roster copy — a
  -- historical season's roster is the workbook's, not today's league.
  insert into season_members (season_id, profile_id, role)
  select v_season_id, (e ->> 'profile_id')::uuid, (e ->> 'role')::public.member_role
  from jsonb_array_elements(p_payload -> 'roster') e;

  -- Weeks: null deadlines (gate_week_bid_deadline is trivially satisfied);
  -- the calendar-anchor trigger resolves calendar_week_id from opening_date
  -- (null outside the seeded 2020-2040 range, which the FK allows).
  for v_week in
    select (e ->> 'number')::integer     as number,
           (e ->> 'opening_date')::date  as opening_date,
           e ->> 'status'                as status,
           ordinality
    from jsonb_array_elements(p_payload -> 'weeks') with ordinality e
    order by ordinality
  loop
    insert into weeks (season_id, number, opening_date, bid_deadline, status)
    values (v_season_id, v_week.number, v_week.opening_date, null, v_week.status::public.week_status);
    if v_week.status = 'final' then v_n_final := v_n_final + 1;
    else v_n_skipped := v_n_skipped + 1;
    end if;
  end loop;

  -- Films + bids. score is a generated column; captured_at is set to the
  -- Monday after the opening weekend for data coherence with played seasons.
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

  -- is_winning: the ADR-113 formula, copied verbatim from close_week
  -- (20260812210000_adr113_remove_bid_sheets.sql). Never trusted from the
  -- payload. A zero never wins; both zero guards kept, same reasoning.
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

  -- The fixture data is winners-only, so every positive bid should have won.
  -- A film where the formula demoted one means the payload contradicts itself.
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

  -- ---- EMAIL SAFETY: pre-populate the results_up dedupe ledger ------------
  -- One 'sent' suppression row per (final week x member). The results sweep's
  -- opening_date window already excludes history; these rows make the
  -- guarantee independent of that code. Reminders need an open week with a
  -- future deadline — structurally impossible here.
  insert into email_log (week_id, profile_id, kind, status, error)
  select w.id, sm.profile_id, 'results_up', 'sent',
         'suppressed: historical ingest ' || current_date || ', never delivered'
  from weeks w
  cross join season_members sm
  where w.season_id = v_season_id
    and sm.season_id = v_season_id
    and w.status = 'final';
  get diagnostics v_n_suppress = row_count;

  -- ---- numbering invariant ------------------------------------------------
  update leagues set season_start_number = v_start where id = p_league_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, null, 'ingest_completed_season',
          jsonb_build_object(
            'league_id', p_league_id, 'season_id', v_season_id,
            'season_name', v_name, 'season_number', v_number,
            'weeks_final', v_n_final, 'weeks_skipped', v_n_skipped,
            'films', v_n_films, 'bids', v_n_bids, 'winning_bids', v_n_winning,
            'email_suppressions', v_n_suppress,
            'season_start_number', v_start));

  return jsonb_build_object(
    'season_id', v_season_id,
    'season_name', v_name,
    'weeks', jsonb_build_object('final', v_n_final, 'skipped', v_n_skipped),
    'films', v_n_films,
    'bids', v_n_bids,
    'winning_bids', v_n_winning,
    'email_suppressions', v_n_suppress,
    'season_start_number', v_start,
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
$$;

-- ---------------------------------------------------------------------------
-- 3. remove_ingested_season — the sanctioned redo path.
--
-- Redo is EXPECTED during a nine-season backfill (a wrong identity map, a
-- settings correction). The manual alternative — hand DELETE plus hand
-- season_start_number repair — is the exact "two halves come apart" shape
-- from the replica's 2026-08-07 data-loss post-mortem. Refuses any season
-- without an ingest audit row: an organically played season can never be
-- deleted through this. Never touches auth users (placeholder identities are
-- durable league history). email_log rows cascade with their weeks.
-- ---------------------------------------------------------------------------
create or replace function public.remove_ingested_season(
  p_season_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_season   record;
  v_start    integer;
  v_numbers  integer[];
  v_row      record;
  v_gap      boolean := false;
begin
  select * into v_season from seasons where id = p_season_id for update;
  if not found then
    raise exception 'season % not found', p_season_id;
  end if;
  if v_season.status <> 'completed' then
    raise exception 'season % is %, not completed — this only removes ingested history', v_season.name, v_season.status;
  end if;
  if not exists (
    select 1 from audit_log
    where action = 'ingest_completed_season'
      and (detail ->> 'season_id')::uuid = p_season_id
  ) then
    raise exception '% was played, not ingested — refusing to delete it', v_season.name;
  end if;

  delete from seasons where id = p_season_id;  -- children cascade

  -- Recompute the numbering invariant over what remains.
  v_numbers := '{}';
  for v_row in select name from seasons where league_id = v_season.league_id loop
    if v_row.name ~ '^Season \d+$' then
      v_numbers := v_numbers || substring(v_row.name from '\d+')::integer;
    end if;
  end loop;
  if array_length(v_numbers, 1) is not null then
    select min(n) into v_start from unnest(v_numbers) n;
    update leagues set season_start_number = v_start where id = v_season.league_id;
    -- Warn (don't refuse) on a gap: the normal workflow is remove-then-
    -- immediately-re-ingest the same number.
    select max(n) - min(n) + 1 <> count(*) into v_gap from unnest(v_numbers) n;
  end if;

  insert into audit_log (season_id, actor, action, detail)
  values (null, null, 'remove_ingested_season',
          jsonb_build_object('league_id', v_season.league_id,
                             'season_id', p_season_id,
                             'season_name', v_season.name,
                             'season_start_number', v_start,
                             'contiguity_gap_left', v_gap));

  return jsonb_build_object(
    'removed', v_season.name,
    'season_start_number', v_start,
    'contiguity_gap_left', v_gap);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants: service_role only. Postgres grants EXECUTE to PUBLIC on every
--    new function by default (see 20260814010000) — revoke it, grant only
--    the role the orchestration script already runs as.
-- ---------------------------------------------------------------------------
revoke all on function public.ingest_completed_season(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_completed_season(uuid, jsonb) to service_role;

revoke all on function public.remove_ingested_season(uuid) from public, anon, authenticated;
grant execute on function public.remove_ingested_season(uuid) to service_role;
