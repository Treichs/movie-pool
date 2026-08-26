-- Retire the 24-template peep path (peep-legacy-cleanup, 2026-08-09).
--
-- profiles.avatar_peep held an index 0..23 into public/peeps/peep-N.svg — the
-- first shape the player illustration took, on 2026-08-07. It lasted a day: the
-- dress-up builder landed 2026-08-08 and peep_parts replaced it with a
-- composition from the atom manifests, which is strictly more expressive (the
-- 24 templates are 24 points in the space peep_parts spans) and, unlike the
-- index, reaches every 24px avatar circle in the app rather than only the
-- profile page.
--
-- update_peep(smallint), the RPC that wrote this column, was already dropped in
-- 20260809030000 as a granted endpoint with no caller. So since that migration
-- the column has been unwritable — this removes the read side and the storage.
--
-- PRECONDITION CHECKED AGAINST THE LIVE DATABASE before writing this, not
-- assumed: 30 profiles, 1 carrying avatar_peep, and that one also carries
-- peep_parts. Zero profiles would lose their illustration. The guard below
-- re-checks at apply time anyway, because the gap between writing a migration
-- and running it is exactly where that stops being true.

do $$
declare
  v_orphans integer;
begin
  select count(*) into v_orphans
  from public.profiles
  where avatar_peep is not null and peep_parts is null;

  if v_orphans > 0 then
    raise exception
      '% profile(s) still depend on the peep templates with no peep_parts to '
      'fall back to. Backfill them (map the template to its head/face/facial '
      'hair atoms) before applying this migration.', v_orphans;
  end if;
end
$$;

alter table public.profiles
  drop constraint if exists profiles_avatar_peep_range;

alter table public.profiles
  drop column if exists avatar_peep;

-- ---------------------------------------------------------------------------
-- get_player_profile loses the column with it.
--
-- Re-declared from the CURRENT definition (20260808150000) with one output
-- column removed — the 2026-08-04 seed_season_weeks regression is why that
-- sentence is in every function-touching migration here. get_avatar_overrides
-- is deliberately untouched: it never carried avatar_peep, because the
-- 24-template index only ever rendered on the profile page.
-- ---------------------------------------------------------------------------
drop function if exists public.get_player_profile(uuid);

create function public.get_player_profile(p_profile_id uuid)
returns table (
  profile_id     uuid,
  display_name   text,
  bio            text,
  avatar_pair    smallint,
  avatar_glyph   text,
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
