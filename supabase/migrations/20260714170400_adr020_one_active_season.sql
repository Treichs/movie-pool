-- ============================================================================
-- ADR-020 (as amended by ADR-025) — One season under way per league;
-- derived season names anchored to a per-league start number.
--
--   * A league has AT MOST ONE season under way at a time.
--   * Season names are DERIVED, never typed: "Season N".
--   * N counts from the league's own season_start_number, because the Movie
--     Pool has ~33 years of history OUTSIDE this app. Season 34 is the first
--     season the app will ever run, so numbering from 1 would have the app
--     calling it "1st Season" while every player calls it "Season 34".
--     A league created with start_number 34 produces "Season 34", "Season 35";
--     a brand-new league defaults to 1 and produces "Season 1", "Season 2".
--
-- ADR-020's intent is preserved exactly — the commissioner still cannot typo a
-- season name, because they still never type one.
--
-- "Under way" covers draft AND active: a draft is a season being set up, and a
-- second one alongside it would make "the league's current season" ambiguous
-- for the whole app (sidebar, dashboard, League page).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The one-season-under-way invariant, as a constraint rather than only a
--    check inside the RPC.
--
-- create_season checks this too, but two concurrent calls could both pass the
-- check and then both insert. The partial unique index is what actually makes
-- it true. Verified against the hosted dev DB: every league currently has
-- exactly one draft/active season, so this applies cleanly.
-- ---------------------------------------------------------------------------
create unique index if not exists seasons_one_live_per_league_idx
  on public.seasons (league_id)
  where status in ('draft', 'active');

-- ---------------------------------------------------------------------------
-- 2. Where a league's numbering begins (ADR-025).
--
-- Set once, at league creation. It is deliberately not editable afterwards:
-- names are stamped onto seasons when they are created, so changing this later
-- would renumber future seasons while leaving existing ones alone — a worse
-- kind of confusion than the one it solves.
-- ---------------------------------------------------------------------------
alter table public.leagues
  add column if not exists season_start_number integer not null default 1
    check (season_start_number >= 1);

comment on column public.leagues.season_start_number is
  'ADR-025: the number of this league''s FIRST season in the app. Defaults to '
  '1; the real Movie Pool league starts at 34 because seasons 1-33 predate the '
  'app. Seasons are named "Season N" counting up from here.';

-- ---------------------------------------------------------------------------
-- 3. create_league — now accepts the start number.
--
-- The single-argument form is dropped rather than kept alongside: an overload
-- pair (text) + (text, integer) would resolve a one-argument call to the OLD
-- function, silently ignoring the default. Dropping it means existing
-- single-argument callers bind to this one and get start_number = 1.
-- ---------------------------------------------------------------------------
drop function if exists public.create_league(text);

create or replace function public.create_league(
  p_name                text,
  p_season_start_number integer default 1
)
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
  if p_season_start_number is null or p_season_start_number < 1 then
    raise exception 'the first season number must be 1 or higher';
  end if;

  insert into leagues (name, created_by, season_start_number)
  values (trim(p_name), auth.uid(), p_season_start_number)
  returning id into v_league_id;

  insert into league_members (league_id, profile_id, role)
  values (v_league_id, auth.uid(), 'commissioner');

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name),
                             'season_start_number', p_season_start_number));

  return v_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. create_season — no name parameter (ADR-020), numbered from the league's
--    start number (ADR-025). Replaces create_season(uuid, text) from phase 11.
-- ---------------------------------------------------------------------------
drop function if exists public.create_season(uuid, text);

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

  -- ADR-020: conditional affordance. The UI hides "Start a season" while one
  -- is under way; this is what makes that true rather than merely displayed.
  if exists (
    select 1 from seasons
    where league_id = p_league_id
      and status in ('draft', 'active')
  ) then
    raise exception
      'this league already has a season under way — finish it before starting the next';
  end if;

  -- Counts the league's WHOLE history, so numbering keeps climbing past
  -- completed and archived seasons rather than reusing a number.
  select v_league.season_start_number + count(*) into v_number
  from seasons
  where league_id = p_league_id;

  v_name := 'Season ' || v_number;

  insert into seasons (name, league_id, created_by)
  values (v_name, p_league_id, auth.uid())
  returning id into v_season_id;

  insert into rule_configs (season_id) values (v_season_id);

  -- Everyone in the league plays the new season (ADR-016). This snapshot is
  -- also the moment the roster locks — see the season-roster-lock migration.
  insert into season_members (season_id, profile_id, role)
  select v_season_id, lm.profile_id, lm.role
  from league_members lm
  where lm.league_id = p_league_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('name', v_name, 'league_id', p_league_id,
                             'number', v_number));

  return v_season_id;
end;
$$;

comment on function public.create_season(uuid) is
  'ADR-020/025: start the league''s next season. Named "Season N" counting from '
  'the league''s season_start_number; refuses while a season is under way.';

-- ---------------------------------------------------------------------------
-- 5. Grants — both signatures changed, so the old grants do not carry over.
-- ---------------------------------------------------------------------------
revoke all on function public.create_league(text, integer) from public, anon;
revoke all on function public.create_season(uuid)          from public, anon;
grant execute on function public.create_league(text, integer) to authenticated;
grant execute on function public.create_season(uuid)          to authenticated;
