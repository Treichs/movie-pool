-- A season is ACTIVE the moment it is created. Weeks open and close; seasons
-- do not wait to be switched on (2026-08-04, developer's call).
--
-- WHAT WAS WRONG. create_season inserted at the `draft` default and something
-- else had to move it to `active` later — the setup page's "Start the season"
-- button. Nothing in the game needs that step. A season is a container for
-- weeks; it is the WEEKS that open, take bids and close, on the clock
-- ADR-056/the two-week overlap defined. The draft state added a switch with no
-- meaning behind it and one very real consequence: open_due_weeks requires
-- `s.status = 'active'`, so a league whose commissioner never found the button
-- had a fully seeded season whose weeks could never open, ever.
--
-- It also made the app contradict itself out loud. League Home's activity feed
-- said "Dev Commish started Season 1" — the sentence written for create_season
-- — while the panel beside it said "Season 1 is set up but hasn't started".
-- Both were reporting the model accurately. The model was wrong.
--
-- WHAT REPLACES THE ACTIVATION TRIGGER. update_season_status(active) called
-- open_due_weeks, on the reasoning that "week 1 has no predecessor to cascade
-- from — the season starting IS its trigger". With no activation step there is
-- no such moment, so the trigger moves to where it actually belongs: a week
-- opens when its clock has passed AND it has a slate, and the last of those two
-- to come true is what should fire. The clock is covered by the hourly pg_cron
-- job; the slate is covered by open_due_weeks_for_season below, which the
-- picker and the week drawer call after adding films so the week opens at once
-- rather than up to an hour later.
--
-- `draft` SURVIVES as an enum value and as a legal transition. Existing rows
-- are migrated at the bottom, and update_season_status still accepts
-- draft -> active so a season predating this can always be rescued.

-- ---------------------------------------------------------------------------
-- 1. create_season — active on birth.
--    Body from pg_get_functiondef; only the insert's status is new.
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

  -- ADR-020, unchanged: one season under way per league. `draft` stays in this
  -- test so a legacy draft still blocks a second season.
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

  -- ACTIVE, not the `draft` default. Creating a season IS starting it.
  insert into seasons (name, league_id, created_by, status)
  values (v_name, p_league_id, auth.uid(), 'active')
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
-- 2. A commissioner-gated door onto open_due_weeks.
--
--    open_due_weeks itself is internal — it defaults to EVERY season and is
--    called by the hourly automation and by close_week's cascade. Granting that
--    to `authenticated` would let any signed-in user drive week opening
--    app-wide; it could only ever open weeks that are genuinely due, but the
--    door is wider than the need. This one names a season and checks the
--    caller commissions it.
--
--    Callers use it after ADDING FILMS: the clock may already have passed, in
--    which case the slate was the only thing missing and the week should open
--    now rather than at the top of the next hour.
-- ---------------------------------------------------------------------------
create or replace function public.open_due_weeks_for_season(p_season_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can open this season''s weeks';
  end if;
  return open_due_weeks(p_season_id);
end;
$$;

revoke all on function public.open_due_weeks_for_season(uuid) from public, anon;
grant execute on function public.open_due_weeks_for_season(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Existing drafts become active.
--
--    A draft season under the old model is one whose commissioner had not
--    pressed a button that no longer exists. Left alone they would be
--    permanently unopenable — the status they carry is now unreachable by any
--    code path, so nothing would ever move them.
--
--    Safe because an active season with no films simply has no open weeks:
--    open_due_weeks requires an eligible film on the week before it will touch
--    it. The second statement then opens whatever is genuinely due.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id, name from seasons where status = 'draft' loop
    update seasons set status = 'active' where id = r.id;
    insert into audit_log (season_id, actor, action, detail)
    values (r.id, null, 'update_season_status',
            jsonb_build_object('from', 'draft', 'to', 'active',
                               'reason', 'seasons_start_active migration'));
    perform open_due_weeks(r.id);
  end loop;
end $$;
