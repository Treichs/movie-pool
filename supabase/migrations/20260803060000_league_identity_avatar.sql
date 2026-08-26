-- ============================================================================
-- A league gets an identity: a name AND an avatar.
--
-- The create-league wizard asks for both in one step, and the sidebar league
-- list is the reason: it renders leagues as small square cards, and a card
-- whose whole content is the first letter of the name is unreadable the moment
-- someone belongs to two leagues starting with the same letter. Players have
-- had a chosen avatar since ADR-050; leagues get the same treatment and the
-- SAME palette, so a league card and a player chip cannot drift apart.
--
-- Deliberately reusing profiles' storage shape (a pair index + a glyph key)
-- rather than inventing a second one. lib/avatar-palette.ts is the single
-- definition of both, the settings spike already asserts it agrees with the
-- profiles check constraints, and pointing a second table at the same values
-- means that spike now guards two tables for free.
-- ============================================================================

alter table public.leagues
  add column if not exists avatar_pair  smallint,
  add column if not exists avatar_glyph text;

alter table public.leagues
  drop constraint if exists leagues_avatar_pair_range;
alter table public.leagues
  add constraint leagues_avatar_pair_range
  check (avatar_pair is null or (avatar_pair >= 0 and avatar_pair < 10));

-- Same glyph keys as profiles_avatar_glyph_known. Renaming one is a data
-- migration in TWO places now, which is the cost of sharing the palette and is
-- cheaper than two palettes drifting.
alter table public.leagues
  drop constraint if exists leagues_avatar_glyph_known;
alter table public.leagues
  add constraint leagues_avatar_glyph_known
  check (avatar_glyph is null or avatar_glyph in (
    'clapperboard', 'film', 'popcorn', 'ticket', 'star', 'crown',
    'rocket', 'ghost', 'sparkles', 'video', 'cat', 'glasses'));

comment on column public.leagues.avatar_pair is
  'Index into lib/avatar-palette AVATAR_PAIRS. NULL means derive from the name.';

-- ---------------------------------------------------------------------------
-- create_league takes the avatar too.
--
-- DROPPED and recreated rather than given defaulted parameters on top of the
-- existing one. `create or replace` with a different argument list produces an
-- OVERLOAD, not a replacement, and PostgREST calling create_league with only
-- p_name would then match both candidates and fail as ambiguous. Dropping
-- first means there is exactly one function; the defaults keep every existing
-- caller — the spikes, mock-season — working unchanged.
-- ---------------------------------------------------------------------------
drop function if exists public.create_league(text);

create or replace function public.create_league(
  p_name         text,
  p_avatar_pair  smallint default null,
  p_avatar_glyph text     default null
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

  insert into leagues (name, created_by, season_start_number, avatar_pair, avatar_glyph)
  values (trim(p_name), auth.uid(), 1, p_avatar_pair,
          nullif(trim(coalesce(p_avatar_glyph, '')), ''))
  returning id into v_league_id;

  insert into league_members (league_id, profile_id, role)
  values (v_league_id, auth.uid(), 'commissioner');

  insert into league_settings (league_id) values (v_league_id);

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name)));

  return v_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_league_identity — rename, or change the avatar, after the fact.
--
-- Separate from update_league_settings on purpose: settings are the RULES of
-- the game and every one of them changes how a season plays, while name and
-- avatar change nothing. Folding identity into that RPC would mean a rename
-- passing through the same audited, season-affecting path as a bankroll
-- change, which would make the audit trail harder to read, not easier.
-- ---------------------------------------------------------------------------
create or replace function public.update_league_identity(
  p_league_id    uuid,
  p_name         text,
  p_avatar_pair  smallint default null,
  p_avatar_glyph text     default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can rename the league';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'league needs a name';
  end if;

  update leagues
  set name         = trim(p_name),
      avatar_pair  = p_avatar_pair,
      avatar_glyph = nullif(trim(coalesce(p_avatar_glyph, '')), '')
  where id = p_league_id;
end;
$$;

revoke all on function public.create_league(text, smallint, text)          from public, anon;
revoke all on function public.update_league_identity(uuid, text, smallint, text) from public, anon;
grant execute on function public.create_league(text, smallint, text)          to authenticated;
grant execute on function public.update_league_identity(uuid, text, smallint, text) to authenticated;
