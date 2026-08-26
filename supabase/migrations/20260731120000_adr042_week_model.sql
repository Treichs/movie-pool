-- ADR-042 — weeks are a Mon-Sun range with a week_of anchor; films carry their
-- own release date.
--
-- WHAT WAS WRONG. `weeks.opening_date` has never had a documented meaning. The
-- live data proves the ambiguity is real, not theoretical: of 10 weeks, 7 hold a
-- FRIDAY and 3 hold a THURSDAY. Four UI surfaces render that column as
-- "Opens {date}". Meanwhile a film had no date of its own at all — its opening
-- was whatever its week said, so a film's actual release date was unrecoverable.
--
-- THE MODEL. A week is the Mon-Sun calendar range it operates in, identified by
-- its Monday (`week_of`). A film has its OWN release date, exactly as the API
-- reports it, whatever weekday that is. A film belongs to the week whose range
-- contains its release date — a checkable invariant rather than a convention.
--
-- WHY week_of IS GENERATED, NOT WRITABLE. Deriving it from `opening_date`
-- rather than adding an independently-writable column means it can never drift,
-- needs no backfill, and leaves `create_week`, `update_week`, `getWeeks` and
-- every existing spike working unchanged. The commissioner keeps entering the
-- day they think in ("it opens Friday the 14th") and the Monday is derived for
-- display. The trade is that `opening_date` stays the input of record; if that
-- ever becomes confusing, the column can be renamed later without touching the
-- invariant, which lives in the expression below.
--
-- NOTE ON THE BACKFILL THAT ISN'T HERE. The task card specced
-- `week_of = opening_date - 4 days`. That is correct for a Friday and produces a
-- SUNDAY for the three Thursday rows. The ISO expression below is total over
-- every weekday, which is why it is used everywhere in this file.

-- ---------------------------------------------------------------------------
-- 1. The rule, once, as a function. The authoritative twin of `weekOf()` in
--    src/lib/release-week.ts; the spike asserts the two agree over a fixed
--    date vector including a year boundary and a leap day.
-- ---------------------------------------------------------------------------
create or replace function public.week_of(p_date date)
returns date
language sql
immutable strict parallel safe
as $$
  -- isodow: Mon=1 … Sun=7. Subtracting (isodow - 1) walks back to that Monday.
  -- Idempotent: week_of(week_of(d)) = week_of(d).
  select p_date - (extract(isodow from p_date)::int - 1);
$$;

comment on function public.week_of(date) is
  'The Monday of the Mon-Sun week containing the date — a week''s "week of" label (ADR-042). Mirrored in TypeScript by weekOf() in src/lib/release-week.ts.';

-- ---------------------------------------------------------------------------
-- 2. weeks.week_of
--
--    The generation expression is INLINE rather than a call to week_of() above.
--    A stored generated column freezes whatever the expression produced at write
--    time, so routing it through a function would let a later `create or replace
--    function` silently desynchronise the stored values from the rule. Inlining
--    removes that hazard; the spike asserts `week_of(opening_date) = week_of`
--    for every row, which turns any future divergence into a test failure
--    instead of wrong data.
-- ---------------------------------------------------------------------------
alter table public.weeks
  add column week_of date
    generated always as (opening_date - (extract(isodow from opening_date)::int - 1)) stored;

comment on column public.weeks.week_of is
  'Monday of this week''s Mon-Sun range — the "Week of {date}" label players see. Derived from opening_date; never written directly (ADR-042).';

-- A season cannot hold two weeks for the same calendar week. This invariant did
-- not exist before and could not be expressed before: with only opening_date, a
-- Thursday row and a Friday row in the same week looked like different dates.
-- Verified against live data (10 weeks, 6 seasons, zero collisions) before
-- adding, since a violated unique constraint would fail the whole migration.
alter table public.weeks
  add constraint weeks_one_per_calendar_week unique (season_id, week_of);

create index if not exists weeks_week_of_idx on public.weeks (week_of);

-- ---------------------------------------------------------------------------
-- 3. films.release_date — the film's own date, from the API's US wide
--    (type 3) entry. Deliberately NOT backfilled: all 26 existing films predate
--    the catalog and we do not know their real release dates. Inventing one from
--    the week's opening_date would manufacture data that looks sourced.
--    Nullable forever — the manual add_film path (ADR-002's required fallback)
--    has no date either.
-- ---------------------------------------------------------------------------
alter table public.films add column release_date date;

comment on column public.films.release_date is
  'The film''s own US wide-release date as reported by TMDB (release_dates[US] type 3), independent of its week. Null for manually-added films (ADR-042).';

-- ---------------------------------------------------------------------------
-- 4. The gates.
--
--    Both are TRIGGERS, not CHECK constraints, for two different reasons:
--      - the bid_deadline gate compares a timestamptz to a calendar range, and
--        casting timestamptz to date is STABLE (it reads the session TimeZone),
--        which CHECK forbids;
--      - the release_date gate is cross-table (film -> its week), which CHECK
--        cannot express at all.
--    A trigger also enforces the invariant on every write path, including
--    service-role writes that bypass the RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.gate_week_bid_deadline()
returns trigger
language plpgsql
as $$
declare
  v_week_of date := new.opening_date - (extract(isodow from new.opening_date)::int - 1);
begin
  if new.bid_deadline is not null
     and (new.bid_deadline at time zone 'utc')::date not between v_week_of and v_week_of + 6
  then
    -- UTC is chosen so the gate is deterministic regardless of the caller's
    -- session TimeZone. The gate exists to catch a deadline set in the WRONG
    -- WEEK (week 3's deadline landing in week 7), not to police the hour, so a
    -- few hours of zone fuzz at the Sunday/Monday boundary is harmless and
    -- accepted rather than papered over with a guessed local zone.
    raise exception 'bid deadline % falls outside the week of % (Mon-Sun)',
      new.bid_deadline, v_week_of;
  end if;
  return new;
end;
$$;

create trigger weeks_gate_bid_deadline
  before insert or update of opening_date, bid_deadline on public.weeks
  for each row execute function public.gate_week_bid_deadline();

create or replace function public.gate_film_release_date()
returns trigger
language plpgsql
as $$
declare
  v_week_of date;
begin
  if new.release_date is null then
    return new;  -- manual films and every pre-catalog row
  end if;
  select opening_date - (extract(isodow from opening_date)::int - 1)
    into v_week_of
    from weeks where id = new.week_id;
  if new.release_date not between v_week_of and v_week_of + 6 then
    raise exception 'film releases % but that week is the week of % (Mon-Sun)',
      new.release_date, v_week_of;
  end if;
  return new;
end;
$$;

create trigger films_gate_release_date
  before insert or update of release_date, week_id on public.films
  for each row execute function public.gate_film_release_date();

-- ---------------------------------------------------------------------------
-- 5. Grants. week_of() is a pure date helper with no data access, so exposing
--    it to authenticated callers leaks nothing and lets the UI ask SQL rather
--    than trusting its own copy.
-- ---------------------------------------------------------------------------
revoke all on function public.week_of(date) from public;
grant execute on function public.week_of(date) to authenticated, service_role;
