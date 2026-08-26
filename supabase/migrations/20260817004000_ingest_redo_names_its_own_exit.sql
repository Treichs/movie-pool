-- ---------------------------------------------------------------------------
-- A repeated ingest names the redo path again.
--
-- The old duplicate guard was `exists (… where name = v_name)` — it refused a
-- second ingest of the same season and, crucially, TOLD THE OPERATOR WHAT TO
-- DO: "remove_ingested_season first if this is a redo". ADR-099 dropped
-- seasons.name, and with it that message. The re-ingest still refuses — the
-- league-week gate catches the overlapping calendar week — but it refuses with
-- a structural message about weeks, which is true and unhelpful during a redo,
-- and it refuses AFTER the season row is written (rolled back, but noisier).
--
-- So the guard comes back, keyed on what the season actually is: its weeks. If
-- any calendar week in the payload is already held anywhere in this league,
-- the ingest stops before writing anything and names the exit. The trigger
-- stays as the structural backstop underneath.
--
-- Only this block is added; the rest is 20260817003000's definition.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_completed_season(
  p_league_id uuid,
  p_payload   jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
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
$$;

revoke all on function public.ingest_completed_season(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_completed_season(uuid, jsonb) to service_role;
