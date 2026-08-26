-- ============================================================================
-- ADR-059 + ADR-061 — settings collapse onto the league; screen counts leave.
--
-- ADR-059: a season has no settings of its own. league_rule_defaults becomes
-- league_settings — THE settings, not defaults seeded into per-season copies —
-- and every reader that consulted rule_configs now joins through the season's
-- league. Changing a league setting applies immediately to whatever season is
-- running. rule_configs is DROPPED.
--
-- ADR-061 rides along because both touch the same row: eligibility is release
-- type, not screen count. films.screen_count, the screen_threshold setting and
-- every screen-count parameter are removed. films.eligible SURVIVES — it is
-- the flag every gate already reads — but what sets it changes from a
-- hand-typed number to the release-type test (the /releases picker filters on
-- the league's include_limited_releases toggle; a hand-added film defaults
-- eligible and the commissioner can untick it).
--
-- The wizard's new knobs land here too: league type (cash vs practice),
-- default season length, the limited-releases toggle, side-bets opt-in, and
-- box-office days — which REPLACE include_previews/preview_start_weekday:
-- "count previews from Thursday" was always just "Thu-Sun are box-office
-- days", said less directly. Migrated, not defaulted.
--
-- Rulebook §3 was rewritten first (2026-08-03) with an explicit was/now note.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The table. Renamed because its name became WRONG under ADR-059: these
--    are not defaults a season copies, they are the settings every season of
--    the league reads live.
-- ---------------------------------------------------------------------------
alter table public.league_rule_defaults rename to league_settings;

alter table public.league_settings
  add column league_type text not null default 'cash'
    check (league_type in ('cash', 'practice')),
  add column default_season_length integer not null default 10
    check (default_season_length between 1 and 52),
  -- ADR-061: the eligibility toggle. False = wide releases only.
  add column include_limited_releases boolean not null default false,
  -- Side bets (efficiency prize + dessert penalty) are an opt-in pair; their
  -- AMOUNTS stay in payout_structure, this is whether they run at all.
  add column side_bets_enabled boolean not null default true,
  -- ISO weekdays whose grosses count as "opening box office" (1=Mon..7=Sun).
  add column box_office_days smallint[] not null default '{5,6,7}'
    check (
      box_office_days <@ '{1,2,3,4,5,6,7}'::smallint[]
      and array_length(box_office_days, 1) >= 1
    );

-- include_previews + preview_start_weekday said "box-office days" indirectly;
-- carry the meaning over, then drop them. thu means Thu-Sun, and so on.
update public.league_settings
set box_office_days = case
  when not include_previews then '{5,6,7}'::smallint[]
  when preview_start_weekday = 'mon' then '{1,2,3,4,5,6,7}'::smallint[]
  when preview_start_weekday = 'tue' then '{2,3,4,5,6,7}'::smallint[]
  when preview_start_weekday = 'wed' then '{3,4,5,6,7}'::smallint[]
  else '{4,5,6,7}'::smallint[]  -- thu, the long-standing default
end;

alter table public.league_settings
  drop column screen_threshold,
  drop column include_previews,
  drop column preview_start_weekday;

comment on table public.league_settings is
  'ADR-059: THE league''s settings — game rules, money, week timing. Every '
  'season of the league reads this row live; a season has no settings of its '
  'own. Renamed from league_rule_defaults when the per-season copy was removed.';

-- ---------------------------------------------------------------------------
-- 2. The one join, stated once. Every RPC that used to read rule_configs by
--    season_id calls this instead.
-- ---------------------------------------------------------------------------
create or replace function public.settings_for_season(p_season_id uuid)
returns public.league_settings
language sql stable security definer set search_path = public
as $$
  select ls.*
  from public.league_settings ls
  join public.seasons s on s.league_id = ls.league_id
  where s.id = p_season_id
$$;

comment on function public.settings_for_season(uuid) is
  'ADR-059: the league settings governing a season. NULL result means the '
  'season (or its league row) does not exist — callers treat that as the old '
  '"season has no rule configuration" error.';

-- The invoker-rights-trigger lesson (20260803020000): EVERY role that can
-- reach a caller needs EXECUTE, service_role included.
revoke all on function public.settings_for_season(uuid) from public, anon;
grant execute on function public.settings_for_season(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. member_remaining_budget — the money derivation, re-pointed.
-- ---------------------------------------------------------------------------
create or replace function public.member_remaining_budget(p_season_member_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select ls.fake_bankroll - coalesce((
    select sum(b.amount)
    from bids b
    join films f on f.id = b.film_id
    where b.season_member_id = p_season_member_id
      and b.is_winning is true
      and f.status = 'active'
  ), 0)
  from season_members sm
  join seasons s          on s.id = sm.season_id
  join league_settings ls on ls.league_id = s.league_id
  where sm.id = p_season_member_id
$$;

-- ---------------------------------------------------------------------------
-- 4. place_bid / place_bids — config via the helper; the eligibility error
--    speaks release types now, not screens.
-- ---------------------------------------------------------------------------
create or replace function public.place_bid(
  p_film_id uuid,
  p_amount  integer
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_film      films%rowtype;
  v_week      weeks%rowtype;
  v_member    season_members%rowtype;
  v_config    league_settings%rowtype;
  v_remaining integer;
  v_exposure  integer;
  v_bid_id    uuid;
begin
  select * into v_film from films where id = p_film_id;
  if not found then
    raise exception 'film not found';
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the slate';
  end if;
  if not v_film.eligible then
    raise exception 'film is not eligible for bidding in this league';
  end if;

  select * into v_week from weeks where id = v_film.week_id;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member
  from season_members sm
  where sm.season_id = v_week.season_id
    and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  v_config := settings_for_season(v_week.season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;

  if p_amount is null or p_amount < v_config.min_bid then
    raise exception 'bid must be at least $%', v_config.min_bid;
  end if;

  v_remaining := member_remaining_budget(v_member.id);
  select coalesce(sum(b.amount), 0) into v_exposure
  from bids b
  join films f on f.id = b.film_id
  where b.season_member_id = v_member.id
    and f.week_id = v_week.id
    and f.status = 'active'
    and b.film_id <> p_film_id;

  if v_exposure + p_amount > v_remaining then
    raise exception 'total bids this week ($%) would exceed your remaining budget ($%)',
      v_exposure + p_amount, v_remaining;
  end if;

  insert into bids (film_id, season_member_id, amount)
  values (p_film_id, v_member.id, p_amount)
  on conflict (film_id, season_member_id)
  do update set amount = excluded.amount, updated_at = now()
  returning id into v_bid_id;

  return v_bid_id;
end;
$$;

create or replace function public.place_bids(p_bids jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_week            weeks%rowtype;
  v_member          season_members%rowtype;
  v_config          league_settings%rowtype;
  v_remaining       integer;
  v_basket_total    integer;
  v_other_exposure  integer;
  v_n               integer;
  v_distinct        integer;
  v_matched         integer;
  v_week_count      integer;
  v_count           integer;
  v_bad_title       text;
begin
  if p_bids is null
     or jsonb_typeof(p_bids) <> 'array'
     or jsonb_array_length(p_bids) = 0 then
    raise exception 'no bids submitted';
  end if;

  select count(*), count(distinct x.film_id)
    into v_n, v_distinct
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer);
  if v_n <> v_distinct then
    raise exception 'the same film appears more than once in this submission';
  end if;

  select count(f.id), count(distinct f.week_id)
    into v_matched, v_week_count
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id;
  if v_matched <> v_n then
    raise exception 'one or more films in this submission no longer exist';
  end if;
  if v_week_count <> 1 then
    raise exception 'all bids in one submission must be for the same release week';
  end if;

  select w.* into v_week
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  join weeks w on w.id = f.week_id
  limit 1;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member
  from season_members sm
  where sm.season_id = v_week.season_id
    and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  v_config := settings_for_season(v_week.season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where f.status <> 'active'
  limit 1;
  if v_bad_title is not null then
    raise exception '"%" has been removed from the slate', v_bad_title;
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where not f.eligible
  limit 1;
  if v_bad_title is not null then
    raise exception '"%" is not eligible for bidding in this league', v_bad_title;
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where x.amount is null or x.amount < v_config.min_bid
  limit 1;
  if v_bad_title is not null then
    raise exception 'bid on "%" must be at least $%', v_bad_title, v_config.min_bid;
  end if;

  v_remaining := member_remaining_budget(v_member.id);
  select coalesce(sum(x.amount), 0) into v_basket_total
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer);
  select coalesce(sum(b.amount), 0) into v_other_exposure
  from bids b
  join films f on f.id = b.film_id
  where b.season_member_id = v_member.id
    and f.week_id = v_week.id
    and f.status = 'active'
    and b.film_id not in (
      select x.film_id from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
    );
  if v_basket_total + v_other_exposure > v_remaining then
    raise exception 'these bids total $%, but only $% of your budget is uncommitted',
      v_basket_total, v_remaining - v_other_exposure;
  end if;

  insert into bids (film_id, season_member_id, amount)
  select x.film_id, v_member.id, x.amount
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  on conflict (film_id, season_member_id)
  do update set amount = excluded.amount, updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. resolve_week / create_week / seed_season_weeks — same re-point.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_top_n   integer;
  v_winners integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can resolve winners';
  end if;
  if v_week.status <> 'locked' then
    raise exception 'close bidding before resolving winners (status: %)', v_week.status;
  end if;

  select (settings_for_season(v_week.season_id)).top_n_distinct into v_top_n;
  if v_top_n is null then
    raise exception 'season has no league settings';
  end if;

  update bids b
  set is_winning = (
    f.eligible
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = b.film_id
      order by b2.amount desc
      limit v_top_n
    )
  )
  from films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and f.status = 'active';

  update weeks set status = 'resolved' where id = p_week_id;

  select count(*) into v_winners
  from bids b
  join films f on f.id = b.film_id
  where f.week_id = p_week_id
    and b.is_winning;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'resolve_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'top_n_distinct', v_top_n, 'winning_bids', v_winners));
end;
$$;

create or replace function public.create_week(
  p_season_id    uuid,
  p_number       integer,
  p_opening_date date,
  p_bid_deadline timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_week_id  uuid;
  v_config   league_settings%rowtype;
  v_deadline timestamptz := p_bid_deadline;
  v_week_of  date;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can create weeks';
  end if;
  if p_number is null or p_number < 1 then
    raise exception 'week number must be 1 or higher';
  end if;
  if p_opening_date is null then
    raise exception 'week needs an opening date';
  end if;
  if exists (select 1 from weeks where season_id = p_season_id and number = p_number) then
    raise exception 'week % already exists in this season', p_number;
  end if;

  v_config := settings_for_season(p_season_id);
  if v_deadline is null and v_config.league_id is not null then
    v_week_of  := p_opening_date - (extract(isodow from p_opening_date)::int - 1);
    v_deadline := ((v_week_of + (v_config.bids_due_dow - 1))::timestamp
                   + v_config.bids_due_time)
                  at time zone v_config.bids_due_tz;
    -- 20260801200000: a default that has already lapsed is no default at all.
    if v_deadline <= now() then
      v_deadline := null;
    end if;
  end if;

  insert into weeks (season_id, number, opening_date, bid_deadline)
  values (p_season_id, p_number, p_opening_date, v_deadline)
  returning id into v_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'create_week',
          jsonb_build_object('week_id', v_week_id, 'week_number', p_number,
                             'opening_date', p_opening_date,
                             'bid_deadline', v_deadline,
                             'deadline_defaulted', p_bid_deadline is null));

  return v_week_id;
end;
$$;

create or replace function public.seed_season_weeks(
  p_season_id          uuid,
  p_first_opening_date date,
  p_week_count         integer
)
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

  for i in 0 .. p_week_count - 1 loop
    v_opening  := p_first_opening_date + (i * 7);
    v_week_of  := v_opening - (extract(isodow from v_opening)::int - 1);
    v_deadline := ((v_week_of + (v_config.bids_due_dow - 1))::timestamp
                   + v_config.bids_due_time)
                  at time zone v_config.bids_due_tz;
    if v_deadline <= now() then
      v_deadline := null;
    end if;

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

-- ---------------------------------------------------------------------------
-- 6. create_season — no copy. The season simply exists; its settings are its
--    league's, read live (ADR-059).
-- ---------------------------------------------------------------------------
create or replace function public.create_season(p_league_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id uuid;
  v_league    leagues%rowtype;
  v_number    integer;
  v_name      text;
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
    where league_id = p_league_id
      and status in ('draft', 'active')
  ) then
    raise exception
      'this league already has a season under way — finish it before starting the next';
  end if;

  select v_league.season_start_number + count(*) into v_number
  from seasons
  where league_id = p_league_id;

  v_name := 'Season ' || v_number;

  insert into seasons (name, league_id, created_by)
  values (v_name, p_league_id, auth.uid())
  returning id into v_season_id;

  insert into season_members (season_id, profile_id, role)
  select v_season_id, lm.profile_id, lm.role
  from league_members lm
  where lm.league_id = p_league_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('name', v_name, 'league_id', p_league_id,
                             'number', v_number,
                             'settings_source', 'league'));

  return v_season_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6b. create_league — its body inserts the settings row, and plpgsql resolves
--     table names at EXECUTION time, so the rename above would have broken
--     league creation at runtime while every test of the migration passed.
--     (pg_proc was queried for league_rule_defaults references before the
--     rename: create_league, create_season, update_league_rule_defaults —
--     all three are rewritten or dropped in this file.)
-- ---------------------------------------------------------------------------
create or replace function public.create_league(p_name text)
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

  insert into leagues (name, created_by, season_start_number)
  values (trim(p_name), auth.uid(), 1)
  returning id into v_league_id;

  insert into league_members (league_id, profile_id, role)
  values (v_league_id, auth.uid(), 'commissioner');

  insert into league_settings (league_id) values (v_league_id);

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name)));

  return v_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Films lose their screen count. Signature changes, so drop + recreate.
-- ---------------------------------------------------------------------------
drop function if exists public.add_film(uuid, text, integer, text);

create or replace function public.add_film(
  p_week_id uuid,
  p_title   text,
  p_imdb_id text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_film_id uuid;
begin
  select * into v_week from weeks where id = p_week_id;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can add films';
  end if;
  if v_week.status not in ('draft', 'open') then
    raise exception 'films can no longer be added to this week (status: %)', v_week.status;
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'film needs a title';
  end if;

  -- ADR-061: eligibility is release type. The /releases picker already
  -- filters on the league's toggle, and a hand-added film is the
  -- commissioner asserting it belongs — so it starts eligible, and
  -- update_film can untick it if that turns out wrong.
  insert into films (week_id, title, imdb_id, eligible)
  values (p_week_id, trim(p_title), nullif(trim(coalesce(p_imdb_id, '')), ''), true)
  returning id into v_film_id;

  return v_film_id;
end;
$$;

drop function if exists public.update_film(uuid, text, integer, text, boolean);

create or replace function public.update_film(
  p_film_id  uuid,
  p_title    text,
  p_imdb_id  text,
  p_eligible boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film films%rowtype;
  v_week weeks%rowtype;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;
  select * into v_week from weeks where id = v_film.week_id;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can edit films';
  end if;
  if v_week.status not in ('draft', 'open') then
    raise exception 'films can no longer be edited in this week (status: %)', v_week.status;
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the slate';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'film needs a title';
  end if;

  update films set
    title    = trim(p_title),
    imdb_id  = nullif(trim(coalesce(p_imdb_id, '')), ''),
    eligible = p_eligible
  where id = p_film_id;
end;
$$;

drop function if exists public.capture_film(uuid, numeric, integer, integer, jsonb);

create or replace function public.capture_film(
  p_film_id      uuid,
  p_box_office_m numeric,
  p_tomatometer  integer,
  p_suggested    jsonb default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film       films%rowtype;
  v_week       weeks%rowtype;
  v_score      numeric;
  v_key        text;
  v_node       jsonb;
  v_provenance jsonb := '{}'::jsonb;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;

  select * into v_week from weeks where id = v_film.week_id for update;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can capture results';
  end if;
  if v_week.status not in ('resolved', 'scored') then
    raise exception 'resolve winners before capturing results (status: %)', v_week.status;
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the roster and is not scored';
  end if;
  if p_box_office_m is null or p_box_office_m < 0 then
    raise exception 'box office must be 0 or more, in $ millions (e.g. 81.4)';
  end if;
  if p_tomatometer is null or p_tomatometer < 0 or p_tomatometer > 100 then
    raise exception 'Tomatometer must be a whole number between 0 and 100';
  end if;

  if p_suggested is not null then
    if jsonb_typeof(p_suggested) <> 'object' then
      raise exception 'p_suggested must be a json object';
    end if;
    for v_key, v_node in select * from jsonb_each(p_suggested) loop
      if v_key not in ('tomatometer', 'box_office_m') then
        raise exception 'unknown suggestion key "%" (expected tomatometer or box_office_m)', v_key;
      end if;
      if jsonb_typeof(v_node) <> 'object' then
        raise exception 'suggestion "%" must be an object with value and source', v_key;
      end if;
      if nullif(trim(coalesce(v_node ->> 'source', '')), '') is null then
        raise exception 'suggestion "%" must name its source', v_key;
      end if;
      if not (v_node ? 'value') then
        raise exception 'suggestion "%" must carry a value (use null for "asked, nothing to report")', v_key;
      end if;
      if v_node ->> 'value' is not null and jsonb_typeof(v_node -> 'value') <> 'number' then
        raise exception 'suggestion "%" value must be a number or null', v_key;
      end if;

      v_provenance := v_provenance || jsonb_build_object(v_key, jsonb_build_object(
        'suggested', v_node -> 'value',
        'entered',   case v_key when 'tomatometer' then to_jsonb(p_tomatometer)
                                else to_jsonb(p_box_office_m) end,
        'source',    v_node ->> 'source',
        'accepted',  case
                       when v_node ->> 'value' is null then null
                       when v_key = 'tomatometer'
                         then (v_node ->> 'value')::numeric = p_tomatometer
                       else (v_node ->> 'value')::numeric = p_box_office_m
                     end));
    end loop;
  end if;

  update films set
    box_office_m = p_box_office_m,
    tomatometer  = p_tomatometer,
    captured_at  = now()
  where id = p_film_id;

  select score into v_score from films where id = p_film_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'capture_film',
          jsonb_build_object(
            'film_id', p_film_id, 'title', v_film.title,
            'box_office_m', p_box_office_m, 'tomatometer', p_tomatometer,
            'score', v_score,
            'recapture', v_film.captured_at is not null)
          || case when v_film.captured_at is not null then
               jsonb_build_object('old', jsonb_build_object(
                 'box_office_m', v_film.box_office_m,
                 'tomatometer', v_film.tomatometer,
                 'score', v_film.score))
             else '{}'::jsonb end
          || case when v_provenance <> '{}'::jsonb then
               jsonb_build_object('provenance', v_provenance)
             else '{}'::jsonb end);

  if v_week.status = 'resolved' and not exists (
    select 1 from films f
    where f.week_id = v_week.id
      and f.status = 'active'
      and f.eligible
      and f.captured_at is null
  ) then
    update weeks set status = 'scored' where id = v_week.id;
    insert into audit_log (season_id, actor, action, detail)
    values (v_week.season_id, auth.uid(), 'week_scored',
            jsonb_build_object('week_id', v_week.id, 'week_number', v_week.number));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. generate_settlement — league settings, and the two new gates: side bets
--    off zeroes the efficiency prize and dessert penalty; a PRACTICE league
--    zeroes all money while still producing places, so the season can finish
--    through the same flow with nothing owed.
-- ---------------------------------------------------------------------------
create or replace function public.generate_settlement(p_season_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_config      league_settings%rowtype;
  v_buy_in      integer;
  v_awards      v_season_awards%rowtype;
  v_first_pct   integer;
  v_second_pct  integer;
  v_eff_prize   integer;
  v_dessert     integer;
  v_n           integer;
  v_pot         integer;
  v_third_out   integer := 0;
  v_eff_out     integer := 0;
  v_dessert_out integer := 0;
  v_remainder   integer;
  v_first_amt   integer := 0;
  v_second_amt  integer := 0;
  v_eff_films   jsonb;
  v_worst_films jsonb;
  v_won_sum     integer;
  v_owing_sum   integer;
  v_id          uuid;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can generate the settlement';
  end if;
  v_config := settings_for_season(p_season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;
  if exists (select 1 from settlements
             where season_id = p_season_id and status = 'final') then
    raise exception 'this season already has a final settlement';
  end if;

  -- ADR-059 wizard knobs. Practice league: every dollar is zero, places still
  -- computed, so completion runs the same path with nothing owed.
  v_buy_in := case when v_config.league_type = 'practice' then 0
                   else v_config.buy_in end;

  v_first_pct  := coalesce((v_config.payout_structure->>'first_pct')::integer, 70);
  v_second_pct := coalesce((v_config.payout_structure->>'second_pct')::integer, 30);
  v_eff_prize  := case when v_config.side_bets_enabled and v_config.league_type = 'cash'
                       then coalesce((v_config.payout_structure->>'efficiency_prize')::integer, 0)
                       else 0 end;
  v_dessert    := case when v_config.side_bets_enabled and v_config.league_type = 'cash'
                       then coalesce((v_config.payout_structure->>'dessert_penalty')::integer, 0)
                       else 0 end;
  if v_first_pct + v_second_pct <> 100 then
    raise exception '1st + 2nd percentages must add up to 100 (rules page)';
  end if;

  select * into v_awards from v_season_awards where season_id = p_season_id;

  drop table if exists _ledger;
  create temp table _ledger on commit drop as
  select
    sm.id                              as member_id,
    pr.display_name                    as display_name,
    coalesce(sum(f.score), 0)::numeric as points,
    coalesce(sum(b.amount), 0)::integer as spent,
    dense_rank() over (order by coalesce(sum(f.score), 0) desc)::integer as place,
    0::integer as place_won,
    0::integer as refund_won,
    0::integer as eff_won,
    0::integer as dessert_owed
  from season_members sm
  join profiles pr on pr.id = sm.profile_id
  left join (
    bids b
    join films f on f.id = b.film_id and f.status = 'active'
  ) on b.season_member_id = sm.id and b.is_winning
  where sm.season_id = p_season_id
  group by sm.id, pr.display_name;

  select count(*) into v_n from _ledger;
  if v_n = 0 then
    raise exception 'season has no members';
  end if;
  v_pot := v_buy_in * v_n;

  if v_awards.worst_score is not null and v_dessert > 0 then
    update _ledger l
    set dessert_owed = v_dessert / x.cnt
                     + case when x.rn <= v_dessert % x.cnt then 1 else 0 end
    from (
      select d.member_id,
             row_number() over (order by l2.display_name, d.member_id) as rn,
             count(*) over ()::integer as cnt
      from unnest(v_awards.dessert_member_ids) as d(member_id)
      join _ledger l2 on l2.member_id = d.member_id
    ) x
    where x.member_id = l.member_id;
    v_dessert_out := v_dessert;
    v_worst_films := v_awards.dessert_films;
  end if;

  if v_awards.best_ratio is not null then
    v_eff_out := v_eff_prize;
    update _ledger l
    set eff_won = (v_eff_prize + v_dessert_out) / x.cnt
                + case when x.rn <= (v_eff_prize + v_dessert_out) % x.cnt then 1 else 0 end
    from (
      select e.member_id,
             row_number() over (order by l2.display_name, e.member_id) as rn,
             count(*) over ()::integer as cnt
      from unnest(v_awards.efficiency_member_ids) as e(member_id)
      join _ledger l2 on l2.member_id = e.member_id
    ) x
    where x.member_id = l.member_id;
    v_eff_films := v_awards.efficiency_films;
  end if;

  if exists (select 1 from _ledger where place = 3) then
    v_third_out := v_buy_in;
    update _ledger l
    set refund_won = v_third_out / x.cnt
                   + case when x.rn <= v_third_out % x.cnt then 1 else 0 end
    from (
      select member_id,
             row_number() over (order by display_name, member_id) as rn,
             count(*) over ()::integer as cnt
      from _ledger where place = 3
    ) x
    where x.member_id = l.member_id;
  end if;

  v_remainder := v_pot - v_third_out - v_eff_out;
  if v_remainder < 0 then
    raise exception 'the pot ($%) cannot cover the configured prizes ($%) — fix the rules first',
      v_pot, v_third_out + v_eff_out;
  end if;
  if exists (select 1 from _ledger where place = 2) then
    v_second_amt := round(v_remainder * v_second_pct / 100.0)::integer;
    v_first_amt  := v_remainder - v_second_amt;
    update _ledger l
    set place_won = v_second_amt / x.cnt
                  + case when x.rn <= v_second_amt % x.cnt then 1 else 0 end
    from (
      select member_id,
             row_number() over (order by display_name, member_id) as rn,
             count(*) over ()::integer as cnt
      from _ledger where place = 2
    ) x
    where x.member_id = l.member_id;
  else
    v_first_amt := v_remainder;
  end if;

  update _ledger l
  set place_won = place_won + v_first_amt / x.cnt
                + case when x.rn <= v_first_amt % x.cnt then 1 else 0 end
  from (
    select member_id,
           row_number() over (order by display_name, member_id) as rn,
           count(*) over ()::integer as cnt
    from _ledger where place = 1
  ) x
  where x.member_id = l.member_id;

  select sum(place_won + refund_won + eff_won),
         sum(v_buy_in + dessert_owed)
    into v_won_sum, v_owing_sum
  from _ledger;
  if v_won_sum <> v_owing_sum then
    raise exception 'settlement is not zero-sum (won $% vs owing $%) — refusing to write',
      v_won_sum, v_owing_sum;
  end if;

  delete from settlements where season_id = p_season_id and status = 'draft';

  insert into settlements (season_id, payout_snapshot)
  values (p_season_id, jsonb_build_object(
    'pot', v_pot,
    'buy_in', v_buy_in,
    'member_count', v_n,
    'first_amount', v_first_amt,
    'second_amount', v_second_amt,
    'third_refund', v_third_out,
    'efficiency_prize', v_eff_out,
    'dessert_penalty', v_dessert_out,
    'best_ratio', v_awards.best_ratio,
    'efficiency_films', coalesce(v_eff_films, '[]'::jsonb),
    'worst_score', v_awards.worst_score,
    'dessert_films', coalesce(v_worst_films, '[]'::jsonb),
    'total_won', v_won_sum,
    'total_owing', v_owing_sum))
  returning id into v_id;

  insert into settlement_lines (settlement_id, season_member_id, won, owing, net, breakdown)
  select
    v_id,
    member_id,
    place_won + refund_won + eff_won,
    v_buy_in + dessert_owed,
    (place_won + refund_won + eff_won) - (v_buy_in + dessert_owed),
    jsonb_build_object(
      'place', place,
      'points', points,
      'spent', spent,
      'place_won', place_won,
      'third_refund', refund_won,
      'efficiency_won', eff_won,
      'buy_in', v_buy_in,
      'dessert_owed', dessert_owed)
  from _ledger;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'generate_settlement',
          jsonb_build_object('settlement_id', v_id, 'pot', v_pot,
                             'total_won', v_won_sum, 'total_owing', v_owing_sum));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. The league-scoped settings writer, replacing both update_rule_config
--    (per-season, gone with rule_configs) and update_league_rule_defaults
--    (whose name died with the rename).
-- ---------------------------------------------------------------------------
drop function if exists public.update_rule_config(
  uuid, integer, integer, integer, integer, text, boolean,
  public.weekday_start, integer, jsonb, integer, time, text);
drop function if exists public.update_league_rule_defaults(
  uuid, integer, integer, integer, integer, text, boolean,
  public.weekday_start, integer, jsonb, integer, time, text);

create or replace function public.update_league_settings(
  p_league_id                uuid,
  p_fake_bankroll            integer,
  p_top_n_distinct           integer,
  p_min_bid                  integer,
  p_capture_timing           text,
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
    capture_timing           = p_capture_timing,
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
              'capture_timing', p_capture_timing,
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

-- ---------------------------------------------------------------------------
-- 10. The drops — staged so the DEPLOYED code never breaks.
--
--     The 2026-08-02 incident: a migration landed ahead of its code and
--     production ran old reads against the new schema for an hour. This
--     migration is applied to the live database while main still reads
--     rule_configs and films.screen_count, so:
--
--     a) rule_configs is dropped but a COMPATIBILITY VIEW of the same name
--        and column set takes its place, satisfying every deployed read by
--        joining league_settings through seasons. screen_threshold reads 0
--        and the previews pair is reverse-mapped from box_office_days.
--        security_invoker, so the underlying league_settings policy governs.
--     b) films.screen_count SURVIVES this migration, deprecated: nothing
--        writes it any more (capture_film/add_film/update_film above), old
--        code may still read it. It is dropped by the cleanup migration
--        AFTER the reshaped code deploys, alongside the view.
--
--     Writes in the gap: update_rule_config no longer exists, so a
--     commissioner saving the OLD rules form gets a loud RPC error for the
--     minutes between migration and deploy — loud and commissioner-only,
--     unlike the silent player-facing empties of the last incident.
-- ---------------------------------------------------------------------------
drop table public.rule_configs;

create view public.rule_configs
with (security_invoker = true)
as
select
  ls.id,
  s.id as season_id,
  ls.fake_bankroll,
  0    as screen_threshold,
  ls.top_n_distinct,
  ls.min_bid,
  ls.capture_timing,
  (ls.box_office_days <> '{5,6,7}'::smallint[]) as include_previews,
  case
    when 1 = any(ls.box_office_days) then 'mon'
    when 2 = any(ls.box_office_days) then 'tue'
    when 3 = any(ls.box_office_days) then 'wed'
    else 'thu'
  end::public.weekday_start as preview_start_weekday,
  ls.buy_in,
  ls.payout_structure,
  -- league_settings never carried award_defs (v1 form kept it out); synthesized
  -- so any stray reader of the old shape still resolves.
  '{}'::jsonb as award_defs,
  ls.bids_due_dow,
  ls.bids_due_time,
  ls.bids_due_tz,
  ls.created_at
from public.league_settings ls
join public.seasons s on s.league_id = ls.league_id;

comment on view public.rule_configs is
  'TEMPORARY ADR-059 compatibility shim for code deployed before the '
  'settings collapse. Read-only, one row per season, backed by '
  'league_settings. Dropped by the cleanup migration once the reshaped app '
  'is live — do not build anything new on it.';

grant select on public.rule_configs to authenticated, service_role;

comment on column public.films.screen_count is
  'DEPRECATED (ADR-061): nothing writes this since 20260803030000; eligibility '
  'is release type. Dropped by the cleanup migration once old readers are gone.';

-- ---------------------------------------------------------------------------
-- 11. Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.member_remaining_budget(uuid)      from public, anon;
revoke all on function public.place_bid(uuid, integer)           from public, anon;
revoke all on function public.place_bids(jsonb)                  from public, anon;
revoke all on function public.resolve_week(uuid)                 from public, anon;
revoke all on function public.create_week(uuid, integer, date, timestamptz) from public, anon;
revoke all on function public.seed_season_weeks(uuid, date, integer) from public, anon;
revoke all on function public.create_season(uuid)                from public, anon;
revoke all on function public.add_film(uuid, text, text)         from public, anon;
revoke all on function public.update_film(uuid, text, text, boolean) from public, anon;
revoke all on function public.capture_film(uuid, numeric, integer, jsonb) from public, anon;
revoke all on function public.generate_settlement(uuid)          from public, anon;
revoke all on function public.update_league_settings(uuid, integer, integer, integer, text, integer, jsonb, integer, time, text, text, integer, boolean, boolean, smallint[]) from public, anon;

grant execute on function public.member_remaining_budget(uuid)   to authenticated;
grant execute on function public.place_bid(uuid, integer)        to authenticated;
grant execute on function public.place_bids(jsonb)               to authenticated;
grant execute on function public.resolve_week(uuid)              to authenticated;
grant execute on function public.create_week(uuid, integer, date, timestamptz) to authenticated;
grant execute on function public.seed_season_weeks(uuid, date, integer) to authenticated;
grant execute on function public.create_season(uuid)             to authenticated;
grant execute on function public.add_film(uuid, text, text)      to authenticated;
grant execute on function public.update_film(uuid, text, text, boolean) to authenticated;
grant execute on function public.capture_film(uuid, numeric, integer, jsonb) to authenticated;
grant execute on function public.generate_settlement(uuid)       to authenticated;
grant execute on function public.update_league_settings(uuid, integer, integer, integer, text, integer, jsonb, integer, time, text, text, integer, boolean, boolean, smallint[]) to authenticated;
