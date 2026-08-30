-- `get_player_seasons` HAS BEEN THROWING SINCE IT WAS WRITTEN.
--
-- It joins `seasons s` and selects `s.name` and `s.number`. The `seasons`
-- TABLE has neither: its columns are id, status, created_by, created_at,
-- league_id. A season's NAME is derived in the `v_seasons` VIEW, which is what
-- every other reader of a season name already uses (`notifications.ts` joins
-- `season:v_seasons(name)`).
--
-- ── WHY NOBODY NOTICED, WHICH IS THE PART WORTH RECORDING ─────────────────
-- The caller — `getPlayerSeasons` in `src/lib/player-profile.ts` — returned an
-- empty array on ANY error, so a function that could never succeed rendered as
-- a player who had simply never played. The screen that finally consumed it
-- showed "Seasons played 3" beside an empty season table, which is the only
-- reason this surfaced at all. That swallow is narrowed in the same commit:
-- the visibility refusal is still absorbed, every other error now throws.
--
-- The fix is the join, and nothing else changes: same signature, same
-- visibility rule, same dense-place computation, same ordering.

create or replace function public.get_player_seasons(p_profile_id uuid)
returns table(
  season_id uuid,
  season_name text,
  league_name text,
  season_status text,
  points numeric,
  spent numeric,
  films_owned integer,
  place integer,
  player_count integer
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

  -- Aliased short names throughout (m.sid, not season_id): RETURNS TABLE puts
  -- every output column in scope as a variable inside the function body, and a
  -- bare `season_id` in a subquery resolves to the OUT PARAMETER, not the
  -- table column — the exact shadowing that produced a wrong-rows bug on
  -- 2026-08-01. Distinct internal names make the collision impossible instead
  -- of merely avoided.
  return query
  with mine as (
    select
      s.id         as sid,
      s.name       as sname,   -- from v_seasons, which is where a name exists
      s.status     as sstatus,
      s.created_at as screated,
      l.name       as lname,
      sm.id        as member_id
    from season_members sm
    join v_seasons s on s.id = sm.season_id
    join leagues l on l.id = s.league_id
    where sm.profile_id = p_profile_id
      and (
        p_profile_id = auth.uid()
        or exists (
          select 1 from league_members lm
          where lm.league_id = s.league_id and lm.profile_id = auth.uid()
        )
      )
  )
  select
    m.sid,
    m.sname,
    m.lname,
    m.sstatus::text,
    coalesce(v.points, 0)::numeric,
    coalesce(v.spent, 0)::numeric,
    coalesce(v.films_owned, 0)::integer,
    -- The same dense place computation the profile's best-finish uses, so the
    -- two can never disagree about where a season landed. On a season where
    -- nobody has scored it reads 1st for everyone — the caller knows the
    -- status and labels a live season "so far" rather than "finished".
    (select count(distinct v2.points) + 1
     from v_standings v2
     where v2.season_id = m.sid and v2.points > coalesce(v.points, 0))::integer,
    (select count(*) from v_standings v3 where v3.season_id = m.sid)::integer
  from mine m
  left join v_standings v on v.season_member_id = m.member_id
  order by m.screated desc;
end;
$$;

revoke all on function public.get_player_seasons(uuid) from public, anon;
grant execute on function public.get_player_seasons(uuid) to authenticated;
