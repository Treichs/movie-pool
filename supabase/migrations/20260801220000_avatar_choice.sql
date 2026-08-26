-- ADR-050, second half: a player can CHOOSE their avatar.
--
-- The first half shipped as pure derivation — a hash of the display name picks
-- one of ten curated colour pairs and one of twelve glyphs, so nobody ever
-- renders blank. This adds the stored choice that overrides it. A null column
-- means "still derived", which is why every existing row needs no backfill and
-- why deleting a choice is a real, supported action rather than a broken state.
--
-- What is stored is an INDEX and a KEY, never a colour. Two reasons:
--   * A user-supplied hex is a raw palette value. Keeping hexes out of the
--     database keeps the palette in exactly one place (composed/player-avatar),
--     where it is contrast-checked, and keeps governance G1 honest.
--   * The pairs are validated together. Independent fill and border selection
--     would mean 100 combinations, several of which fail contrast in dark mode
--     — a narrowing of the developer's "pick both colours" note, taken
--     deliberately so no one can choose an unreadable avatar.
--
-- The 10/12 bounds are asserted against the TypeScript palette in the settings
-- spike, so the two cannot drift apart silently.

alter table public.profiles
  add column if not exists avatar_pair  smallint,
  add column if not exists avatar_glyph text;

alter table public.profiles
  drop constraint if exists profiles_avatar_pair_range;
alter table public.profiles
  add constraint profiles_avatar_pair_range
  check (avatar_pair is null or (avatar_pair >= 0 and avatar_pair < 10));

-- Glyph keys are the stable identifiers from composed/player-avatar's GLYPHS
-- map. Renaming one there is a data migration, not a refactor — the map's own
-- comment says so, and this constraint is what makes that true.
alter table public.profiles
  drop constraint if exists profiles_avatar_glyph_known;
alter table public.profiles
  add constraint profiles_avatar_glyph_known
  check (avatar_glyph is null or avatar_glyph in (
    'clapperboard','film','popcorn','ticket','star','crown',
    'rocket','ghost','sparkles','video','cat','glasses'
  ));

comment on column public.profiles.avatar_pair is
  'ADR-050: index into the curated avatar colour pairs. NULL means the avatar '
  'is still derived from the display name.';
comment on column public.profiles.avatar_glyph is
  'ADR-050: chosen glyph key. NULL means derived from the display name.';

-- ---------------------------------------------------------------------------
-- The write path. ADR-004: all writes go through SECURITY DEFINER RPCs, and
-- this one re-validates rather than trusting the client's bounds — the check
-- constraints above would reject bad input anyway, but a raised exception with
-- a readable message beats a constraint-violation string in the UI.
-- ---------------------------------------------------------------------------
create or replace function public.update_avatar(
  p_pair  smallint,
  p_glyph text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  -- Both null is the supported "go back to automatic" action.
  if (p_pair is null) <> (p_glyph is null) then
    raise exception 'choose both a colour and a glyph, or neither';
  end if;
  if p_pair is not null and (p_pair < 0 or p_pair >= 10) then
    raise exception 'that colour is not one of the offered ones';
  end if;
  if p_glyph is not null and p_glyph not in (
    'clapperboard','film','popcorn','ticket','star','crown',
    'rocket','ghost','sparkles','video','cat','glasses'
  ) then
    raise exception 'that glyph is not one of the offered ones';
  end if;

  update profiles
  set avatar_pair = p_pair, avatar_glyph = p_glyph
  where id = auth.uid();
end;
$$;

revoke all on function public.update_avatar(smallint, text) from public, anon;
grant execute on function public.update_avatar(smallint, text) to authenticated;

comment on function public.update_avatar(smallint, text) is
  'ADR-050: set or clear the caller''s own avatar choice. Passing both nulls '
  'restores the name-derived avatar.';

-- ---------------------------------------------------------------------------
-- The read path, and the reason this migration is small.
--
-- display_name reaches PlayerChip through fifteen different queries and a
-- view; threading three more columns down all of them would be a large,
-- drift-prone change and is exactly why this half was deferred once already.
-- Instead the overrides are read ONCE per request as a map, and PlayerChip
-- consults it. This function returns every profile the caller can actually see
-- — the people in their leagues — which is the same set RLS already exposes
-- through the roster reads, so it widens nothing.
-- ---------------------------------------------------------------------------
create or replace function public.get_avatar_overrides()
returns table (display_name text, avatar_pair smallint, avatar_glyph text)
language sql security definer set search_path = public
stable
as $$
  select distinct p.display_name, p.avatar_pair, p.avatar_glyph
  from profiles p
  where (p.avatar_pair is not null or p.avatar_glyph is not null)
    and (
      p.id = auth.uid()
      or exists (
        select 1
        from league_members mine
        join league_members theirs on theirs.league_id = mine.league_id
        where mine.profile_id = auth.uid()
          and theirs.profile_id = p.id
      )
    );
$$;

revoke all on function public.get_avatar_overrides() from public, anon;
grant execute on function public.get_avatar_overrides() to authenticated;

comment on function public.get_avatar_overrides() is
  'ADR-050: display_name -> chosen avatar, for every profile the caller shares '
  'a league with (plus their own). Only rows with a CHOICE are returned; a '
  'name absent from the result is still derived. Keyed by display_name because '
  'that is the only identifier every PlayerChip call site already carries.';
