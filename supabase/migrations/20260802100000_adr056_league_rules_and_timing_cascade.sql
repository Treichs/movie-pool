-- ============================================================================
-- ADR-056 — one timing knob, a cascading week rhythm, and league-level rules
--
-- Two changes that arrived together because the league/season setup rework
-- needs both, and they touch the same functions.
--
-- 1. LEAGUE RULE DEFAULTS. Until now `rule_configs` was keyed
--    `unique(season_id)` and there was no league-level rule storage at all —
--    a new season inherited nothing from its league, only the column defaults.
--    `league_rule_defaults` is the league's answer sheet; `create_season`
--    copies it into the season's `rule_configs`, and the season may then
--    diverge freely (ADR-009 keeps rules editable after activation).
--
-- 2. THE TIMING CASCADE (ADR-056, superseding the timing half of ADR-052).
--    A league configures ONE thing: the day and time bids are due. That
--    deadline IS the close — at it the week locks itself, amounts are
--    revealed (ADR-022), and the next release week opens in the same act.
--    Week 1 has no predecessor and opens when the season becomes active.
--    Resolving winners stays a commissioner act that nothing waits on.
--
--    Consequently the ADR-052 sealed late-offer window has ZERO width: a late
--    offer lived between "deadline passed" and "commissioner closes", and
--    those are now the same instant. `bids.late`, `get_late_offers` and
--    `review_late_offer` are dropped rather than left unreachable.
--
--    The `bidding_automation` opt-out goes too. It existed so that seasons
--    in flight on ADR-052's migration day kept the old advisory behaviour;
--    the rhythm is now simply how the game runs (rulebook §4, rewritten
--    2026-08-02 BEFORE this migration, as rule changes must be).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The league's rule defaults.
--
-- Mirrors the configurable set of rule_configs, minus everything derived and
-- minus award_defs (still out of the v1 form). Seeded with the rulebook's own
-- defaults so a commissioner who changes nothing gets a legal game.
-- ---------------------------------------------------------------------------
create table public.league_rule_defaults (
  id                     uuid primary key default gen_random_uuid(),
  league_id              uuid not null unique references public.leagues (id) on delete cascade,
  fake_bankroll          integer not null default 100  check (fake_bankroll > 0),
  screen_threshold       integer not null default 1000 check (screen_threshold >= 0),
  top_n_distinct         integer not null default 3    check (top_n_distinct >= 1),
  min_bid                integer not null default 1    check (min_bid >= 1),
  capture_timing         text    not null default 'monday_morning',
  include_previews       boolean not null default true,
  preview_start_weekday  public.weekday_start not null default 'thu',
  buy_in                 integer not null default 35   check (buy_in >= 0),
  payout_structure       jsonb   not null default
    '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "efficiency_prize": 0, "dessert_penalty": 0}'::jsonb,
  -- ADR-056: the single timing knob. Everything else about the week rhythm
  -- is derived from it.
  bids_due_dow           integer not null default 4 check (bids_due_dow between 1 and 7),
  bids_due_time          time    not null default '12:00',
  bids_due_tz            text    not null default 'America/New_York',
  created_at             timestamptz not null default now()
);

comment on table public.league_rule_defaults is
  'ADR-056: the league''s answer sheet. create_season copies this into the '
  'season''s rule_configs; the season may then diverge (ADR-009).';
comment on column public.league_rule_defaults.bids_due_dow is
  'ADR-056: ISO weekday (1=Mon) bids are due. The deadline IS the close — the '
  'week locks itself at it and the next week opens in the same act.';

create index league_rule_defaults_league_idx on public.league_rule_defaults (league_id);

-- Every existing league gets one, carrying its CURRENT season's rules where it
-- has one, so nothing silently re-defaults under a league mid-flight.
insert into public.league_rule_defaults (
  league_id, fake_bankroll, screen_threshold, top_n_distinct, min_bid,
  capture_timing, include_previews, preview_start_weekday, buy_in,
  payout_structure, bids_due_dow, bids_due_time, bids_due_tz)
select
  l.id,
  coalesce(rc.fake_bankroll, 100),
  coalesce(rc.screen_threshold, 1000),
  coalesce(rc.top_n_distinct, 3),
  coalesce(rc.min_bid, 1),
  coalesce(rc.capture_timing, 'monday_morning'),
  coalesce(rc.include_previews, true),
  coalesce(rc.preview_start_weekday, 'thu'),
  coalesce(rc.buy_in, 35),
  case when rc.payout_structure is null or rc.payout_structure = '{}'::jsonb
       then '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "efficiency_prize": 0, "dessert_penalty": 0}'::jsonb
       else rc.payout_structure end,
  coalesce(rc.auto_close_dow, 4),
  coalesce(rc.auto_close_time, '12:00'),
  coalesce(rc.automation_tz, 'America/New_York')
from public.leagues l
left join lateral (
  select * from public.rule_configs rc2
  join public.seasons s on s.id = rc2.season_id
  where s.league_id = l.id
  order by s.created_at desc
  limit 1
) rc on true;

-- RLS: the rls_auto_enable event trigger turns RLS on for new tables, so the
-- policy is what makes the table readable — and the GRANT is what makes the
-- policy reachable. Both, or the read silently returns nothing (the
-- league_invites lesson, 2026-08-02). Writes go only through the RPCs.
create policy league_rule_defaults_select on public.league_rule_defaults
  for select to authenticated
  using (public.is_league_member(league_id));

grant select on public.league_rule_defaults to authenticated;
grant select, insert, update, delete on public.league_rule_defaults to service_role;

-- ---------------------------------------------------------------------------
-- 2. rule_configs sheds ADR-052's second schedule.
--
-- auto_close_* is not deleted but RENAMED: it is the surviving knob, and a
-- rename keeps every existing season's configured deadline rather than
-- resetting it to a default.
-- ---------------------------------------------------------------------------
alter table public.rule_configs
  rename column auto_close_dow to bids_due_dow;
alter table public.rule_configs
  rename column auto_close_time to bids_due_time;
alter table public.rule_configs
  rename column automation_tz to bids_due_tz;

alter table public.rule_configs
  drop column auto_open_dow,
  drop column auto_open_time,
  drop column bidding_automation,
  -- Was a free-text advisory string ('Thursday 12:00 ET') from the era when
  -- the deadline was advisory. It is now derivable from the three columns
  -- above, and a hand-typed second copy can only ever disagree with them.
  drop column bid_deadline_default;

comment on column public.rule_configs.bids_due_dow is
  'ADR-056: ISO weekday (1=Mon) bids are due, copied from the league at '
  'season creation. The deadline is the close.';

-- ---------------------------------------------------------------------------
-- 3. Late offers are removed.
--
-- Dropped before the functions that reference the column are rewritten, so a
-- surviving reference fails this migration rather than shipping dead.
-- ---------------------------------------------------------------------------
drop function if exists public.get_late_offers(uuid);
drop function if exists public.review_late_offer(uuid, boolean);

-- A pending offer was never part of its week. Deleting them is the same
-- outcome close_week would have reached at the reveal.
delete from public.bids where late;
alter table public.bids drop column late;

-- ---------------------------------------------------------------------------
-- 4. create_league — always season 1, and it seeds the league's rules.
--
-- ADR-025 made the first season number a creation-time input that could never
-- change; the developer has now fixed it at 1 (2026-08-02), so it leaves the
-- signature entirely. leagues.season_start_number stays for the leagues that
-- already carry a different value.
--
-- Both prior overloads are dropped: (text) + (text, integer) would resolve a
-- one-argument call to whichever survives, which is the trap ADR-020 already
-- documented.
-- ---------------------------------------------------------------------------
drop function if exists public.create_league(text);
drop function if exists public.create_league(text, integer);

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

  -- Rulebook defaults; the setup page's rules step then edits them.
  insert into league_rule_defaults (league_id) values (v_league_id);

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name)));

  return v_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. update_league_rule_defaults — the league setup page's rules step.
--
-- Editing the league's answer sheet does NOT touch any season already created
-- from it: a season took its copy at creation and owns it thereafter. That is
-- the whole point of the copy, and it is why this function deliberately has
-- no cascade.
-- ---------------------------------------------------------------------------
create or replace function public.update_league_rule_defaults(
  p_league_id             uuid,
  p_fake_bankroll         integer,
  p_screen_threshold      integer,
  p_top_n_distinct        integer,
  p_min_bid               integer,
  p_capture_timing        text,
  p_include_previews      boolean,
  p_preview_start_weekday public.weekday_start,
  p_buy_in                integer,
  p_payout_structure      jsonb,
  p_bids_due_dow          integer,
  p_bids_due_time         time,
  p_bids_due_tz           text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can change the league rules';
  end if;

  insert into league_rule_defaults (
    league_id, fake_bankroll, screen_threshold, top_n_distinct, min_bid,
    capture_timing, include_previews, preview_start_weekday, buy_in,
    payout_structure, bids_due_dow, bids_due_time, bids_due_tz)
  values (
    p_league_id, p_fake_bankroll, p_screen_threshold, p_top_n_distinct, p_min_bid,
    p_capture_timing, p_include_previews, p_preview_start_weekday, p_buy_in,
    p_payout_structure, p_bids_due_dow, p_bids_due_time, p_bids_due_tz)
  on conflict (league_id) do update set
    fake_bankroll         = excluded.fake_bankroll,
    screen_threshold      = excluded.screen_threshold,
    top_n_distinct        = excluded.top_n_distinct,
    min_bid               = excluded.min_bid,
    capture_timing        = excluded.capture_timing,
    include_previews      = excluded.include_previews,
    preview_start_weekday = excluded.preview_start_weekday,
    buy_in                = excluded.buy_in,
    payout_structure      = excluded.payout_structure,
    bids_due_dow          = excluded.bids_due_dow,
    bids_due_time         = excluded.bids_due_time,
    bids_due_tz           = excluded.bids_due_tz;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'update_league_rule_defaults',
          jsonb_build_object('league_id', p_league_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. create_season — copies the league's rules instead of falling back to
--    column defaults. Everything else is unchanged from the ADR-020 body.
-- ---------------------------------------------------------------------------
create or replace function public.create_season(p_league_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id uuid;
  v_league    leagues%rowtype;
  v_defaults  league_rule_defaults%rowtype;
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

  -- A league created before this migration always has a defaults row (the
  -- backfill above), so the fallback is belt only.
  select * into v_defaults from league_rule_defaults where league_id = p_league_id;
  if found then
    insert into rule_configs (
      season_id, fake_bankroll, screen_threshold, top_n_distinct, min_bid,
      capture_timing, include_previews, preview_start_weekday, buy_in,
      payout_structure, bids_due_dow, bids_due_time, bids_due_tz)
    values (
      v_season_id, v_defaults.fake_bankroll, v_defaults.screen_threshold,
      v_defaults.top_n_distinct, v_defaults.min_bid, v_defaults.capture_timing,
      v_defaults.include_previews, v_defaults.preview_start_weekday,
      v_defaults.buy_in, v_defaults.payout_structure,
      v_defaults.bids_due_dow, v_defaults.bids_due_time, v_defaults.bids_due_tz);
  else
    insert into rule_configs (season_id) values (v_season_id);
  end if;

  insert into season_members (season_id, profile_id, role)
  select v_season_id, lm.profile_id, lm.role
  from league_members lm
  where lm.league_id = p_league_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('name', v_name, 'league_id', p_league_id,
                             'number', v_number,
                             'rules_from_league', v_defaults.id is not null));

  return v_season_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The cascade, as ONE rule stated once.
--
-- A draft week opens when its predecessor is done with bidding — or, for week
-- 1, when the season goes active — provided it has something to bid on. A
-- week with no eligible film yet is skipped, not force-opened; the hourly
-- runner re-checks, so it opens as soon as the commissioner adds one.
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
    where w.status = 'draft'
      and s.status = 'active'
      and (p_season_id is null or w.season_id = p_season_id)
      -- Nothing earlier is still bidding or waiting to. Stated as the absence
      -- of an unfinished predecessor rather than as "the previous week is
      -- locked", because that one predicate covers both cases at once: for
      -- week 1 there is no earlier week and it is vacuously true, and for any
      -- later week it is true only when EVERY week before it is done. A
      -- season can therefore never skip ahead because week 2 happens to be
      -- locked while week 5 is not.
      and not exists (
        select 1 from weeks gap
        where gap.season_id = w.season_id
          and gap.number < w.number
          and gap.status in ('draft', 'open')
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
                               'cascaded', true));
    v_opened := v_opened + 1;
  end loop;

  return v_opened;
end;
$$;

comment on function public.open_due_weeks(uuid) is
  'ADR-056: opens every draft week whose predecessor has finished bidding '
  '(week 1: whose season is active) and which has an eligible film. '
  'Idempotent — safe to call from close_week, season activation, or the cron.';

-- ---------------------------------------------------------------------------
-- 8. close_week — now reachable two ways, and it drives the cascade.
--
-- p_auto distinguishes the deadline firing from a commissioner closing early:
-- the early close is a commissioner act and is checked as one, the automatic
-- close acts for nobody. Both reveal, and both open the next week.
--
-- The one-argument version is DROPPED, not left alongside. `create or replace`
-- with a different argument list makes an OVERLOAD, and a one-argument call
-- would keep binding to the old body — silently skipping the cascade. This is
-- the same trap that resurrected a dead create_season on 2026-08-02.
-- ---------------------------------------------------------------------------
drop function if exists public.close_week(uuid);

create or replace function public.close_week(p_week_id uuid, p_auto boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not p_auto and not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can close bidding';
  end if;
  if v_week.status <> 'open' then
    raise exception 'week is not open for bidding';
  end if;

  update weeks set status = 'locked' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, case when p_auto then null else auth.uid() end,
          'close_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'automatic', p_auto));

  -- ADR-056: the reveal opens the next week, in the same act.
  perform open_due_weeks(v_week.season_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. update_season_status — activating a season opens its first week.
-- ---------------------------------------------------------------------------
create or replace function public.update_season_status(
  p_season_id uuid,
  p_status    public.season_status
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_season seasons%rowtype;
  v_ok boolean;
begin
  select * into v_season from seasons where id = p_season_id for update;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can change the season status';
  end if;

  v_ok := (v_season.status = 'draft'     and p_status = 'active')
       or (v_season.status = 'active'    and p_status = 'completed')
       or (v_season.status = 'completed' and p_status = 'archived');
  if not v_ok then
    raise exception 'cannot move season from % to %', v_season.status, p_status;
  end if;

  update seasons set status = p_status where id = p_season_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'update_season_status',
          jsonb_build_object('from', v_season.status, 'to', p_status));

  -- ADR-056: week 1 has no predecessor to cascade from — the season starting
  -- IS its trigger.
  if p_status = 'active' then
    perform open_due_weeks(p_season_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. create_week — new column names, no opt-out flag, and the no-retroactive
--     rule from 20260801200000 carried forward INTACT.
--
--     That rule matters more now, not less: a defaulted deadline that is
--     already in the past would previously turn every bid into a late offer,
--     and would now hand the week straight to the runner to lock the moment it
--     opens. A week created after its own close time is left with no deadline
--     and closed by hand.
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
  v_config   rule_configs%rowtype;
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

  select * into v_config from rule_configs where season_id = p_season_id;
  if v_deadline is null then
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

comment on function public.create_week(uuid, integer, date, timestamptz) is
  'Creates a release week, defaulting its bid deadline from the season''s '
  'bids-due schedule but ONLY when that moment is still ahead — a week created '
  'after its own close time is left unenforced (20260801200000).';

-- ---------------------------------------------------------------------------
-- 10b. seed_season_weeks — the same defaulting, unconditional now that the
--      automation opt-out is gone.
-- ---------------------------------------------------------------------------
create or replace function public.seed_season_weeks(
  p_season_id          uuid,
  p_first_opening_date date,
  p_week_count         integer
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_config   rule_configs%rowtype;
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

  select * into v_config from rule_configs where season_id = p_season_id;

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
-- 11. place_bid / place_bids — the deadline branch is gone entirely.
--
-- There is nothing left to decide at the deadline: the week is no longer
-- 'open' once it passes, so the status check the functions already performed
-- is the whole enforcement. Both bodies simply lose their late handling.
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
  v_config    rule_configs%rowtype;
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
    raise exception 'film is not eligible for bidding (under the screen threshold)';
  end if;

  select * into v_week from weeks where id = v_film.week_id;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  -- Belt for the gap between the deadline passing and the runner's next tick.
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

  select * into v_config from rule_configs where season_id = v_week.season_id;
  if not found then
    raise exception 'season has no rule configuration';
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
  v_config          rule_configs%rowtype;
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

  select * into v_config from rule_configs where season_id = v_week.season_id;
  if not found then
    raise exception 'season has no rule configuration';
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
    raise exception '"%" is not eligible for bidding (under the screen threshold)', v_bad_title;
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
-- 12. get_week_bidders / resolve_week lose their `late` predicates.
-- ---------------------------------------------------------------------------
create or replace function public.get_week_bidders(p_week_id uuid)
returns table (
  film_id          uuid,
  season_member_id uuid,
  display_name     text
)
language sql stable security definer set search_path = public
as $$
  select
    b.film_id,
    b.season_member_id,
    pr.display_name
  from bids b
  join films f          on f.id  = b.film_id
  join weeks w          on w.id  = f.week_id
  join season_members sm on sm.id = b.season_member_id
  join profiles pr      on pr.id = sm.profile_id
  where f.week_id = p_week_id
    and public.is_season_member(w.season_id)
$$;

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

  select top_n_distinct into v_top_n
  from rule_configs where season_id = v_week.season_id;
  if v_top_n is null then
    raise exception 'season has no rule configuration';
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

-- ---------------------------------------------------------------------------
-- 13. update_rule_config — the season's copy, with the ADR-052 parameters
--     replaced by the single knob. Drop first: the signature changes, and a
--     create-or-replace cannot alter an argument list.
-- ---------------------------------------------------------------------------
drop function if exists public.update_rule_config(
  uuid, integer, integer, integer, integer, text, text, boolean,
  public.weekday_start, integer, jsonb, boolean, integer, time, integer, time, text);

create or replace function public.update_rule_config(
  p_season_id             uuid,
  p_fake_bankroll         integer,
  p_screen_threshold      integer,
  p_top_n_distinct        integer,
  p_min_bid               integer,
  p_capture_timing        text,
  p_include_previews      boolean,
  p_preview_start_weekday public.weekday_start,
  p_buy_in                integer,
  p_payout_structure      jsonb,
  p_bids_due_dow          integer,
  p_bids_due_time         time,
  p_bids_due_tz           text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_season seasons%rowtype;
  v_old    rule_configs%rowtype;
begin
  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can change the rules';
  end if;

  select * into v_old from rule_configs where season_id = p_season_id for update;
  if not found then
    raise exception 'season has no rule configuration';
  end if;

  update rule_configs set
    fake_bankroll         = p_fake_bankroll,
    screen_threshold      = p_screen_threshold,
    top_n_distinct        = p_top_n_distinct,
    min_bid               = p_min_bid,
    capture_timing        = p_capture_timing,
    include_previews      = p_include_previews,
    preview_start_weekday = p_preview_start_weekday,
    buy_in                = p_buy_in,
    payout_structure      = p_payout_structure,
    bids_due_dow          = p_bids_due_dow,
    bids_due_time         = p_bids_due_time,
    bids_due_tz           = p_bids_due_tz
  where season_id = p_season_id;

  if v_season.status <> 'draft' then
    insert into audit_log (season_id, actor, action, detail)
    values (p_season_id, auth.uid(), 'update_rule_config',
            jsonb_build_object(
              'old', to_jsonb(v_old) - 'id' - 'season_id' - 'created_at',
              'new', jsonb_build_object(
                'fake_bankroll', p_fake_bankroll,
                'screen_threshold', p_screen_threshold,
                'top_n_distinct', p_top_n_distinct,
                'min_bid', p_min_bid,
                'capture_timing', p_capture_timing,
                'include_previews', p_include_previews,
                'preview_start_weekday', p_preview_start_weekday,
                'buy_in', p_buy_in,
                'payout_structure', p_payout_structure,
                'bids_due_dow', p_bids_due_dow,
                'bids_due_time', p_bids_due_time,
                'bids_due_tz', p_bids_due_tz)));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. The runner: lock what is due, then open what that unblocked.
--
-- Order matters and is the whole point — locking first means a week closed by
-- this tick opens its successor in the same tick, rather than waiting an hour.
-- ---------------------------------------------------------------------------
create or replace function public.run_bidding_automation()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_locked integer := 0;
  v_opened integer;
  r record;
begin
  for r in
    select w.id
    from weeks w
    join seasons s on s.id = w.season_id
    where w.status = 'open'
      and s.status = 'active'
      and w.bid_deadline is not null
      and now() >= w.bid_deadline
    order by w.season_id, w.number
  loop
    perform close_week(r.id, true);
    v_locked := v_locked + 1;
  end loop;

  -- close_week already cascaded for the seasons it touched; this catches the
  -- rest — a season activated between ticks, or a week that had no eligible
  -- film when its predecessor closed and has one now.
  v_opened := open_due_weeks(null);

  return v_locked + v_opened;
end;
$$;

comment on function public.run_bidding_automation() is
  'ADR-056: locks every open week past its deadline (the reveal), then opens '
  'every draft week thereby unblocked. Service-role only; driven by pg_cron '
  'and /api/cron/automate.';

-- ---------------------------------------------------------------------------
-- 15. Grants — ADR-004 deliberate exposure. open_due_weeks is an internal
--     helper called by SECURITY DEFINER functions that have already done
--     their own authorization, so no role gets to call it directly.
-- ---------------------------------------------------------------------------
revoke all on function public.create_league(text)                    from public, anon;
revoke all on function public.create_season(uuid)                    from public, anon;
revoke all on function public.place_bid(uuid, integer)               from public, anon;
revoke all on function public.place_bids(jsonb)                      from public, anon;
revoke all on function public.get_week_bidders(uuid)                 from public, anon;
revoke all on function public.close_week(uuid, boolean)              from public, anon;
revoke all on function public.create_week(uuid, integer, date, timestamptz) from public, anon;
revoke all on function public.seed_season_weeks(uuid, date, integer)  from public, anon;
revoke all on function public.resolve_week(uuid)                     from public, anon;
revoke all on function public.update_season_status(uuid, public.season_status) from public, anon;
revoke all on function public.open_due_weeks(uuid)                   from public, anon, authenticated;
revoke all on function public.run_bidding_automation()               from public, anon, authenticated;
revoke all on function public.update_rule_config(uuid, integer, integer, integer, integer, text, boolean, public.weekday_start, integer, jsonb, integer, time, text) from public, anon;
revoke all on function public.update_league_rule_defaults(uuid, integer, integer, integer, integer, text, boolean, public.weekday_start, integer, jsonb, integer, time, text) from public, anon;

grant execute on function public.create_league(text)                 to authenticated;
grant execute on function public.create_season(uuid)                 to authenticated;
grant execute on function public.place_bid(uuid, integer)            to authenticated;
grant execute on function public.place_bids(jsonb)                   to authenticated;
grant execute on function public.get_week_bidders(uuid)              to authenticated;
grant execute on function public.close_week(uuid, boolean)           to authenticated;
grant execute on function public.create_week(uuid, integer, date, timestamptz) to authenticated;
grant execute on function public.seed_season_weeks(uuid, date, integer) to authenticated;
grant execute on function public.resolve_week(uuid)                  to authenticated;
grant execute on function public.update_season_status(uuid, public.season_status) to authenticated;
grant execute on function public.run_bidding_automation()            to service_role;
grant execute on function public.open_due_weeks(uuid)                to service_role;
grant execute on function public.update_rule_config(uuid, integer, integer, integer, integer, text, boolean, public.weekday_start, integer, jsonb, integer, time, text) to authenticated;
grant execute on function public.update_league_rule_defaults(uuid, integer, integer, integer, integer, text, boolean, public.weekday_start, integer, jsonb, integer, time, text) to authenticated;
