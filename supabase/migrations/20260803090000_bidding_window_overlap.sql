-- ---------------------------------------------------------------------------
-- The two-week bidding overlap (2026-08-03).
--
-- SUPERSEDES ADR-058's cascade. ADR-058 made the bid deadline close a week AND
-- open the next one in the same act, which guaranteed exactly one open week at
-- a time. That guarantee is now deliberately given up:
--
--   * a week's bidding OPENS app-wide at 12:00am on the Monday of the week
--     BEFORE its own Mon-Sun window, on a global clock;
--   * it CLOSES at the league's own bids-due day and time, which may be no
--     later than Thursday, so bidding always ends before the films open on the
--     Friday.
--
-- Because opening no longer waits for the predecessor to close, TWO weeks are
-- open from Monday 00:00 until the earlier one's deadline, and one week for
-- the rest of the cycle. "Current week" therefore means the EARLIEST still-open
-- week, everywhere in the app.
--
-- Worked example, league closing Monday 12:00:
--   week 1 opens Fri 8/14  -> its Mon-Sun window starts 8/10
--                          -> bidding opens Mon 8/3 00:00
--                          -> bidding closes Mon 8/10 12:00
--   week 2 opens Fri 8/21  -> window starts 8/17
--                          -> bidding opens Mon 8/10 00:00   <-- overlap here
--
-- close_week still calls open_due_weeks afterwards. That call is now a harmless
-- re-check rather than the mechanism: the clock decides, so nothing can be
-- opened early by a close. It is kept because a week whose slate was empty at
-- its own open moment must still open the instant a film is added.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The open moment, stated once.
--
-- Derived rather than stored-and-trusted: the column added below is for
-- DISPLAY, and every gate recomputes from opening_date so a stale or missing
-- value can never let a week open early.
-- ---------------------------------------------------------------------------
create or replace function public.week_bids_open_at(
  p_opening_date date,
  p_tz           text
)
returns timestamptz
language sql immutable
as $$
  -- The Monday of the opening date's own week, minus seven days, at local
  -- midnight. isodow is 1 on Monday, so subtracting (isodow - 1) lands on it.
  select (((p_opening_date - (extract(isodow from p_opening_date)::int - 1)) - 7)::timestamp)
         at time zone coalesce(p_tz, 'America/New_York')
$$;

comment on function public.week_bids_open_at(date, text) is
  'The instant bidding opens for a week: 12:00am on the Monday of the week '
  'before the one the films open in. Global clock, not a cascade.';

revoke all on function public.week_bids_open_at(date, text) from public, anon;
grant execute on function public.week_bids_open_at(date, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Surface it on the week, for the UI.
-- ---------------------------------------------------------------------------
alter table public.weeks
  add column if not exists bids_open_at timestamptz;

comment on column public.weeks.bids_open_at is
  'When bidding opens: 12am Monday of the preceding week. Display convenience — '
  'open_due_weeks recomputes from opening_date rather than trusting this.';

update public.weeks w
set bids_open_at = week_bids_open_at(w.opening_date, ls.bids_due_tz)
from public.seasons s
join public.league_settings ls on ls.league_id = s.league_id
where s.id = w.season_id
  and w.bids_open_at is distinct from week_bids_open_at(w.opening_date, ls.bids_due_tz);

-- ---------------------------------------------------------------------------
-- 3. Cap the deadline at Thursday.
--
-- Films open on the Friday, so a deadline on Friday or later would let a player
-- bid on a film that is already in cinemas. Clamp anything that already sits
-- past Thursday before adding the constraint, or the ALTER fails on live data.
-- ---------------------------------------------------------------------------
update public.league_settings set bids_due_dow = 4 where bids_due_dow > 4;

alter table public.league_settings
  drop constraint if exists league_rule_defaults_bids_due_dow_check;
alter table public.league_settings
  drop constraint if exists league_settings_bids_due_dow_check;
alter table public.league_settings
  add constraint league_settings_bids_due_dow_check
  check (bids_due_dow between 1 and 4);

comment on column public.league_settings.bids_due_dow is
  'ISO weekday bids are due (1=Mon .. 4=Thu). Capped at Thursday because the '
  'films open on the Friday — a later deadline would take bids on a film that '
  'is already showing.';

-- ---------------------------------------------------------------------------
-- 4. create_week — record the open moment alongside the deadline.
-- ---------------------------------------------------------------------------
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
  v_open_at  timestamptz;
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

  if v_config.league_id is not null then
    v_open_at := week_bids_open_at(p_opening_date, v_config.bids_due_tz);
  end if;

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

  insert into weeks (season_id, number, opening_date, bid_deadline, bids_open_at)
  values (p_season_id, p_number, p_opening_date, v_deadline, v_open_at)
  returning id into v_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'create_week',
          jsonb_build_object('week_id', v_week_id, 'week_number', p_number,
                             'opening_date', p_opening_date,
                             'bid_deadline', v_deadline,
                             'bids_open_at', v_open_at,
                             'deadline_defaulted', p_bid_deadline is null));

  return v_week_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. seed_season_weeks — same, for the bulk path.
-- ---------------------------------------------------------------------------
create or replace function public.seed_season_weeks(
  p_season_id            uuid,
  p_first_opening_date   date,
  p_week_count           integer
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
    raise exception 'only the commissioner can seed weeks';
  end if;
  if p_week_count is null or p_week_count < 1 then
    raise exception 'week count must be 1 or higher';
  end if;
  if exists (select 1 from weeks where season_id = p_season_id) then
    raise exception 'this season already has weeks';
  end if;

  v_config := settings_for_season(p_season_id);
  if v_config.league_id is null then
    raise exception 'season has no settings';
  end if;

  for i in 0 .. p_week_count - 1 loop
    v_opening  := p_first_opening_date + (i * 7);
    v_week_of  := v_opening - (extract(isodow from v_opening)::int - 1);
    v_deadline := ((v_week_of + (v_config.bids_due_dow - 1))::timestamp
                   + v_config.bids_due_time)
                  at time zone v_config.bids_due_tz;
    if v_deadline <= now() then
      v_deadline := null;
    end if;

    insert into weeks (season_id, number, opening_date, bid_deadline, bids_open_at)
    values (p_season_id, i + 1, v_opening, v_deadline,
            week_bids_open_at(v_opening, v_config.bids_due_tz));
  end loop;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'seed_weeks',
          jsonb_build_object('count', p_week_count,
                             'first_opening', p_first_opening_date));

  return p_week_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. open_due_weeks — the clock, not the cascade.
--
-- The change that matters is a DELETION. ADR-056 carried:
--
--     and not exists (select 1 from weeks gap
--                     where gap.season_id = w.season_id
--                       and gap.number < w.number
--                       and gap.status in ('draft','open'))
--
-- That predicate is precisely what forbade a second open week, and it is gone.
-- In its place is a clock condition, recomputed from opening_date so that a
-- missing or stale bids_open_at cannot open a week early.
--
-- What is NOT given up: a week still needs an eligible film before it opens.
-- A week whose slate is empty at its open moment stays draft and opens as soon
-- as the commissioner adds one — which is why close_week and the cron both
-- keep calling this.
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
    select w.id, w.season_id, w.number
    from weeks w
    join seasons s on s.id = w.season_id
    join league_settings ls on ls.league_id = s.league_id
    where w.status = 'draft'
      and s.status = 'active'
      and (p_season_id is null or w.season_id = p_season_id)
      -- The global clock. Derived, never read from the stored column, so the
      -- gate is right even if a backfill was missed.
      and now() >= week_bids_open_at(w.opening_date, ls.bids_due_tz)
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

comment on function public.open_due_weeks(uuid) is
  'Opens every draft week whose global open moment has passed (12am Monday of '
  'the preceding week) and which carries an eligible film. Two weeks may be '
  'open at once — this deliberately no longer waits for the predecessor to '
  'close. Idempotent.';
