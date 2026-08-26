-- ============================================================================
-- ADR-058 — the app-wide week anchor.
--
-- "Week" was being re-derived in four places: weeks.week_of (a generated
-- column), the film release-date gate, the /releases calendar, and season
-- layout. Only one of them was generated, so the other three each carried
-- their own copy of the same Monday arithmetic.
--
-- calendar_weeks is one row per Mon-Sun range — the thing every date-bearing
-- record points AT rather than computes. Football-season semantics: a week is
-- a numbered object you can name, not an interval you infer.
--
-- ON THE 1-52 IN THE NOTE. ISO-8601 years contain 52 OR 53 weeks (2020, 2026
-- and 2032 have 53). Hard-capping at 52 would leave one real week of the year
-- with no anchor to point at, and every film releasing in it unrepresentable.
-- The check allows 53 and the seeder emits whatever the year actually has.
-- ============================================================================

create table public.calendar_weeks (
  id          integer primary key generated always as identity,
  iso_year    smallint not null,
  week_number smallint not null check (week_number between 1 and 53),
  -- The Monday. UNIQUE on its own because it identifies the row just as well
  -- as the pair does, and it is what every lookup actually has in hand.
  start_date  date not null unique,
  end_date    date not null,
  unique (iso_year, week_number),
  constraint calendar_weeks_is_mon_sun check (
    extract(isodow from start_date) = 1
    and end_date = start_date + 6
  )
);

comment on table public.calendar_weeks is
  'ADR-058: the app-wide week anchor. One row per Mon-Sun range, numbered '
  'within its ISO year. Season weeks and film release dates reference these '
  'rows instead of re-deriving the range.';

create index calendar_weeks_range_idx on public.calendar_weeks (start_date, end_date);

-- ---------------------------------------------------------------------------
-- Seed. 2020 covers the earliest real data the pool might back-import (the
-- Season 33 workbook); 2040 is far enough out that nobody meets the edge.
-- Driven off date_trunc('week'), which IS the ISO Monday, so the numbering
-- agrees with extract(isoyear/week) by construction rather than by arithmetic
-- we would have to get right ourselves.
-- ---------------------------------------------------------------------------
insert into public.calendar_weeks (iso_year, week_number, start_date, end_date)
select
  extract(isoyear from d)::smallint,
  extract(week    from d)::smallint,
  d::date,
  (d + interval '6 days')::date
from generate_series(
  date_trunc('week', date '2020-01-01'),
  date_trunc('week', date '2040-12-31'),
  interval '1 week'
) as d
on conflict (start_date) do nothing;

-- ---------------------------------------------------------------------------
-- The one resolver. Everything that needs "which week is this date in" calls
-- this rather than doing its own subtraction.
-- ---------------------------------------------------------------------------
create or replace function public.calendar_week_id_for(p_date date)
returns integer
language sql stable security definer set search_path = public
as $$
  select cw.id
  from public.calendar_weeks cw
  where p_date between cw.start_date and cw.end_date
$$;

comment on function public.calendar_week_id_for(date) is
  'ADR-058: the anchor row a date falls in, or null if outside the seeded '
  'range. Null is a real answer — it means the calendar needs extending, and '
  'callers should not paper over it.';

-- ---------------------------------------------------------------------------
-- weeks -> anchor.
--
-- A trigger rather than a generated column: a generated column cannot look a
-- value up in another table, and it cannot be a foreign key. The trigger keeps
-- it correct on every write, and the FK keeps it honest.
-- ---------------------------------------------------------------------------
alter table public.weeks
  add column calendar_week_id integer references public.calendar_weeks (id);

create or replace function public.set_week_calendar_anchor()
returns trigger
language plpgsql set search_path = public
as $$
begin
  -- week_of is the GENERATED Monday of opening_date and is already computed by
  -- the time a BEFORE trigger runs on INSERT, but NOT re-read here on UPDATE
  -- unless opening_date changed — so derive from opening_date directly and let
  -- the two agree by construction.
  new.calendar_week_id := public.calendar_week_id_for(
    (new.opening_date - (extract(isodow from new.opening_date)::int - 1))::date
  );
  return new;
end;
$$;

create trigger weeks_set_calendar_anchor
  before insert or update of opening_date on public.weeks
  for each row execute function public.set_week_calendar_anchor();

update public.weeks
set calendar_week_id = public.calendar_week_id_for(week_of)
where calendar_week_id is null;

create index weeks_calendar_week_idx on public.weeks (calendar_week_id);

-- ---------------------------------------------------------------------------
-- films -> anchor, off the film's OWN release date (ADR-042 keeps that
-- separate from its week: a film can be moved between weeks, and its release
-- date is a fact about the film).
--
-- Nullable on purpose — manually-added films carry no release_date, and every
-- pre-catalog row has none either.
-- ---------------------------------------------------------------------------
alter table public.films
  add column release_calendar_week_id integer references public.calendar_weeks (id);

create or replace function public.set_film_calendar_anchor()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.release_calendar_week_id :=
    case when new.release_date is null
         then null
         else public.calendar_week_id_for(new.release_date) end;
  return new;
end;
$$;

create trigger films_set_calendar_anchor
  before insert or update of release_date on public.films
  for each row execute function public.set_film_calendar_anchor();

update public.films
set release_calendar_week_id = public.calendar_week_id_for(release_date)
where release_date is not null and release_calendar_week_id is null;

create index films_release_calendar_week_idx on public.films (release_calendar_week_id);

-- ---------------------------------------------------------------------------
-- Grants. The anchor is reference data with no member scoping — every signed-in
-- user reads the same calendar — so it gets a plain readable policy rather than
-- the deny-by-default posture ADR-004 applies to game data.
-- ---------------------------------------------------------------------------
create policy calendar_weeks_select on public.calendar_weeks
  for select to authenticated
  using (true);

grant select on public.calendar_weeks to authenticated;
grant select, insert, update, delete on public.calendar_weeks to service_role;

revoke all on function public.calendar_week_id_for(date) from public, anon;
grant execute on function public.calendar_week_id_for(date) to authenticated;
