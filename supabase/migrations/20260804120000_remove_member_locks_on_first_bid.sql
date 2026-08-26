-- remove_season_member: lock on the first bid, matching add_season_member
-- (2026-08-04).
--
-- The pair was always symmetrical — you can add or remove a player right up to
-- the moment the season is a real contest, and not after. 20260804090000 and
-- 20260804110000 moved that moment for ADD and left REMOVE on the old
-- `status <> 'draft'` test, which after 20260804080000 means "always", so a
-- commissioner could no longer take anybody off a season they had just made.
--
-- Its own comment gave the game away. It called the bids check "belt and
-- braces… unreachable while the season is a draft (bidding needs an open week,
-- which needs an active season)" — the bids check WAS the real rule all along,
-- and the status test was standing in front of it doing the same job by proxy.
-- Now the proxy is gone and the rule is stated directly.
--
-- The per-member bids check stays, and it is not redundant with the
-- season-level one: season_bidding_has_begun asks whether the SEASON is a
-- contest yet, this asks whether THIS member is part of its history. The first
-- is what changed; the second has always been the thing that would corrupt
-- standings.

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

  -- The lock. Was `v_season.status <> 'draft'`.
  if season_bidding_has_begun(v_member.season_id) then
    raise exception
      'bidding has already started in this season — its players are locked and cannot be removed';
  end if;
  if v_season.status in ('completed', 'archived') then
    raise exception 'this season is over';
  end if;

  -- A member with bids is season history — removal would corrupt standings.
  -- Unreachable given the check above, and kept because the rule is about the
  -- data rather than the path taken to it.
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
