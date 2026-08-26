-- get_player_profile returns avatar_peep (2026-08-07).
--
-- ONE COLUMN ADDED, and this file starts from the CURRENT definition verbatim
-- rather than from whichever copy was easiest to find. That is the narrow
-- lesson from 2026-08-04, when a migration re-declared seed_season_weeks from
-- an older copy and silently dropped its 52-week bound, its null check and its
-- real error messages — a request for 53 weeks wrote 53 weeks, and only the
-- spike caught it.
--
-- WHY THE RPC AND NOT A DIRECT SELECT. A peep belongs to the profile it draws,
-- and RLS on profiles does not express "shares a league with me" — which is
-- precisely why this function is SECURITY DEFINER. A page-level select would
-- return nothing for anybody but yourself.
--
-- get_avatar_overrides is deliberately NOT extended: it feeds the 20px chips
-- through the member layout on every page, and a peep never renders at that
-- size.

-- DROP FIRST. Postgres refuses `create or replace` when a RETURNS TABLE shape
-- changes ("cannot change return type of existing function", 42P13) — adding a
-- column IS changing the row type. Dropping is safe here because the grants are
-- re-issued at the foot of this file, which is the only thing that would be
-- lost with the function.
drop function if exists public.get_player_profile(uuid);

create function public.get_player_profile(p_profile_id uuid)
returns table (
  profile_id     uuid,
  display_name   text,
  bio            text,
  avatar_pair    smallint,
  avatar_glyph   text,
  avatar_peep    smallint,
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
