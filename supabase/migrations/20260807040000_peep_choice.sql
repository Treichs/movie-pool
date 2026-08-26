-- profiles.avatar_peep — which Open Peeps illustration a player is (2026-08-07).
--
-- SEPARATE FROM THE AVATAR CHOICE, and deliberately so. ADR-050's pair+glyph is
-- the 20px identity that appears in every chip, table row and chart line; this
-- is a large illustration that appears in exactly one place, the player page.
-- Coupling them would mean a player who wants a different face has to accept a
-- different colour everywhere, and update_avatar's "both or neither" rule would
-- have to grow a third arm.
--
-- The peep is RECOLOURED from the pair rather than carrying colours of its own
-- (developer's call, 2026-08-07): the flat pack is two-tone black-and-white, so
-- the app substitutes the player's own two colours at render. That is why this
-- is one small integer and not a palette.
--
-- Null means "not chosen", and the app derives one from the display name the
-- same way it derives a glyph — so every player has a peep from the day they
-- join, and choosing is a refinement rather than a prerequisite.

alter table public.profiles
  add column if not exists avatar_peep smallint;

-- 24 illustrations ship in public/peeps. The bound is checked here as well as
-- in the RPC because a service-role write bypasses the function entirely, and
-- an out-of-range index renders a broken image rather than failing loudly.
alter table public.profiles
  drop constraint if exists profiles_avatar_peep_range;
alter table public.profiles
  add constraint profiles_avatar_peep_range
  check (avatar_peep is null or (avatar_peep >= 0 and avatar_peep < 24));

comment on column public.profiles.avatar_peep is
  'Index into the Open Peeps illustrations in public/peeps (0-23). Null means '
  'the app derives one from the display name. Recoloured at render from '
  'avatar_pair — it carries no colour of its own.';

-- ---------------------------------------------------------------------------
-- The write path. Its own function rather than a third argument on
-- update_avatar: that one enforces "a colour and a glyph, or neither", and a
-- peep is independent of both.
-- ---------------------------------------------------------------------------
create or replace function public.update_peep(p_peep smallint)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  -- Null is the supported "go back to the derived one" action, so it is not an
  -- error — only an out-of-range number is.
  if p_peep is not null and (p_peep < 0 or p_peep >= 24) then
    raise exception 'that illustration is not one of the offered ones';
  end if;

  update profiles set avatar_peep = p_peep where id = auth.uid();
end;
$$;

revoke all on function public.update_peep(smallint) from public, anon;
grant execute on function public.update_peep(smallint) to authenticated;

comment on function public.update_peep(smallint) is
  'Set or clear the caller''s own player-page illustration. Null restores the '
  'name-derived one.';

-- ---------------------------------------------------------------------------
-- The read path.
--
-- get_avatar_overrides is NOT extended. It feeds the 20px chips through the
-- member layout, and a peep never renders at that size — adding it would push a
-- field down a hot path that no consumer of that path reads. The player page
-- selects the column directly, which it can: it already reads the profile it is
-- about, and RLS on profiles governs that read.
-- ---------------------------------------------------------------------------
