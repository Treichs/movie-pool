-- The season roster locks when BIDDING STARTS, not when the season row is
-- created (2026-08-04).
--
-- THIS IS THE OTHER HALF of 20260804080000. Making seasons active from birth
-- broke the most ordinary flow in the app, and it broke it silently:
--
--   create a league  ->  Season 1 exists and is active
--   invite your friends  ->  they join the LEAGUE
--   ...and they cannot play Season 1. Ever.
--
-- Because add_season_member refused anything but a `draft` season, and
-- accept_league_invite deliberately did not touch season_members at all — both
-- resting on ADR-016's roster lock, which took "the season has been created" as
-- the moment play begins. With a draft state that was defensible: draft WAS the
-- window for assembling a roster. With seasons active on creation there is no
-- window at all, so a brand-new league's first season would lock everyone out
-- except the commissioner who made it.
--
-- WHAT THE LOCK IS ACTUALLY FOR. ADR-016 exists so nobody joins a season
-- already in progress and lands mid-table with a full bankroll against players
-- who have spent theirs. That is a statement about BIDDING, not about a row
-- existing. A season whose weeks are all still draft has no bids, no ownership
-- and no standings — there is no position for a latecomer to unfairly occupy.
--
-- So the lock moves to the event it was always about: the first week to open.
-- Before that, joining the league joins the season. After it, the old rule
-- applies unchanged — you play from the next season.

-- ---------------------------------------------------------------------------
-- The test, named once so the two callers below cannot drift apart.
--
-- "Any week that is not still draft" rather than "any week that is open":
-- opened-then-closed, resolved and scored all mean bidding HAS happened, and a
-- season between weeks must stay locked.
-- ---------------------------------------------------------------------------
create or replace function public.season_bidding_has_begun(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from weeks w
    where w.season_id = p_season_id and w.status <> 'draft'
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. add_season_member — lock on the first open week, not on status.
--    Body from pg_get_functiondef; only the guard changed.
-- ---------------------------------------------------------------------------
create or replace function public.add_season_member(p_season_id uuid, p_email text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season     seasons%rowtype;
  v_profile_id uuid;
  v_role       public.member_role;
  v_member_id  uuid;
begin
  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can add players';
  end if;

  -- The lock. Was `v_season.status <> 'draft'`.
  if season_bidding_has_begun(p_season_id) then
    raise exception
      'bidding has already started in this season — its players are locked. They can join the league now and play the next season.';
  end if;
  if v_season.status in ('completed', 'archived') then
    raise exception 'this season is over';
  end if;

  select lm.profile_id, lm.role into v_profile_id, v_role
  from league_members lm
  join profiles pr on pr.id = lm.profile_id
  where lm.league_id = v_season.league_id
    and lower(pr.email) = lower(trim(p_email));
  if not found then
    raise exception 'no league member found for % — add them to the league first', trim(p_email);
  end if;

  if exists (select 1 from season_members
             where season_id = p_season_id and profile_id = v_profile_id) then
    raise exception 'that account is already in this season';
  end if;

  insert into season_members (season_id, profile_id, role)
  values (p_season_id, v_profile_id, v_role)
  returning id into v_member_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'add_season_member',
          jsonb_build_object('profile_id', v_profile_id, 'role', v_role));

  return v_member_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. accept_league_invite — join the season too, when it has not started.
--    Body from pg_get_functiondef; only the season_members insert is new.
-- ---------------------------------------------------------------------------
create or replace function public.accept_league_invite(
  p_token     text default null,
  p_invite_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_invite league_invites%rowtype;
  v_email  text;
  v_season seasons%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if (p_token is null) = (p_invite_id is null) then
    raise exception 'accept an invitation by its link or its id, not both';
  end if;

  select lower(p.email) into v_email from profiles p where p.id = auth.uid();

  if p_token is not null then
    select * into v_invite from league_invites where token = p_token;
  else
    select * into v_invite from league_invites where id = p_invite_id;
  end if;
  if not found then
    raise exception 'that invitation is not valid';
  end if;

  -- A TARGETED invite is for one address and nobody else, even if the token
  -- leaks. An open link is for whoever holds it, which is the point.
  if v_invite.email is not null and v_invite.email <> v_email then
    raise exception 'that invitation was sent to a different email address';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'that invitation has expired — ask for a new one';
  end if;

  -- A targeted invite is single-use; an open LINK stays usable until it
  -- expires, so several people can join from the same message. Marking the
  -- link accepted on first use would make it a one-person link, which is not
  -- what "share this with the group" means.
  if v_invite.email is not null and v_invite.accepted_at is not null then
    raise exception 'that invitation has already been used';
  end if;

  if exists (
    select 1 from league_members
    where league_id = v_invite.league_id and profile_id = auth.uid()
  ) then
    -- Not an error: clicking a link twice, or being added by hand in between,
    -- should land you in the league rather than on an error page.
    return v_invite.league_id;
  end if;

  -- Always `player` (ADR-019 — the commissioner role moves only by grant).
  insert into league_members (league_id, profile_id, role)
  values (v_invite.league_id, auth.uid(), 'player');

  -- ...and into the current season, IF bidding has not started in it. Joining
  -- a league whose season is still being filled should put you in that season —
  -- otherwise the first people invited to a brand-new league would all have to
  -- sit out its first season, which is nobody's idea of joining a pool.
  -- Once a week has opened the old rule applies: you play from the next one.
  select * into v_season from seasons
  where league_id = v_invite.league_id and status = 'active'
  order by created_at desc
  limit 1;

  if found and not season_bidding_has_begun(v_season.id) then
    insert into season_members (season_id, profile_id, role)
    values (v_season.id, auth.uid(), 'player')
    on conflict do nothing;
  end if;

  if v_invite.email is not null then
    update league_invites
    set accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;
  end if;

  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'accept_league_invite',
          jsonb_build_object('league_id', v_invite.league_id,
                             'invite_id', v_invite.id));

  return v_invite.league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill: league members stranded outside a season that never started.
--
--    Anyone who joined a league before this migration, whose season has not
--    opened a week, should be in it — that is what the rule above says, and
--    they are only outside it because of the moment they happened to join.
-- ---------------------------------------------------------------------------
insert into season_members (season_id, profile_id, role)
select s.id, lm.profile_id, lm.role
from seasons s
join league_members lm on lm.league_id = s.league_id
where s.status = 'active'
  and not season_bidding_has_begun(s.id)
  and not exists (
    select 1 from season_members sm
    where sm.season_id = s.id and sm.profile_id = lm.profile_id
  );
