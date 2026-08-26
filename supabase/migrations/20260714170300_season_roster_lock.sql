-- ============================================================================
-- Season roster lock — tightens ADR-016
--
-- Decision (2026-07-13, ui-surfaces review of the season-control surface):
-- the set of PLAYERS in a season is fixed once that season starts. No one is
-- added after kick-off, and someone who joins the league mid-season is a
-- League Member but not a Player until the next season. Membership is a
-- league-level concept (ADR-016); a season merely snapshots it at creation.
--
-- Why the database and not just the UI: budgets, standings and settlement are
-- all DERIVED from the member set. Adding a player to a season already in
-- flight silently rewrites the denominator of every ranking and hands them a
-- full bankroll for a season they did not play. Removing one mid-season
-- rewrites history the other way. The season-control page still offers both —
-- this closes the hole underneath it before that page is rebuilt.
--
-- Draft is the window: a season is 'draft' while the commissioner sets it up,
-- and becomes 'active' when the season starts. So membership changes are
-- allowed exactly while the season is a draft.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. add_season_member — draft only.
--
-- Otherwise unchanged from phase 11: re-adds a LEAGUE member who is missing
-- from the season (someone who sat it out, or joined the league before the
-- season was started). The season role always mirrors the league role.
-- ---------------------------------------------------------------------------
create or replace function public.add_season_member(
  p_season_id uuid,
  p_email     text
)
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

  -- The lock.
  if v_season.status <> 'draft' then
    raise exception
      'this season has already started — its players are locked. They can join the league now and play the next season.';
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
-- 2. remove_season_member — draft only.
--
-- The existing has-bids guard already blocked the worst case, but a member
-- could still be removed from a live season before they had bid, quietly
-- changing the field mid-game. "Locked once the season starts" means both
-- directions.
--
-- The role guard here is also now redundant-but-harmless: ADR-019 makes the
-- commissioner a league-level role, and the at-least-one invariant lives
-- there. Season-level removal must never be the thing that decides it.
-- ---------------------------------------------------------------------------
create or replace function public.remove_season_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member season_members%rowtype;
  v_season seasons%rowtype;
begin
  select * into v_member from season_members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;
  if not is_commissioner(v_member.season_id) then
    raise exception 'only the commissioner can remove members';
  end if;

  select * into v_season from seasons where id = v_member.season_id;

  -- The lock.
  if v_season.status <> 'draft' then
    raise exception
      'this season has already started — its players are locked and cannot be removed';
  end if;

  -- Belt and braces: a member with bids is season history — removal would
  -- corrupt standings. Unreachable while the season is a draft (bidding needs
  -- an open week, which needs an active season), but the rule is about the
  -- data, not the path taken to it.
  if exists (select 1 from bids where season_member_id = p_member_id) then
    raise exception 'cannot remove a member who has placed bids';
  end if;

  if v_member.role = 'commissioner' then
    raise exception
      'the commissioner plays every season in their league — hand the role over at the league level instead';
  end if;

  delete from season_members where id = p_member_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_member.season_id, auth.uid(), 'remove_season_member',
          jsonb_build_object('profile_id', v_member.profile_id, 'role', v_member.role));
end;
$$;
