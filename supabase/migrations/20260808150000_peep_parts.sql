-- The dress-up builder's storage (2026-08-08, peep-dressup-builder task).
--
-- A player composes their own peep — head, face, facial hair, accessory,
-- body — and the choice is ONE nullable jsonb of atom slugs on profiles.
-- Null means what it means everywhere in the avatar system: derive from the
-- name. One column rather than five because the parts are chosen and cleared
-- together, and a five-column NULL dance would invent partial states the
-- builder never produces.
--
-- WHAT SQL VALIDATES, AND WHAT IT DOESN'T. The RPC checks SHAPE — an object,
-- only known keys, slug-safe short strings, head and face present — and does
-- NOT allowlist slugs against the atom catalogue. That catalogue lives in
-- code (src/lib/peep-atoms.ts) beside the SVGs it names; duplicating ~130
-- slugs here would rot on the first added haircut. The render path holds the
-- line instead: /api/peep-head 400s any slug outside the manifests, and every
-- reader falls back to derivation rather than blanking — a bad row can make a
-- player derived, never break a page.

alter table public.profiles
  add column if not exists peep_parts jsonb;

comment on column public.profiles.peep_parts is
  'The dress-up builder''s composition: {"head","face","facial_hair"?,'
  '"accessory"?,"body"?} as atom slugs from src/lib/peep-atoms.ts. Null = '
  'derived from the display name.';

create or replace function public.update_peep_parts(p_parts jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_key text;
  v_val text;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  if p_parts is not null then
    if jsonb_typeof(p_parts) <> 'object' then
      raise exception 'peep parts must be an object';
    end if;
    -- Only known keys, and every value a short slug. The regexp is the same
    -- shape the file names on disk actually have, so nothing that passes here
    -- can be a path, a URL or markup.
    for v_key, v_val in select key, value #>> '{}' from jsonb_each(p_parts) loop
      if v_key not in ('head', 'face', 'facial_hair', 'accessory', 'body') then
        raise exception 'unknown peep part: %', v_key;
      end if;
      if v_val is null or v_val !~ '^[a-z0-9-]{1,40}$' then
        raise exception 'invalid value for peep part %', v_key;
      end if;
    end loop;
    if p_parts->>'head' is null or p_parts->>'face' is null then
      raise exception 'a peep needs at least a head and a face';
    end if;
  end if;

  update profiles set peep_parts = p_parts where id = auth.uid();
end;
$$;

revoke all on function public.update_peep_parts(jsonb) from public, anon;
grant execute on function public.update_peep_parts(jsonb) to authenticated;

comment on function public.update_peep_parts(jsonb) is
  'Set or clear the caller''s own dress-up composition. Null restores the '
  'name-derived peep. Shape-validated here; slugs are allowlisted by the '
  'render path against the code-side atom manifests.';

-- ---------------------------------------------------------------------------
-- get_avatar_overrides carries the composition to every chip.
--
-- The 2026-08-07 decisions NOT to extend this for avatar_peep stand — the
-- 24-template index only ever rendered on the profile page. peep_parts is
-- different in kind: it changes the FACE in every 24px circle in the app, which
-- is exactly the map this function exists to feed.
--
-- Re-declared from the CURRENT definition (20260807050000, identity-by-id)
-- with one column added — the 2026-08-04 seed_season_weeks regression is why
-- that sentence is in every function-touching migration now.
-- ---------------------------------------------------------------------------
drop function if exists public.get_avatar_overrides();

create function public.get_avatar_overrides()
returns table (
  profile_id   uuid,
  display_name text,
  avatar_pair  smallint,
  avatar_glyph text,
  peep_parts   jsonb
)
language sql security definer set search_path = public
stable
as $$
  select p.id, p.display_name, p.avatar_pair, p.avatar_glyph, p.peep_parts
  from profiles p
  where (p.avatar_pair is not null or p.avatar_glyph is not null
         or p.peep_parts is not null)
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
  'ADR-050/ADR-082: profile id -> chosen avatar (colour pair, glyph, and the '
  'dress-up peep_parts), for every profile the caller shares a league with '
  '(plus their own). Only rows carrying some choice are returned; a profile '
  'absent from the result is derived from its name.';

-- ---------------------------------------------------------------------------
-- get_player_profile returns peep_parts, for the profile page's full-figure
-- illustration. Re-declared from the CURRENT definition (20260807040100)
-- with one output column added.
-- ---------------------------------------------------------------------------
drop function if exists public.get_player_profile(uuid);

create function public.get_player_profile(p_profile_id uuid)
returns table (
  profile_id     uuid,
  display_name   text,
  bio            text,
  avatar_pair    smallint,
  avatar_glyph   text,
  avatar_peep    smallint,
  peep_parts     jsonb,
  member_since   timestamptz,
  is_me          boolean,
  seasons_played integer,
  total_points   numeric,
  total_spent    numeric,
  films_owned    integer,
  best_finish    integer,
  seasons_won    integer,
  shared_leagues text[]
)
language plpgsql security definer set search_path = public
as $$
declare
  v_visible boolean;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select p_profile_id = auth.uid() or exists (
    select 1
    from league_members mine
    join league_members theirs on theirs.league_id = mine.league_id
    where mine.profile_id = auth.uid() and theirs.profile_id = p_profile_id
  ) into v_visible;

  if not v_visible then
    raise exception 'no such player';  -- deliberately not "not allowed"
  end if;

  return query
  with visible_leagues as (
    -- Leagues the SUBJECT belongs to that the VIEWER may know about: the ones
    -- they share, or all of them when you are looking at yourself.
    select l.id, l.name
    from league_members subject
    join leagues l on l.id = subject.league_id
    where subject.profile_id = p_profile_id
      and (
        p_profile_id = auth.uid()
        or exists (
          select 1 from league_members viewer
          where viewer.league_id = subject.league_id
            and viewer.profile_id = auth.uid()
        )
      )
  ),
  mine as (
    -- Season rows belonging to the subject, restricted to those same leagues.
    -- Someone's results in a league you are not in are none of your business.
    select s.id as season_id, sm.id as season_member_id
    from season_members sm
    join seasons s on s.id = sm.season_id
    join visible_leagues vl on vl.id = s.league_id
    where sm.profile_id = p_profile_id
  ),
  stats as (
    select
      count(distinct m.season_id)::integer      as seasons_played,
      coalesce(sum(v.points), 0)::numeric       as total_points,
      coalesce(sum(v.spent), 0)::numeric        as total_spent,
      coalesce(sum(v.films_owned), 0)::integer  as films_owned
    from mine m
    left join v_standings v on v.season_member_id = m.season_member_id
  ),
  -- Finishing position per season, dense-ranked the way rankBy does, and only
  -- for seasons that actually finished — a mid-season position is not a finish.
  finishes as (
    select m.season_id,
           (select count(distinct v2.points) + 1
            from v_standings v2
            where v2.season_id = m.season_id and v2.points > v.points)::integer as place
    from mine m
    join v_standings v on v.season_member_id = m.season_member_id
    join seasons s on s.id = m.season_id
    where s.status in ('completed', 'archived')
  )
  select
    p.id,
    p.display_name,
    p.bio,
    p.avatar_pair,
    p.avatar_glyph,
    p.avatar_peep,
    p.peep_parts,
    p.created_at,
    p.id = auth.uid(),
    st.seasons_played,
    st.total_points,
    st.total_spent,
    st.films_owned,
    (select min(place) from finishes),
    (select count(*)::integer from finishes where place = 1),
    (select coalesce(array_agg(name order by name), '{}') from visible_leagues)
  from profiles p
  cross join stats st
  where p.id = p_profile_id;
end;
$$;

revoke all on function public.get_player_profile(uuid) from public, anon;
grant execute on function public.get_player_profile(uuid) to authenticated;

comment on function public.get_player_profile(uuid) is
  'A player''s profile page: identity, bio, chosen avatar, dress-up parts and '
  'career totals derived from v_standings. Visible only to someone who shares '
  'a league with them (or to themselves), and the stats cover only shared '
  'leagues.';
