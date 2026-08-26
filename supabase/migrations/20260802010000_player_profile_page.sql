-- Public-within-your-leagues player pages.
--
-- Every surface already renders a PlayerChip; nothing has ever been clickable.
-- This adds the page behind that chip: who someone is, and how they have
-- actually played.
--
-- TWO NEW THINGS ONLY:
--   * profiles.bio — a short self-description, editable by its owner.
--   * get_player_profile(profile_id) — the stats, gathered in one call.
--
-- The avatar needs no new storage: ADR-050 already stores the chosen pair and
-- glyph, and the page themes itself from them. That is the whole reason the
-- avatar was built as a stored CHOICE rather than a rendered image.

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length check (bio is null or length(bio) <= 280);

comment on column public.profiles.bio is
  'A player''s short self-description for their profile page. Capped at 280 '
  'characters — this is a bio, not a blog.';

-- The owner writes their own, through an RPC (ADR-004). The existing
-- column-level grant that lets a user UPDATE their own display_name covers
-- that column only, and widening it would be a broader exception than this
-- needs.
create or replace function public.update_bio(p_bio text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_bio text := nullif(trim(coalesce(p_bio, '')), '');
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if v_bio is not null and length(v_bio) > 280 then
    raise exception 'a bio is capped at 280 characters';
  end if;

  update profiles set bio = v_bio where id = auth.uid();
end;
$$;

revoke all on function public.update_bio(text) from public, anon;
grant execute on function public.update_bio(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The profile itself.
--
-- VISIBILITY, decided deliberately: you can see the page of anyone you share a
-- league with, and nobody else. The app has no notion of a public internet
-- profile and should not grow one by accident — a pool is a private group, and
-- a page that anyone could enumerate would leak both the roster and how people
-- are doing. Your own page is always visible to you.
--
-- The numbers are DERIVED here exactly as they are everywhere else (build plan
-- §3): summed from v_standings, which is itself derived from bids and captures.
-- Nothing is stored, so a profile cannot go stale or disagree with the
-- leaderboard it links to.
-- ---------------------------------------------------------------------------
create or replace function public.get_player_profile(p_profile_id uuid)
returns table (
  profile_id     uuid,
  display_name   text,
  bio            text,
  avatar_pair    smallint,
  avatar_glyph   text,
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
  with mine as (
    -- Every season row belonging to this player, but ONLY in leagues the
    -- VIEWER also belongs to. Someone's results in a league you are not in are
    -- none of your business, and this is the line that enforces it.
    select s.id as season_id, s.league_id, sm.id as season_member_id
    from season_members sm
    join seasons s on s.id = sm.season_id
    where sm.profile_id = p_profile_id
      and (
        p_profile_id = auth.uid()
        or exists (
          select 1 from league_members lm
          where lm.league_id = s.league_id and lm.profile_id = auth.uid()
        )
      )
  ),
  stats as (
    select
      count(distinct m.season_id)::integer                as seasons_played,
      coalesce(sum(v.points), 0)::numeric                 as total_points,
      coalesce(sum(v.spent), 0)::numeric                  as total_spent,
      coalesce(sum(v.films_owned), 0)::integer            as films_owned
    from mine m
    left join v_standings v on v.season_member_id = m.season_member_id
  ),
  -- Finishing position per season, computed the same dense way rankBy does,
  -- and only for seasons that actually finished — a mid-season position is not
  -- a "finish" and would flatter or slander whoever is currently on a run.
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
    p.created_at,
    p.id = auth.uid(),
    st.seasons_played,
    st.total_points,
    st.total_spent,
    st.films_owned,
    (select min(place) from finishes),
    (select count(*)::integer from finishes where place = 1),
    (select coalesce(array_agg(distinct l.name order by l.name), '{}')
     from mine m join leagues l on l.id = m.league_id)
  from profiles p
  cross join stats st
  where p.id = p_profile_id;
end;
$$;

revoke all on function public.get_player_profile(uuid) from public, anon;
grant execute on function public.get_player_profile(uuid) to authenticated;

comment on function public.get_player_profile(uuid) is
  'A player''s profile page: identity, bio, chosen avatar, and career totals '
  'derived from v_standings. Visible only to someone who shares a league with '
  'them (or to themselves), and the stats cover only shared leagues.';

-- ---------------------------------------------------------------------------
-- Name -> id, so a PlayerChip can link without every caller carrying an id.
--
-- The same trade the ADR-050 override map makes: display_name is the one
-- identifier every player-rendering call site already has. Scoped to shared
-- leagues, so it resolves exactly the people whose pages are visible anyway.
-- ---------------------------------------------------------------------------
create or replace function public.get_player_directory()
returns table (display_name text, profile_id uuid)
language sql security definer set search_path = public
stable
as $$
  select distinct p.display_name, p.id
  from profiles p
  where p.id = auth.uid()
     or exists (
       select 1
       from league_members mine
       join league_members theirs on theirs.league_id = mine.league_id
       where mine.profile_id = auth.uid() and theirs.profile_id = p.id
     );
$$;

revoke all on function public.get_player_directory() from public, anon;
grant execute on function public.get_player_directory() to authenticated;

comment on function public.get_player_directory() is
  'display_name -> profile id for everyone the caller shares a league with. '
  'Lets PlayerChip link to a profile without threading ids through every '
  'surface that renders a player.';
