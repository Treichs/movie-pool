-- RETIRE THE CHOSEN AVATAR — glyphs, colour pairs, and the peep dress-up.
--
-- Avatars are DERIVED now: `src/lib/avatar.ts` hashes a profile or league id
-- into one of the ten `--series-*` tokens, and `initialsFrom` supplies the
-- letters. Nothing is stored, so nothing here has a reader. This migration
-- removes the storage rather than leaving five columns, four constraints and
-- three functions that no code path can reach — dead schema is worse than dead
-- code, because the next person to read it cannot tell it is dead.
--
-- WHAT IS LOST, SAID PLAINLY: two profiles carried a glyph, a pair and a peep
-- composition; six leagues carried a glyph and a pair. Those choices are gone
-- and are not recoverable from this database. They were made while the picker
-- was being built and were never visible in the rebuilt app.
--
-- THE THREE FUNCTIONS THAT SURVIVE lose their avatar arguments and columns but
-- keep every other line, so this is a signature change, not a rewrite. Their
-- bodies below are the deployed definitions with the avatar clauses removed.

-- ── 1. The functions that existed only to write a choice ───────────────────
drop function if exists public.get_avatar_overrides();
drop function if exists public.update_avatar(smallint, text);
drop function if exists public.update_peep_parts(jsonb);

-- ── 2. create_league — the avatar arguments were never passed ──────────────
-- `lib/actions/league.ts` calls it with `p_name` alone, so the two defaulted
-- parameters have only ever inserted nulls.
drop function if exists public.create_league(text, text, smallint, text);

create function public.create_league(
  p_name text,
  p_league_type text default 'cash'
) returns uuid
language plpgsql
security definer
set search_path to 'public'
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
  if coalesce(p_league_type, 'cash') not in ('cash', 'practice') then
    raise exception 'league type must be cash or practice';
  end if;

  insert into leagues (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into v_league_id;

  insert into league_members (league_id, profile_id, role)
  values (v_league_id, auth.uid(), 'commissioner');

  insert into league_settings (league_id, league_type)
  values (v_league_id, coalesce(p_league_type, 'cash'));

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name),
                             'league_type', coalesce(p_league_type, 'cash')));

  return v_league_id;
end;
$$;

comment on function public.create_league(text, text) is
  'Start a league and make the caller its first commissioner. Also writes the '
  'league_settings row every other read assumes exists. A league''s mark is '
  'derived from its id and name, so there is nothing to choose here.';

revoke all on function public.create_league(text, text) from public, anon;
grant execute on function public.create_league(text, text) to authenticated;

-- ── 3. update_league_identity — now what its name says, a rename ───────────
drop function if exists public.update_league_identity(uuid, text, smallint, text);

create function public.update_league_identity(
  p_league_id uuid,
  p_name text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can rename the league';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'league needs a name';
  end if;

  update leagues
  set name = trim(p_name)
  where id = p_league_id;
end;
$$;

comment on function public.update_league_identity(uuid, text) is
  'Rename a league. Any commissioner of it. The mark follows the name for its '
  'letters and the id for its colour, so a rename re-letters the mark and '
  'deliberately does not recolour it.';

revoke all on function public.update_league_identity(uuid, text) from public, anon;
grant execute on function public.update_league_identity(uuid, text) to authenticated;

-- ── 4. get_player_profile — three columns fewer, same rule ─────────────────
-- The visibility rule is untouched: you may read a player if you are them, or
-- if you share a league. Only the returned shape changes, which is why this is
-- a drop-and-create rather than a replace.
drop function if exists public.get_player_profile(uuid);

create function public.get_player_profile(p_profile_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  bio text,
  member_since timestamptz,
  is_me boolean,
  seasons_played integer,
  total_points numeric,
  total_spent numeric,
  films_owned integer,
  best_finish integer,
  seasons_won integer,
  shared_leagues text[]
)
language plpgsql
security definer
set search_path to 'public'
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

comment on function public.get_player_profile(uuid) is
  'One player''s public card. Readable by the player themselves and by anyone '
  'who shares a league with them; a player you share nothing with raises "no '
  'such player" rather than "not allowed", so the function does not confirm '
  'that an account exists.';

revoke all on function public.get_player_profile(uuid) from public, anon;
grant execute on function public.get_player_profile(uuid) to authenticated;

-- ── 5. The constraints, then the columns ───────────────────────────────────
-- Constraints first: dropping a column takes its checks with it, but naming
-- them here means this migration reads as the complete inventory of what the
-- chosen avatar occupied.
alter table public.profiles drop constraint if exists profiles_avatar_glyph_known;
alter table public.profiles drop constraint if exists profiles_avatar_pair_range;
alter table public.leagues  drop constraint if exists leagues_avatar_glyph_known;
alter table public.leagues  drop constraint if exists leagues_avatar_pair_range;

alter table public.profiles drop column if exists avatar_glyph;
alter table public.profiles drop column if exists avatar_pair;
alter table public.profiles drop column if exists peep_parts;

alter table public.leagues drop column if exists avatar_glyph;
alter table public.leagues drop column if exists avatar_pair;

