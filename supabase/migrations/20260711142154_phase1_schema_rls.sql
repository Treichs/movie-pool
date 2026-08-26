-- ============================================================================
-- Phase 1 — Schema + RLS + place_bid RPC (the blind-bid foundation)
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §3 (data model) §4 (security model) §5 (domain logic)
--   Docs/reference/movie_pool_official_rules.md (canonical rulebook)
--   ADR-001 sum-exposure budget rule   ADR-004 deny-by-default API exposure
--   ADR-006 commissioner also plays (any season member may bid)
--
-- Conventions:
--   * All currency is integer whole dollars (fake bankroll). Box office is
--     numeric $M. Fake money and real money never share a column.
--   * Ownership / remaining budget / standings are DERIVED, never stored.
--   * ADR-004: the project does not auto-expose new tables. Every table below
--     is locked (RLS enabled, no write policies) and only deliberately
--     GRANTed at the bottom of this file.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Enum types
-- ---------------------------------------------------------------------------
create type public.season_status     as enum ('draft', 'active', 'completed', 'archived');
create type public.member_role       as enum ('commissioner', 'player');
create type public.week_status       as enum ('draft', 'open', 'locked', 'resolved', 'scored');
create type public.film_status       as enum ('active', 'removed');
create type public.settlement_status as enum ('draft', 'final');
create type public.weekday_start     as enum ('mon', 'tue', 'wed', 'thu');

-- ---------------------------------------------------------------------------
-- 1. Tables (build plan §3)
-- ---------------------------------------------------------------------------

-- 1:1 with Supabase auth users.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email        text not null,
  created_at   timestamptz not null default now()
);

create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     public.season_status not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Every [Configurable] rulebook value lives here, seeded with rulebook defaults.
create table public.rule_configs (
  id                     uuid primary key default gen_random_uuid(),
  season_id              uuid not null unique references public.seasons (id) on delete cascade,
  fake_bankroll          integer not null default 100  check (fake_bankroll > 0),
  screen_threshold       integer not null default 1000 check (screen_threshold >= 0),
  top_n_distinct         integer not null default 3    check (top_n_distinct >= 1),
  min_bid                integer not null default 1    check (min_bid >= 1),
  capture_timing         text    not null default 'monday_morning',
  bid_deadline_default   text,                        -- advisory, e.g. 'Thursday 12:00 ET'
  include_previews       boolean not null default true,
  preview_start_weekday  public.weekday_start not null default 'thu',
  buy_in                 integer not null default 35   check (buy_in >= 0),  -- OQ-5: to ratify
  payout_structure       jsonb   not null default '{}'::jsonb,
  award_defs             jsonb   not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);

create table public.season_members (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.seasons (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'player',
  created_at timestamptz not null default now(),
  unique (season_id, profile_id)
);

create table public.weeks (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references public.seasons (id) on delete cascade,
  number       integer not null check (number >= 1),
  opening_date date not null,
  bid_deadline timestamptz,                            -- advisory only (ADR-003)
  status       public.week_status not null default 'draft',
  created_at   timestamptz not null default now(),
  unique (season_id, number)
);

create table public.films (
  id             uuid primary key default gen_random_uuid(),
  week_id        uuid not null references public.weeks (id) on delete cascade,
  title          text not null,
  imdb_id        text,
  screen_count   integer check (screen_count >= 0),
  eligible       boolean not null default true,
  status         public.film_status not null default 'active',
  removed_reason text,
  box_office_m   numeric(8, 2) check (box_office_m >= 0),
  tomatometer    integer check (tomatometer between 0 and 100),
  -- Rulebook §6: Score = OpeningBoxOffice_$M × (Tomatometer / 100).
  -- Golden test: 81.4 × 89 → 72.45.
  score          numeric generated always as (round(box_office_m * tomatometer / 100.0, 2)) stored,
  captured_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- The crown jewel. RLS below is what makes bids blind.
create table public.bids (
  id               uuid primary key default gen_random_uuid(),
  film_id          uuid not null references public.films (id) on delete cascade,
  season_member_id uuid not null references public.season_members (id) on delete cascade,
  amount           integer not null check (amount >= 1),  -- whole dollars, min $1
  is_winning       boolean,                               -- set by resolve_week (phase 5)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (film_id, season_member_id)                      -- one bid per film per player
);

-- Season-end real-money true-up (engine lands in phase 9; schema now).
create table public.settlements (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons (id) on delete cascade,
  generated_at    timestamptz not null default now(),
  payout_snapshot jsonb not null default '{}'::jsonb,
  status          public.settlement_status not null default 'draft'
);

create table public.settlement_lines (
  id               uuid primary key default gen_random_uuid(),
  settlement_id    uuid not null references public.settlements (id) on delete cascade,
  season_member_id uuid not null references public.season_members (id) on delete cascade,
  won              integer not null default 0,
  owing            integer not null default 0,
  net              integer not null default 0,
  breakdown        jsonb not null default '{}'::jsonb,
  paid             boolean not null default false
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  season_id  uuid references public.seasons (id) on delete set null,
  actor      uuid references public.profiles (id),
  action     text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index bids_film_id_idx            on public.bids (film_id);
create index bids_season_member_id_idx   on public.bids (season_member_id);
create index films_week_id_idx           on public.films (week_id);
create index weeks_season_id_idx         on public.weeks (season_id);
create index season_members_season_idx   on public.season_members (season_id);
create index season_members_profile_idx  on public.season_members (profile_id);
create index settlement_lines_stl_idx    on public.settlement_lines (settlement_id);
create index audit_log_season_idx        on public.audit_log (season_id);

-- ---------------------------------------------------------------------------
-- 2. Helper functions (build plan §4)
--
-- SECURITY DEFINER so they can consult season_members/weeks from inside RLS
-- policies without recursing into those tables' own policies. All are STABLE
-- and pin search_path.
-- ---------------------------------------------------------------------------

create or replace function public.current_member_id(p_season_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select sm.id
  from season_members sm
  where sm.season_id = p_season_id
    and sm.profile_id = auth.uid()
$$;

create or replace function public.is_season_member(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from season_members sm
    where sm.season_id = p_season_id
      and sm.profile_id = auth.uid()
  )
$$;

create or replace function public.is_commissioner(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from season_members sm
    where sm.season_id = p_season_id
      and sm.profile_id = auth.uid()
      and sm.role = 'commissioner'
  )
$$;

create or replace function public.week_bidding_open(p_week_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from weeks w
    where w.id = p_week_id
      and w.status = 'open'
  )
$$;

-- True iff the caller placed this bid (their own row).
create or replace function public.is_own_member(p_season_member_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from season_members sm
    where sm.id = p_season_member_id
      and sm.profile_id = auth.uid()
  )
$$;

-- Remaining fake budget is DERIVED (build plan §3):
--   bankroll − Σ(winning-bid amounts on ACTIVE films).
-- Losing bids cost nothing (ADR-001); removed films refund by exclusion.
create or replace function public.member_remaining_budget(p_season_member_id uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select rc.fake_bankroll - coalesce((
    select sum(b.amount)
    from bids b
    join films f on f.id = b.film_id
    where b.season_member_id = p_season_member_id
      and b.is_winning is true
      and f.status = 'active'
  ), 0)
  from season_members sm
  join rule_configs rc on rc.season_id = sm.season_id
  where sm.id = p_season_member_id
$$;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security (build plan §4)
--
-- RLS on everything. Phase 1 grants only the read paths the app needs plus
-- the two RPCs; there are NO insert/update/delete policies anywhere — all
-- writes go through SECURITY DEFINER RPCs or the service role.
-- ---------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.seasons          enable row level security;
alter table public.rule_configs     enable row level security;
alter table public.season_members   enable row level security;
alter table public.weeks            enable row level security;
alter table public.films            enable row level security;
alter table public.bids             enable row level security;
alter table public.settlements      enable row level security;
alter table public.settlement_lines enable row level security;
alter table public.audit_log        enable row level security;

-- profiles: yourself, plus people who share a season with you.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.season_members mine
      join public.season_members theirs on theirs.season_id = mine.season_id
      where mine.profile_id = auth.uid()
        and theirs.profile_id = profiles.id
    )
  );

-- seasons / rule_configs / season_members / weeks / films: visible to season members.
create policy seasons_select on public.seasons
  for select to authenticated
  using (public.is_season_member(id));

create policy rule_configs_select on public.rule_configs
  for select to authenticated
  using (public.is_season_member(season_id));

create policy season_members_select on public.season_members
  for select to authenticated
  using (public.is_season_member(season_id));

create policy weeks_select on public.weeks
  for select to authenticated
  using (public.is_season_member(season_id));

create policy films_select on public.films
  for select to authenticated
  using (
    exists (
      select 1 from public.weeks w
      where w.id = films.week_id
        and public.is_season_member(w.season_id)
    )
  );

-- bids: THE blind-bid policy (build plan §4).
--   (a) your own bids, always;
--   (b) all bids on films of a week that is locked/resolved/scored,
--       if you are a member of that season;
--   (c) all bids in your season if you are the commissioner
--       (ADR-006: even while open — accepted trust trade-off).
create policy bids_select on public.bids
  for select to authenticated
  using (
    public.is_own_member(season_member_id)
    or exists (
      select 1
      from public.films f
      join public.weeks w on w.id = f.week_id
      where f.id = bids.film_id
        and w.status in ('locked', 'resolved', 'scored')
        and public.is_season_member(w.season_id)
    )
    or exists (
      select 1
      from public.films f
      join public.weeks w on w.id = f.week_id
      where f.id = bids.film_id
        and public.is_commissioner(w.season_id)
    )
  );

-- Deliberately NO policies on settlements / settlement_lines / audit_log yet
-- (phases 7/9), and NO write policies anywhere: with RLS enabled and no
-- policy, direct writes are denied — defense-in-depth behind the RPCs.

-- ---------------------------------------------------------------------------
-- 4. place_bid RPC (build plan §4) — atomic rule validation
-- ---------------------------------------------------------------------------

create or replace function public.place_bid(p_film_id uuid, p_amount integer)
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

  select * into v_week from weeks where id = v_film.week_id;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;

  -- ADR-006: any member of the season may bid, commissioner included.
  -- Lock the member row so one player's concurrent bids serialize, keeping
  -- the sum-exposure check race-free.
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

  -- Whole dollars ≥ min_bid (integer type already forbids fractions).
  if p_amount is null or p_amount < v_config.min_bid then
    raise exception 'bid must be at least $%', v_config.min_bid;
  end if;

  v_remaining := member_remaining_budget(v_member.id);

  -- ADR-001 sum-exposure: Σ(my bids on this week's ACTIVE films, excluding any
  -- existing bid on THIS film) + new amount must fit in my remaining budget.
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

  -- Upsert the one-bid-per-film row (re-bidding while open replaces the bid).
  insert into bids (film_id, season_member_id, amount)
  values (p_film_id, v_member.id, p_amount)
  on conflict (film_id, season_member_id)
  do update set amount = excluded.amount, updated_at = now()
  returning id into v_bid_id;

  return v_bid_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. close_week RPC (ADR-003) — commissioner manually closes bidding;
--    flipping open → locked is what makes bids visible via bids_select (b).
-- ---------------------------------------------------------------------------

create or replace function public.close_week(p_week_id uuid)
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
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can close bidding';
  end if;
  if v_week.status <> 'open' then
    raise exception 'week is not open for bidding';
  end if;

  update weeks set status = 'locked' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'close_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants — ADR-004 deliberate exposure. Only what phase 1 needs.
-- ---------------------------------------------------------------------------

-- Nothing for anon: the whole app is behind login.
grant select on public.profiles, public.seasons, public.rule_configs,
                public.season_members, public.weeks, public.films, public.bids
  to authenticated;

-- service_role (server-side admin key only — seeding, spike tests, back office).
-- It bypasses RLS by role attribute, but under deny-by-default it still needs
-- explicit table privileges.
grant select, insert, update, delete on
  public.profiles, public.seasons, public.rule_configs, public.season_members,
  public.weeks, public.films, public.bids, public.settlements,
  public.settlement_lines, public.audit_log
  to service_role;

-- Functions default to EXECUTE for PUBLIC — revoke, then grant deliberately.
revoke all on function public.current_member_id(uuid)        from public, anon;
revoke all on function public.is_season_member(uuid)         from public, anon;
revoke all on function public.is_commissioner(uuid)          from public, anon;
revoke all on function public.week_bidding_open(uuid)        from public, anon;
revoke all on function public.is_own_member(uuid)            from public, anon;
revoke all on function public.member_remaining_budget(uuid)  from public, anon;
revoke all on function public.place_bid(uuid, integer)       from public, anon;
revoke all on function public.close_week(uuid)               from public, anon;

grant execute on function public.current_member_id(uuid),
                          public.is_season_member(uuid),
                          public.is_commissioner(uuid),
                          public.week_bidding_open(uuid),
                          public.is_own_member(uuid),
                          public.member_remaining_budget(uuid),
                          public.place_bid(uuid, integer),
                          public.close_week(uuid)
  to authenticated;
