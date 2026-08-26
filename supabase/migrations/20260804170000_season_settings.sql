-- A season carries its own settings, seeded from the league (2026-08-04).
--
-- THIS REVERSES ADR-059, which was decided on 2026-08-03 and said "settings
-- live on the league only; a season has no settings of its own". That decision
-- solved a real problem — two tables drifting, and nobody able to say which one
-- a running season obeyed — but it solved it by making a league's rules
-- unchangeable without rewriting history: alter the bankroll and every season
-- ever played recomputes, because they were all reading the same row.
--
-- The developer's model, stated plainly: the LEAGUE holds defaults, a SEASON
-- holds what is actually being played, and a WEEK holds its own close time.
-- Season 34 can run a $100 bankroll and Season 35 a $150 one without either
-- rewriting the other, which is what a pool that has run for thirty-odd years
-- actually needs.
--
-- HOW THIS AVOIDS THE DRIFT ADR-059 WAS AVOIDING. There is still exactly one
-- accessor — settings_for_season() — and it is what every reader already uses:
-- nine SQL functions and one app helper, none of which changes. It now answers
-- from the season's row and falls back to the league's, so "which settings does
-- this season obey" has the same single answer it had yesterday, from a
-- different table.
--
-- THE RETURN TYPE STAYS league_settings, and the row is populated FIELD BY
-- FIELD BY NAME rather than by a composite cast. A cast would depend on the two
-- tables keeping identical column order forever, which is the kind of coupling
-- that breaks silently the first time somebody adds a column to one of them.

-- ---------------------------------------------------------------------------
-- 1. The table. Every setting column, NOT NULL, because a season is seeded
--    complete — this is a copy taken at birth, not a sparse override sheet.
-- ---------------------------------------------------------------------------
create table if not exists public.season_settings (
  season_id                uuid primary key references public.seasons(id) on delete cascade,
  fake_bankroll            integer     not null default 100,
  top_n_distinct           integer     not null default 3,
  min_bid                  integer     not null default 1,
  buy_in                   integer     not null default 35,
  payout_structure         jsonb       not null default
    '{"third":"buy_in_refund","first_pct":70,"third_pct":0,"second_pct":30,"dessert_penalty":3,"efficiency_prize":15}'::jsonb,
  bids_due_dow             integer     not null default 4,
  bids_due_time            time        not null default '12:00:00',
  bids_due_tz              text        not null default 'America/New_York',
  league_type              text        not null default 'cash',
  default_season_length    integer     not null default 10,
  include_limited_releases boolean     not null default false,
  side_bets_enabled        boolean     not null default true,
  box_office_days          smallint[]  not null default '{5,6,7}'::smallint[],
  created_at               timestamptz not null default now()
);

comment on table public.season_settings is
  'What a season is ACTUALLY played under, copied from its league at creation. '
  'The league row is the default for the next season, not a live pointer — '
  'changing it never rewrites a season already under way. Read through '
  'settings_for_season(), never directly.';

alter table public.season_settings enable row level security;

-- Readable by anyone who can see the season. The same shape league_settings
-- uses: a member policy, plus the GRANT that makes it more than decoration.
-- (A policy without a grant is dead code — Postgres checks privileges BEFORE
-- row-level security. league_invites and league_announcements both shipped
-- without one and rendered empty while every RPC kept working.)
drop policy if exists season_settings_select on public.season_settings;
create policy season_settings_select on public.season_settings
  for select to authenticated
  using (is_season_member(season_id));

grant select on public.season_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Seed every season that already exists, from its league.
-- ---------------------------------------------------------------------------
insert into public.season_settings (
  season_id, fake_bankroll, top_n_distinct, min_bid, buy_in, payout_structure,
  bids_due_dow, bids_due_time, bids_due_tz, league_type, default_season_length,
  include_limited_releases, side_bets_enabled, box_office_days
)
select s.id, ls.fake_bankroll, ls.top_n_distinct, ls.min_bid, ls.buy_in,
       ls.payout_structure, ls.bids_due_dow, ls.bids_due_time, ls.bids_due_tz,
       ls.league_type, ls.default_season_length, ls.include_limited_releases,
       ls.side_bets_enabled, ls.box_office_days
from seasons s
join league_settings ls on ls.league_id = s.league_id
on conflict (season_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. settings_for_season — the one accessor, now answering from the season.
--
--    Kept as `returns league_settings` so all nine SQL callers and the app's
--    getSettingsForSeason keep working untouched. plpgsql and named assignment
--    rather than a row cast, for the reason in the header.
-- ---------------------------------------------------------------------------
create or replace function public.settings_for_season(p_season_id uuid)
returns public.league_settings
language plpgsql stable security definer set search_path = public
as $$
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
  v.include_limited_releases := s.include_limited_releases;
  v.side_bets_enabled        := s.side_bets_enabled;
  v.box_office_days          := s.box_office_days;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. create_season seeds the copy.
--    Body from the definition 20260804080000 installed; only the insert is new.
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

  insert into seasons (name, league_id, created_by, status)
  values (v_name, p_league_id, auth.uid(), 'active')
  returning id into v_season_id;

  -- The season's own copy of the rules, taken now. From this moment the league
  -- row is a default for the NEXT season and nothing more.
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
-- 5. Editing the season that is being played.
--
--    THE BANKROLL GATE lives here. Changing the bankroll recomputes everyone's
--    remaining budget INCLUDING past spending, so once a week has been resolved
--    — the moment money is actually charged — it would rewrite what people have
--    already spent and who could afford what. Before that, no budget has been
--    debited and it is still setup.
-- ---------------------------------------------------------------------------
create or replace function public.update_season_settings(
  p_season_id uuid,
  p_fake_bankroll integer,
  p_top_n_distinct integer,
  p_min_bid integer,
  p_buy_in integer,
  p_payout_structure jsonb,
  p_bids_due_dow integer,
  p_bids_due_time time without time zone,
  p_bids_due_tz text,
  p_league_type text default 'cash',
  p_default_season_length integer default 10,
  p_include_limited_releases boolean default false,
  p_side_bets_enabled boolean default true,
  p_box_office_days smallint[] default '{5,6,7}'::smallint[],
  /** When true the same values are also written to the league, so the NEXT
   *  season starts from them. Off by default: editing this season must not
   *  quietly redefine the league. */
  p_also_set_league_default boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old    season_settings%rowtype;
  v_season seasons%rowtype;
  v_bad    smallint[];
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

  if p_box_office_days is null or array_length(p_box_office_days, 1) is null then
    raise exception 'at least one box-office day must be counted';
  end if;

  select array_agg(d order by d) into v_bad
  from unnest(p_box_office_days) d
  where d <= p_bids_due_dow;
  if v_bad is not null then
    raise exception
      'box office cannot be counted on % — bidding is open until %. Pick days after the cutoff.',
      (select string_agg(iso_weekday_name(d), ', ') from unnest(v_bad) d),
      iso_weekday_name(p_bids_due_dow);
  end if;

  -- THE BANKROLL GATE.
  if p_fake_bankroll is distinct from v_old.fake_bankroll
     and exists (
       select 1 from weeks w
       where w.season_id = p_season_id and w.status in ('resolved', 'scored')
     )
  then
    raise exception
      'the bankroll cannot change once a week has been resolved — winners have already been charged, and changing it now would rewrite what everyone has spent. It can be set on the next season.';
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
    include_limited_releases = p_include_limited_releases,
    side_bets_enabled        = p_side_bets_enabled,
    box_office_days          = p_box_office_days
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
      include_limited_releases = p_include_limited_releases,
      side_bets_enabled        = p_side_bets_enabled,
      box_office_days          = p_box_office_days
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
              'include_limited_releases', p_include_limited_releases,
              'side_bets_enabled', p_side_bets_enabled,
              'box_office_days', p_box_office_days)));
end;
$$;

revoke all on function public.update_season_settings(
  uuid, integer, integer, integer, integer, jsonb, integer, time without time zone,
  text, text, integer, boolean, boolean, smallint[], boolean) from public, anon;
grant execute on function public.update_season_settings(
  uuid, integer, integer, integer, integer, jsonb, integer, time without time zone,
  text, text, integer, boolean, boolean, smallint[], boolean) to authenticated;
