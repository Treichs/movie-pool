-- ============================================================================
-- ADR-099: a season's number is DERIVED from its earliest week, not counted.
--
-- leagues.season_start_number had no writer (ADR-020 gave create_league the
-- parameter, a later redefinition dropped it, create_season kept reading it),
-- so every league started at "Season 1" and the real pool could never start
-- at 34. The counter also numbered by INSERTION order, which is exactly wrong
-- for imported history.
--
-- The rule, from the ADR (all six design questions settled 2026-08-12):
--   * A season's number is its rank within its league, ordered by the
--     earliest week_of it contains. DERIVED, NEVER STORED, in ONE view.
--   * No two seasons in a league may hold the same calendar week — the
--     per-season uniqueness widens to the league, which is what makes
--     "earliest week" a total order.
--   * create_season REQUIRES the first opening date and lays the schedule
--     out itself, so a season can never exist without a derivable number.
--   * leagues.season_start_number is DROPPED, and so is seasons.name — a
--     column that is read but cannot be written is what caused this, and
--     leaving name as a second, staler answer would rebuild the same trap.
--
-- THE LEAGUE-WEEK GATE IS A TRIGGER, not a denormalised league_id on weeks.
-- Chosen for house style (weeks_gate_bid_deadline / films_gate_release_date
-- are the same shape), and because the alternative column can drift while a
-- trigger cannot. A BEFORE trigger is not race-proof under concurrent
-- inserts; laying out a schedule is a single-commissioner act, and the
-- ingest path runs single-threaded under the service role — accepted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The league-week gate.
-- ---------------------------------------------------------------------------
create or replace function public.weeks_gate_league_week()
returns trigger
language plpgsql
as $$
declare
  -- week_of is a generated column and not yet computed in a BEFORE trigger,
  -- so the Monday is derived here exactly as the schema derives it.
  v_week_of date := new.opening_date
                    - (extract(isodow from new.opening_date)::int - 1);
  v_league  uuid;
begin
  select league_id into v_league from seasons where id = new.season_id;
  if exists (
    select 1
    from weeks w
    join seasons s on s.id = w.season_id
    where s.league_id = v_league
      and w.week_of = v_week_of
      and w.id <> new.id
  ) then
    raise exception
      'another season in this league already holds the week of % — league seasons may not share a calendar week (ADR-099)',
      v_week_of;
  end if;
  return new;
end;
$$;

create trigger weeks_gate_league_week
  before insert or update of opening_date on public.weeks
  for each row execute function public.weeks_gate_league_week();

-- ---------------------------------------------------------------------------
-- 2. THE view. One implementation of the number, and of the name built from
--    it. security_invoker, so RLS on seasons decides visibility exactly as
--    it does for the table.
--
--    A season with no weeks has NO number (rank over nothing) — only legacy
--    rows can be in that state after this migration, and they read as
--    'New season' rather than a lie.
-- ---------------------------------------------------------------------------
create view public.v_seasons
with (security_invoker = true) as
select
  s.id,
  s.league_id,
  s.status,
  s.created_at,
  s.created_by,
  n.number::integer as number,
  case
    when n.number is null then 'New season'
    else 'Season ' || n.number
  end as name
from seasons s
left join (
  select
    x.season_id,
    rank() over (partition by x.league_id order by x.first_week) as number
  from (
    select w.season_id, s2.league_id, min(w.week_of) as first_week
    from weeks w
    join seasons s2 on s2.id = w.season_id
    group by w.season_id, s2.league_id
  ) x
) n on n.season_id = s.id;

grant select on public.v_seasons to authenticated;

comment on view public.v_seasons is
  'ADR-099: the season read model. `number` is the season''s rank within its '
  'league by earliest week_of — derived, never stored — and `name` is built '
  'from it. The ONE implementation; nothing else may derive or store either.';

-- ---------------------------------------------------------------------------
-- 3. create_season — requires the first opening date and lays out the
--    schedule itself, so no season exists without a number. Signature
--    changes, so drop + create.
-- ---------------------------------------------------------------------------
drop function if exists public.create_season(
  uuid, integer, integer, integer, integer, jsonb, integer,
  time without time zone, text, integer, boolean);

create function public.create_season(
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

  -- No name. The season's name is derived by v_seasons from the schedule
  -- seeded below; storing one here is the trap this migration removes.
  insert into seasons (league_id, created_by, status)
  values (p_league_id, auth.uid(), 'active')
  returning id into v_season_id;

  if v_frozen then
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

  -- The schedule, in the same act. The caller became a season commissioner
  -- in the roster copy above, so seed's own permission gate passes; its
  -- future-deadline gate protects week 1 exactly as it did when the wizard
  -- called it separately. default_season_length's fallback matches the
  -- wizard's (10).
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

revoke all on function public.create_season(
  uuid, date, integer, integer, integer, integer, jsonb, integer,
  time without time zone, text, integer, boolean) from public, anon;
grant execute on function public.create_season(
  uuid, date, integer, integer, integer, integer, jsonb, integer,
  time without time zone, text, integer, boolean) to authenticated;

comment on function public.create_season(
  uuid, date, integer, integer, integer, integer, jsonb, integer,
  time without time zone, text, integer, boolean) is
  'Starts a season AND lays out its schedule (ADR-099: the first opening date '
  'is required so every season is born with a derivable number). Settings are '
  'frozen from the wizard when passed, copied from the league otherwise.';

-- ---------------------------------------------------------------------------
-- 4. ingest_completed_season — the name-based contiguity dance is GONE. It
--    existed to keep "seasons contiguous from season_start_number" true for a
--    counter that no longer exists; rank does that job for free, and does it
--    by date rather than by insertion order. The payload's season.number
--    survives as a label for the source workbook and is reported alongside
--    the number the schedule actually derives.
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

  -- Weeks. The league-week gate trigger fires per row, so an ingested season
  -- overlapping ANY season of this league refuses here — which is the exact
  -- moment ADR-099 says the ordering must be defended.
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

  -- ---- The number is now DERIVED, not declared (ADR-099) ------------------
  -- The payload's season.number survives as the operator's LABEL for the
  -- source workbook ("this is the pool's season 27") and is reported back for
  -- the log. It is deliberately NOT asserted against the derivation: rank is
  -- computed over the seasons that EXIST, so a league holding only seasons
  -- 25-33 derives 1-9, and the ADR accepts that ("an un-backfilled league
  -- starts at Season 1"). Asserting equality would make every partial
  -- backfill refuse — the opposite of "importing an older season should place
  -- itself".
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

  -- is_winning: the ADR-113 formula, copied verbatim from close_week.
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

  -- ---- EMAIL SAFETY: pre-populate the results_up dedupe ledger ------------
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
    -- What the workbook called it, and where it actually landed. They differ
    -- whenever a league holds less than the whole run.
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

-- ---------------------------------------------------------------------------
-- 5. remove_ingested_season — no counter to repair any more. The derivation
--    renumbers the remaining seasons the moment the row is gone.
-- ---------------------------------------------------------------------------
create or replace function public.remove_ingested_season(
  p_season_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_season record;
  v_label  text;
begin
  -- Lock first, label second: the view carries a window function, and a
  -- locking clause refuses any query it expands into.
  select * into v_season from seasons where id = p_season_id for update;
  if not found then
    raise exception 'season % not found', p_season_id;
  end if;
  select name into v_label from v_seasons where id = p_season_id;
  if v_season.status <> 'completed' then
    raise exception 'season % is %, not completed — this only removes ingested history', v_label, v_season.status;
  end if;
  if not exists (
    select 1 from audit_log
    where action = 'ingest_completed_season'
      and (detail ->> 'season_id')::uuid = p_season_id
  ) then
    raise exception '% was played, not ingested — refusing to delete it', v_label;
  end if;

  delete from seasons where id = p_season_id;  -- children cascade

  insert into audit_log (season_id, actor, action, detail)
  values (null, null, 'remove_ingested_season',
          jsonb_build_object('league_id', v_season.league_id,
                             'season_id', p_season_id,
                             'season_name', v_label));

  return jsonb_build_object('removed', v_label);
end;
$$;

revoke all on function public.ingest_completed_season(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_completed_season(uuid, jsonb) to service_role;
revoke all on function public.remove_ingested_season(uuid) from public, anon, authenticated;
grant execute on function public.remove_ingested_season(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. get_league_activity — season_name now reads the derivation.
-- ---------------------------------------------------------------------------
create or replace function public.get_league_activity(
  p_league_id uuid,
  p_limit     integer default 12
)
returns table (
  id          bigint,
  action      text,
  at          timestamptz,
  actor_id    uuid,
  actor_name  text,
  season_id   uuid,
  season_name text,
  week_number integer
)
language plpgsql security definer set search_path = public
as $$
begin
  if not is_league_member(p_league_id) then
    raise exception 'not a member of this league';
  end if;

  return query
  select
    a.id,
    a.action,
    a.created_at,
    a.actor,
    p.display_name,
    a.season_id,
    s.name,
    (select w.number from weeks w
     where w.id = nullif(a.detail->>'week_id', '')::uuid)
  from audit_log a
  left join profiles p on p.id = a.actor
  left join v_seasons s on s.id = a.season_id
  where
    (
      a.season_id in (select s2.id from seasons s2 where s2.league_id = p_league_id)
      or (a.season_id is null
          and nullif(a.detail->>'league_id', '')::uuid = p_league_id)
    )
    and a.action in (
      'create_season', 'update_season_status',
      'open_week', 'auto_open_week', 'close_week',
      'resolve_week', 'week_scored',
      'finalize_week', 'skip_week', 'unskip_week',
      'add_league_member', 'accept_league_invite', 'remove_league_member',
      'handoff_league_commissioner',
      'promote_league_commissioner', 'demote_league_commissioner',
      'override_bid_amount', 'override_film_score', 'remove_film',
      'finalize_settlement'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. get_league_payments — season_name from the derivation.
-- ---------------------------------------------------------------------------
drop function if exists public.get_league_payments(uuid);

create function public.get_league_payments(p_league_id uuid)
returns table (
  season_id        uuid,
  season_name      text,
  season_member_id uuid,
  profile_id       uuid,
  display_name     text,
  net              integer,
  status           text,
  amount           integer,
  recorded_at      timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not is_league_member(p_league_id) then
    raise exception 'not a member of this league';
  end if;

  return query
  select
    s.id,
    vs.name,
    sm.id,
    sm.profile_id,
    p.display_name,
    sl.net,
    sp.status::text,
    sp.amount,
    sp.recorded_at
  from seasons s
  join v_seasons vs on vs.id = s.id
  join settlements st on st.season_id = s.id and st.status = 'final'
  join season_members sm on sm.season_id = s.id
  join profiles p on p.id = sm.profile_id
  left join settlement_lines sl
    on sl.settlement_id = st.id and sl.season_member_id = sm.id
  left join settlement_payments sp on sp.season_member_id = sm.id
  where s.league_id = p_league_id
  order by s.created_at desc, p.display_name;
end;
$$;

revoke all on function public.get_league_payments(uuid) from public, anon;
grant execute on function public.get_league_payments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Drop the counter and the stored name — in the SAME migration as the
--    derivation that replaces them (the ADR's explicit instruction, so no
--    window exists where both answers are live).
-- ---------------------------------------------------------------------------
alter table public.leagues drop column season_start_number;
alter table public.seasons drop column name;
