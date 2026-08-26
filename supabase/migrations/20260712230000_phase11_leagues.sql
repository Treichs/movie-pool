-- ============================================================================
-- Phase 11 — Leagues: users and seasons live inside a league
--
-- Sources of truth:
--   ADR-016 (user-confirmed 2026-07-12): a League is a persistent collection
--   of users who play seasons together. A user may belong to many leagues.
--   Only a league COMMISSIONER can start a season, and every current league
--   member is enrolled in each new season automatically. Leagues may have
--   several commissioners but never zero; roles are swappable.
--   Supersedes ADR-008 in part: create_league is now the open-to-anyone
--   action; create_season requires league commissionership.
--
-- The trick that keeps this migration small: every phase-1..9 RPC and RLS
-- policy authorizes through is_commissioner(season_id) / is_season_member
-- (season_id). Redefining those two helpers to consult league_members gives
-- the whole app league semantics without touching the existing policies:
--   * is_commissioner  → league commissioner of the season's league (live,
--     so a role swap applies to every season at once)
--   * is_season_member → league member of the season's league (league-wide
--     visibility: Season Archives works for members who joined later)
-- Actually PLAYING a season still requires a season_members row (place_bid
-- looks it up directly), and budgets/standings stay anchored to it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables. league_members reuses the member_role enum.
-- ---------------------------------------------------------------------------
create table public.leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.league_members (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'player',
  created_at timestamptz not null default now(),
  unique (league_id, profile_id)
);

create index league_members_league_idx  on public.league_members (league_id);
create index league_members_profile_idx on public.league_members (profile_id);

-- Deleting a league removes its seasons (and everything cascading below
-- them) — consistent with the rest of the schema; there is no delete-league
-- RPC in v1, so only the service role can do it.
alter table public.seasons
  add column league_id uuid references public.leagues (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Backfill: every pre-league season gets its own league carrying the
--    season's roster and roles, so nothing existing loses access.
-- ---------------------------------------------------------------------------
do $$
declare
  r        record;
  v_league uuid;
begin
  for r in select * from seasons where league_id is null loop
    insert into leagues (name, created_by)
    values (r.name || ' League', r.created_by)
    returning id into v_league;

    insert into league_members (league_id, profile_id, role)
    select v_league, sm.profile_id, sm.role
    from season_members sm
    where sm.season_id = r.id;

    update seasons set league_id = v_league where id = r.id;
  end loop;
end $$;

alter table public.seasons alter column league_id set not null;
create index seasons_league_idx on public.seasons (league_id);

-- ---------------------------------------------------------------------------
-- 3. Helpers: two new league checks, two redefinitions (ADR-016).
-- ---------------------------------------------------------------------------
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from league_members lm
    where lm.league_id = p_league_id
      and lm.profile_id = auth.uid()
  )
$$;

create or replace function public.is_league_commissioner(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from league_members lm
    where lm.league_id = p_league_id
      and lm.profile_id = auth.uid()
      and lm.role = 'commissioner'
  )
$$;

-- A season's "member" is now anyone in its league (league-wide visibility).
create or replace function public.is_season_member(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from seasons s
    join league_members lm on lm.league_id = s.league_id
    where s.id = p_season_id
      and lm.profile_id = auth.uid()
  )
$$;

-- A season's commissioner is a live league commissioner — swapping the role
-- at the league level immediately applies to every season of the league.
create or replace function public.is_commissioner(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from seasons s
    join league_members lm on lm.league_id = s.league_id
    where s.id = p_season_id
      and lm.profile_id = auth.uid()
      and lm.role = 'commissioner'
  )
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS. profiles_select widens from season-mates to league-mates (the
--    league roster page needs names before any season exists).
-- ---------------------------------------------------------------------------
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;

create policy leagues_select on public.leagues
  for select to authenticated
  using (public.is_league_member(id));

create policy league_members_select on public.league_members
  for select to authenticated
  using (public.is_league_member(league_id));

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
  );

-- ---------------------------------------------------------------------------
-- 5. League management RPCs.
-- ---------------------------------------------------------------------------

-- Open to any signed-in user (the ADR-008 successor); the creator is the
-- league's first commissioner.
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

  insert into leagues (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into v_league_id;

  insert into league_members (league_id, profile_id, role)
  values (v_league_id, auth.uid(), 'commissioner');

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name)));

  return v_league_id;
end;
$$;

create or replace function public.add_league_member(
  p_league_id uuid,
  p_email     text,
  p_role      public.member_role default 'player'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_member_id  uuid;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can add members';
  end if;

  select id into v_profile_id
  from profiles
  where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'no account found for % — they need to sign up first', trim(p_email);
  end if;

  if exists (select 1 from league_members
             where league_id = p_league_id and profile_id = v_profile_id) then
    raise exception 'that account is already in this league';
  end if;

  insert into league_members (league_id, profile_id, role)
  values (p_league_id, v_profile_id, p_role)
  returning id into v_member_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'add_league_member',
          jsonb_build_object('league_id', p_league_id,
                             'profile_id', v_profile_id, 'role', p_role));

  return v_member_id;
end;
$$;

-- Joining a league does NOT retro-enroll into in-flight seasons (ADR-016);
-- leaving one is only possible before playing — season history is immutable.
create or replace function public.remove_league_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member league_members%rowtype;
begin
  select * into v_member from league_members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;
  if not is_league_commissioner(v_member.league_id) then
    raise exception 'only a league commissioner can remove members';
  end if;

  if exists (
    select 1
    from season_members sm
    join seasons s on s.id = sm.season_id
    where sm.profile_id = v_member.profile_id
      and s.league_id = v_member.league_id
  ) then
    raise exception 'cannot remove a member who is part of a season in this league';
  end if;

  if v_member.role = 'commissioner' and not exists (
    select 1 from league_members
    where league_id = v_member.league_id
      and role = 'commissioner'
      and id <> p_member_id
  ) then
    raise exception 'a league must always have at least one commissioner';
  end if;

  delete from league_members where id = p_member_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'remove_league_member',
          jsonb_build_object('league_id', v_member.league_id,
                             'profile_id', v_member.profile_id,
                             'role', v_member.role));
end;
$$;

-- Role swaps apply to authorization instantly (is_commissioner reads the
-- league live) and are mirrored onto season_members.role so the display
-- never drifts from the truth.
create or replace function public.set_league_member_role(
  p_member_id uuid,
  p_role      public.member_role
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member league_members%rowtype;
begin
  select * into v_member from league_members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;
  if not is_league_commissioner(v_member.league_id) then
    raise exception 'only a league commissioner can change roles';
  end if;
  if v_member.role = p_role then
    return;
  end if;
  if v_member.role = 'commissioner' and not exists (
    select 1 from league_members
    where league_id = v_member.league_id
      and role = 'commissioner'
      and id <> p_member_id
  ) then
    raise exception 'a league must always have at least one commissioner';
  end if;

  update league_members set role = p_role where id = p_member_id;

  update season_members sm
  set role = p_role
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_member.league_id
    and sm.profile_id = v_member.profile_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'set_league_member_role',
          jsonb_build_object('league_id', v_member.league_id,
                             'profile_id', v_member.profile_id,
                             'from', v_member.role, 'to', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. create_season moves inside the league (ADR-016): league-commissioner
--    only, and every current league member is enrolled with their league
--    role. The old open-to-anyone create_season(text) is dropped.
-- ---------------------------------------------------------------------------
drop function public.create_season(text);

create or replace function public.create_season(p_league_id uuid, p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id uuid;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can start a season';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'season needs a name';
  end if;

  insert into seasons (name, league_id, created_by)
  values (trim(p_name), p_league_id, auth.uid())
  returning id into v_season_id;

  insert into rule_configs (season_id) values (v_season_id);

  -- Everyone in the league plays the new season (ADR-016).
  insert into season_members (season_id, profile_id, role)
  select v_season_id, lm.profile_id, lm.role
  from league_members lm
  where lm.league_id = p_league_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('name', trim(p_name), 'league_id', p_league_id));

  return v_season_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. add_season_member now only re-adds league members (someone who sat a
--    season out, or joined the league mid-season). The season role always
--    mirrors the league role — p_role is gone.
-- ---------------------------------------------------------------------------
drop function public.add_season_member(uuid, text, public.member_role);

create or replace function public.add_season_member(
  p_season_id uuid,
  p_email     text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season     seasons%rowtype;
  v_profile_id uuid;
  v_role       public.member_role;
  v_member_id  uuid;
begin
  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can add players';
  end if;

  select lm.profile_id, lm.role into v_profile_id, v_role
  from league_members lm
  join profiles pr on pr.id = lm.profile_id
  where lm.league_id = v_season.league_id
    and lower(pr.email) = lower(trim(p_email));
  if not found then
    raise exception 'no league member found for % — add them to the league first', trim(p_email);
  end if;

  if exists (select 1 from season_members
             where season_id = p_season_id and profile_id = v_profile_id) then
    raise exception 'that account is already in this season';
  end if;

  insert into season_members (season_id, profile_id, role)
  values (p_season_id, v_profile_id, v_role)
  returning id into v_member_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'add_season_member',
          jsonb_build_object('profile_id', v_profile_id, 'role', v_role));

  return v_member_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants — ADR-004 deliberate exposure.
-- ---------------------------------------------------------------------------
grant select on public.leagues, public.league_members to authenticated;
grant select, insert, update, delete on public.leagues, public.league_members
  to service_role;

revoke all on function public.is_league_member(uuid)                          from public, anon;
revoke all on function public.is_league_commissioner(uuid)                    from public, anon;
revoke all on function public.create_league(text)                             from public, anon;
revoke all on function public.add_league_member(uuid, text, public.member_role) from public, anon;
revoke all on function public.remove_league_member(uuid)                      from public, anon;
revoke all on function public.set_league_member_role(uuid, public.member_role) from public, anon;
revoke all on function public.create_season(uuid, text)                       from public, anon;
revoke all on function public.add_season_member(uuid, text)                   from public, anon;

grant execute on function
  public.is_league_member(uuid),
  public.is_league_commissioner(uuid),
  public.create_league(text),
  public.add_league_member(uuid, text, public.member_role),
  public.remove_league_member(uuid),
  public.set_league_member_role(uuid, public.member_role),
  public.create_season(uuid, text),
  public.add_season_member(uuid, text)
  to authenticated;
