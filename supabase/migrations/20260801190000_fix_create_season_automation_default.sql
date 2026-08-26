-- Corrects 20260801180000, which patched the WRONG create_season.
--
-- Phase 11 shipped `create_season(uuid, text)`. ADR-020/025 then replaced it
-- with `create_season(uuid)` — no name parameter, auto-numbered from the
-- league's season_start_number — and DROPPED the two-arg version. The app has
-- called the one-arg version ever since (commish/actions.ts passes only
-- p_league_id).
--
-- The earlier migration was written against the phase-11 body, so it did two
-- wrong things at once: it left the live season-creation path untouched, and
-- `create or replace` RESURRECTED the dropped two-arg overload, putting a
-- second, stale create_season back into the schema. Caught by checking
-- pg_proc after the push rather than by trusting the migration.
--
-- This migration undoes both: drop the resurrected overload, and put the
-- automation default where it actually belongs.

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

  -- ADR-052: the one line this migration exists for. New seasons start with
  -- the enforced deadline the rulebook now describes; the column default stays
  -- false, which is what keeps every in-flight season on the advisory
  -- carve-out. The schedule columns keep their own defaults, so a commissioner
  -- who changes nothing still gets a working week rhythm.
  insert into rule_configs (season_id, bidding_automation)
  values (v_season_id, true);

  -- Everyone in the league plays the new season (ADR-016). This snapshot is
  -- also the moment the roster locks — see the season-roster-lock migration.
  insert into season_members (season_id, profile_id, role)
  select v_season_id, lm.profile_id, lm.role
  from league_members lm
  where lm.league_id = p_league_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('name', v_name, 'league_id', p_league_id,
                             'number', v_number,
                             'bidding_automation', true));

  return v_season_id;
end;
$$;

revoke all on function public.create_season(uuid) from public, anon;
grant execute on function public.create_season(uuid) to authenticated;

comment on function public.create_season(uuid) is
  'ADR-020/025: start the league''s next season. Named "Season N" counting from '
  'the league''s season_start_number; refuses while a season is under way. '
  'Since ADR-052 the new season''s rule_configs row has bidding_automation = '
  'true — enforced deadlines and scheduled opening are the default for '
  'anything created after that decision.';
