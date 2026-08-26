-- ---------------------------------------------------------------------------
-- ADR-082 — identity is the primary key, never a display string.
--
-- Six read paths handed the app a bare display_name and nothing else, so every
-- consumer had to key on the name to do anything with it. That is the defect
-- ADR-082 names: display_name has no uniqueness constraint and should not have
-- one, so two members called "Mike" silently become one Mike — one avatar, one
-- profile link, one actor on every audit line.
--
-- The fix is the same everywhere: RETURN THE ID ALONGSIDE THE NAME. The name
-- stays, because it is what the app renders and because reading it live (rather
-- than snapshotting it) is what makes a rename propagate through 33 seasons of
-- history at once. Only its job changes — label, never key.
--
-- Nothing here widens what anyone can read. Every function keeps its existing
-- gate; each gains one uuid column identifying a row the caller was already
-- being shown.
--
-- ON `drop` RATHER THAN `create or replace`: Postgres refuses to replace a
-- function whose RETURNS TABLE shape changes (42P13) — adding a column IS
-- changing the row type. So each function is dropped and re-created, and its
-- grants re-issued, because DROP takes the grants with it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. get_avatar_overrides — ADR-050's chosen-avatar map.
--
-- Was `display_name -> choice`, and the collision showed the wrong FACE: two
-- same-named members both rendered the choice of whichever row the client's
-- map happened to keep, including for the member who never chose one.
-- ---------------------------------------------------------------------------
drop function if exists public.get_avatar_overrides();

create function public.get_avatar_overrides()
returns table (
  profile_id   uuid,
  display_name text,
  avatar_pair  smallint,
  avatar_glyph text
)
language sql security definer set search_path = public
stable
as $$
  select p.id, p.display_name, p.avatar_pair, p.avatar_glyph
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

-- `distinct` is gone with the name key: one row per profile is guaranteed by
-- profiles' own primary key, and the exists() cannot duplicate it.

revoke all on function public.get_avatar_overrides() from public, anon;
grant execute on function public.get_avatar_overrides() to authenticated;

comment on function public.get_avatar_overrides() is
  'ADR-050/ADR-082: profile id -> chosen avatar, for every profile the caller '
  'shares a league with (plus their own). display_name rides along as the '
  'label and as the fallback key for call sites that still have no id. Only '
  'rows carrying a CHOICE are returned; a profile absent from the result is '
  'still derived from its name.';

-- ---------------------------------------------------------------------------
-- 2. get_player_directory — what makes a PlayerChip a link.
--
-- Was `display_name -> profile_id`, which is the collision at its most direct:
-- both members' chips linked to whichever profile the map stored last, so one
-- of the two could not reach their own page from anywhere in the app.
--
-- Column ORDER changes too (id first), which is itself a shape change — hence
-- the drop.
-- ---------------------------------------------------------------------------
drop function if exists public.get_player_directory();

create function public.get_player_directory()
returns table (profile_id uuid, display_name text)
language sql security definer set search_path = public
stable
as $$
  select p.id, p.display_name
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
  'ADR-082: every profile the caller shares a league with, by id and name. '
  'Lets PlayerChip resolve a link from an id directly, and lets the client '
  'detect a name shared by two accounts and decline to guess between them.';

-- ---------------------------------------------------------------------------
-- 3. v_standings — the highest-leverage row in the app.
--
-- Eight player-facing surfaces read a standings row (the standings table, the
-- podium, the bump chart, the season panel, the position preview, the
-- ownership matrix, the leaderboard chart, the awards) and every one of them
-- had only `display_name` to render a player with. season_member_id is a real
-- identity but the WRONG one — it changes every season, so it cannot key an
-- avatar or a profile link, both of which are properties of the account.
--
-- Appended at the END of the column list, which is the only shape change
-- `create or replace view` accepts. security_invoker must be restated: the
-- WITH options are replaced wholesale, and losing it would silently promote
-- the view to definer's rights.
-- ---------------------------------------------------------------------------
create or replace view public.v_standings
with (security_invoker = true)
as
select
  sm.season_id,
  sm.id                               as season_member_id,
  pr.display_name,
  sm.role,
  count(b.id)::integer                as films_owned,
  coalesce(sum(f.score), 0)::numeric  as points,
  coalesce(sum(b.amount), 0)::integer as spent,
  case when coalesce(sum(b.amount), 0) > 0
       then round(coalesce(sum(f.score), 0) / sum(b.amount), 3)
  end                                 as efficiency,
  sm.profile_id
from season_members sm
join profiles pr on pr.id = sm.profile_id
left join (
  bids b
  join films f on f.id = b.film_id and f.status = 'active'
) on b.season_member_id = sm.id and b.is_winning
group by sm.season_id, sm.id, pr.display_name, sm.role, sm.profile_id;

comment on view public.v_standings is
  'Cumulative points / spent / efficiency per season member (rulebook 7, 7.1), '
  'derived and never stored. Carries profile_id as of ADR-082 so a standings '
  'row can identify the ACCOUNT behind it, not just the season membership.';

-- ---------------------------------------------------------------------------
-- 4. get_league_activity — the actor on every audit line.
--
-- The feed and the Corrections pane both render `actor_name`. A correction
-- attributed to the wrong Mike is worse than a wrong avatar: it is an audit
-- record naming the wrong person.
-- ---------------------------------------------------------------------------
drop function if exists public.get_league_activity(uuid, integer);

create function public.get_league_activity(
  p_league_id uuid,
  p_limit     integer default 12
)
returns table (
  -- BIGINT, not uuid. audit_log.id is a bigserial, and 20260802060000 exists
  -- solely because this was once declared uuid.
  id          bigint,
  action      text,
  at          timestamptz,
  actor_id    uuid,
  actor_name  text,
  season_id   uuid,
  season_name text,
  week_number integer
)
language plpgsql security definer set search_path = public
as $$
begin
  if not is_league_member(p_league_id) then
    raise exception 'not a member of this league';
  end if;

  return query
  select
    a.id,
    a.action,
    a.created_at,
    a.actor,
    p.display_name,
    a.season_id,
    s.name,
    (select w.number from weeks w
     where w.id = nullif(a.detail->>'week_id', '')::uuid)
  from audit_log a
  left join profiles p on p.id = a.actor
  left join seasons s on s.id = a.season_id
  where
    (
      a.season_id in (select s2.id from seasons s2 where s2.league_id = p_league_id)
      or (a.season_id is null
          and nullif(a.detail->>'league_id', '')::uuid = p_league_id)
    )
    and a.action in (
      'create_season', 'update_season_status',
      'open_week', 'auto_open_week', 'close_week',
      -- Dead writers, live history.
      'resolve_week', 'week_scored',
      -- ADR-070 / ADR-069.
      'finalize_week', 'skip_week', 'unskip_week',
      'add_league_member', 'accept_league_invite', 'remove_league_member',
      'handoff_league_commissioner',
      'promote_league_commissioner', 'demote_league_commissioner',
      'override_bid_amount', 'override_film_score', 'remove_film',
      'finalize_settlement'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

revoke all on function public.get_league_activity(uuid, integer) from public, anon;
grant execute on function public.get_league_activity(uuid, integer) to authenticated;

comment on function public.get_league_activity(uuid, integer) is
  'Curated audit_log slice for one league. Whitelisted actions only and the '
  'raw detail payload never crosses this boundary. Carries actor_id as of '
  'ADR-082 — an audit line must name an account, not a string.';

-- ---------------------------------------------------------------------------
-- 5. get_week_overrides — the same actor problem, on the week board.
-- ---------------------------------------------------------------------------
drop function if exists public.get_week_overrides(uuid);

create function public.get_week_overrides(p_week_id uuid)
returns table (
  id         bigint,
  action     text,
  at         timestamptz,
  actor_id   uuid,
  actor_name text,
  title      text,
  detail     jsonb
)
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  -- w.id, not id.
  select * into v_week from weeks w where w.id = p_week_id;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_season_member(v_week.season_id) then
    raise exception 'not a member of this season';
  end if;

  return query
  select
    a.id,
    a.action,
    a.created_at,
    a.actor,
    p.display_name,
    a.detail ->> 'title',
    jsonb_strip_nulls(jsonb_build_object(
      'old',    a.detail -> 'old',
      'new',    a.detail -> 'new',
      'reason', a.detail ->> 'reason'))
  from audit_log a
  left join profiles p on p.id = a.actor
  where a.season_id = v_week.season_id
    and nullif(a.detail->>'week_id', '')::uuid = p_week_id
    and a.action in ('override_bid_amount', 'override_film_score', 'remove_film')
  order by a.created_at desc;
end;
$$;

revoke all on function public.get_week_overrides(uuid) from public, anon;
grant execute on function public.get_week_overrides(uuid) to authenticated;

comment on function public.get_week_overrides(uuid) is
  'ADR-054 door into audit_log for one week''s commissioner overrides. detail '
  'is trimmed to old/new/reason. Carries actor_id as of ADR-082.';

-- ---------------------------------------------------------------------------
-- 6. get_my_league_invites — "from <name>" on the dashboard invite card.
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_league_invites();

create function public.get_my_league_invites()
returns table (
  id             uuid,
  league_id      uuid,
  league_name    text,
  invited_by_id  uuid,
  invited_by     text,
  expires_at     timestamptz
)
language sql security definer set search_path = public
stable
as $$
  select i.id, i.league_id, l.name, inviter.id, inviter.display_name, i.expires_at
  from league_invites i
  join leagues l on l.id = i.league_id
  join profiles inviter on inviter.id = i.created_by
  where i.email is not null
    and i.accepted_at is null
    and i.expires_at > now()
    and i.email = (select lower(p.email) from profiles p where p.id = auth.uid())
    and not exists (
      select 1 from league_members lm
      where lm.league_id = i.league_id and lm.profile_id = auth.uid()
    );
$$;

revoke all on function public.get_my_league_invites() from public, anon;
grant execute on function public.get_my_league_invites() to authenticated;

comment on function public.get_my_league_invites() is
  'Open email invites addressed to the caller. Carries invited_by_id as of '
  'ADR-082 so the inviter''s chip links to the right account.';
