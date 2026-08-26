-- ============================================================================
-- ADR-060 — A league may have several commissioners
--
-- Supersedes ADR-019's "exactly ONE, always". That rule was enforced by a
-- partial unique index on (league_id) where role = 'commissioner', and the
-- thing it was actually protecting was NEVER ZERO — never-two was the
-- mechanism, not the goal. A unique index delivers never-zero only as a side
-- effect: with one slot, you cannot empty it without filling it.
--
-- So the constraint is replaced with the guarantee stated directly:
--   * promotion requires an EXISTING commissioner, so the role can never be
--     self-granted — this is the half of ADR-019 that mattered;
--   * the LAST commissioner cannot be demoted or removed, so it can never
--     reach zero — this is the other half, now enforced where it belongs.
-- Between them a league always has at least one commissioner and nobody can
-- appoint themselves. What is given up is only the ceiling.
--
-- A note on where the guard lives. ADR-019 put the invariant in an index
-- specifically so it would hold "against any writer — RPC, service role, or
-- psql". That property is genuinely weakened here: never-zero is now enforced
-- by the RPCs, and a service-role UPDATE could still empty a league. It cannot
-- be an index or a CHECK — both are per-row, and "at least one row in this
-- partition" is not expressible that way. A constraint trigger could, at the
-- cost of firing on every membership write forever to catch a case no
-- application path can reach. The RPCs are the only route the app has, and the
-- seed/mock scripts that use the service role are ours; that is the trade.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The ceiling comes off.
-- ---------------------------------------------------------------------------
drop index if exists public.league_members_one_commissioner_idx;

-- ---------------------------------------------------------------------------
-- 2. promote_league_commissioner — grant the role, additively.
--
-- The gate is `is_league_commissioner(...)`: only someone who already holds
-- the role can hand it out. That single check is what keeps the role
-- un-self-grantable now that the index is gone.
-- ---------------------------------------------------------------------------
create or replace function public.promote_league_commissioner(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member league_members%rowtype;
begin
  select * into v_member from league_members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;

  if not is_league_commissioner(v_member.league_id) then
    raise exception 'only a league commissioner can grant the commissioner role';
  end if;

  -- Idempotent: asking for a state that already holds is not an error.
  if v_member.role = 'commissioner' then
    return;
  end if;

  update league_members set role = 'commissioner' where id = p_member_id;

  -- The season role mirrors the league role (phase 11) so the display never
  -- drifts from the truth. Authorization itself reads the league live.
  update season_members sm
  set role = 'commissioner'
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_member.league_id
    and sm.profile_id = v_member.profile_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'promote_league_commissioner',
          jsonb_build_object('league_id', v_member.league_id,
                             'profile_id', v_member.profile_id));
end;
$$;

comment on function public.promote_league_commissioner(uuid) is
  'ADR-060: add a commissioner to a league. Caller must already be one, so '
  'the role can never be self-granted. Additive — the caller keeps theirs.';

-- ---------------------------------------------------------------------------
-- 3. demote_league_commissioner — take the role back, or step down.
--
-- Self-demotion is now legal, which ADR-019 forbade outright. It was forbidden
-- because with one commissioner it always meant leaving the league with none;
-- with several it usually does not, and the guard below is the precise
-- statement of the case that is still forbidden.
-- ---------------------------------------------------------------------------
create or replace function public.demote_league_commissioner(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member league_members%rowtype;
begin
  select * into v_member from league_members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;

  if not is_league_commissioner(v_member.league_id) then
    raise exception 'only a league commissioner can remove the commissioner role';
  end if;

  if v_member.role <> 'commissioner' then
    return;
  end if;

  -- The never-zero guard. `for update` above holds this row, so two
  -- concurrent demotions of the two last commissioners cannot both pass:
  -- the second waits, re-reads, and finds itself alone.
  if not exists (
    select 1 from league_members
    where league_id = v_member.league_id
      and role = 'commissioner'
      and id <> p_member_id
  ) then
    raise exception
      'a league must always have at least one commissioner — promote someone else first';
  end if;

  update league_members set role = 'player' where id = p_member_id;

  update season_members sm
  set role = 'player'
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_member.league_id
    and sm.profile_id = v_member.profile_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'demote_league_commissioner',
          jsonb_build_object('league_id', v_member.league_id,
                             'profile_id', v_member.profile_id,
                             'self', v_member.profile_id = auth.uid()));
end;
$$;

comment on function public.demote_league_commissioner(uuid) is
  'ADR-060: remove the commissioner role, including from yourself. Refuses '
  'on the last commissioner, which is what keeps a league from reaching zero.';

-- ---------------------------------------------------------------------------
-- 4. handoff_league_commissioner — still the atomic "you take it, I'm out".
--
-- Redundant in principle now (promote, then demote yourself) but not in
-- practice: it is the ONE move available to a SOLE commissioner who wants out
-- in a single confirmed act, and it is the only path that cannot momentarily
-- leave the league in a state nobody intended. Rewritten here for two reasons
-- — the old body's comment justified its statement order by the unique index,
-- which no longer exists, and handing off to someone who is ALREADY a
-- commissioner is now reachable and means something different (that is a plain
-- step-down, so it is redirected rather than silently performed).
-- ---------------------------------------------------------------------------
create or replace function public.handoff_league_commissioner(p_to_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_to   league_members%rowtype;
  v_from league_members%rowtype;
begin
  select * into v_to from league_members where id = p_to_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;

  if not is_league_commissioner(v_to.league_id) then
    raise exception 'only a league commissioner can hand off the role';
  end if;

  select * into v_from
  from league_members
  where league_id = v_to.league_id
    and profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this league';
  end if;

  if v_from.id = v_to.id then
    raise exception 'you are already this league''s commissioner';
  end if;

  if v_to.role = 'commissioner' then
    raise exception
      'they are already a commissioner — step down instead of handing off';
  end if;

  -- Order no longer matters for correctness (ADR-060 removed the unique
  -- index), but promote-then-demote is now the safer order to read: at no
  -- point in the statement sequence does the league have zero commissioners.
  update league_members set role = 'commissioner' where id = v_to.id;
  update league_members set role = 'player'       where id = v_from.id;

  update season_members sm
  set role = 'commissioner'
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_to.league_id
    and sm.profile_id = v_to.profile_id;

  update season_members sm
  set role = 'player'
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_to.league_id
    and sm.profile_id = v_from.profile_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'handoff_league_commissioner',
          jsonb_build_object('league_id',      v_to.league_id,
                             'from_profile_id', v_from.profile_id,
                             'to_profile_id',   v_to.profile_id));
end;
$$;

comment on function public.handoff_league_commissioner(uuid) is
  'ADR-019/060: atomically pass the commissioner role to another member and '
  'step down to player, remaining in the league. The one-shot exit for a sole '
  'commissioner; co-commissioners should promote and demote instead.';

-- ---------------------------------------------------------------------------
-- 5. set_league_member_role — a thin front door, no longer a wall.
--
-- ADR-019 left this rejecting both of its own uses, kept only so an old page
-- got a readable error. Under ADR-060 both are legal again, so rather than
-- restating the rules a third time it now DELEGATES: one implementation of the
-- promotion gate, one implementation of the never-zero guard, and the audit
-- trail names the specific act rather than a generic role change.
-- ---------------------------------------------------------------------------
create or replace function public.set_league_member_role(
  p_member_id uuid,
  p_role      public.member_role
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_role = 'commissioner' then
    perform promote_league_commissioner(p_member_id);
  else
    perform demote_league_commissioner(p_member_id);
  end if;
end;
$$;

comment on function public.set_league_member_role(uuid, public.member_role) is
  'ADR-060: delegates to promote_league_commissioner / '
  'demote_league_commissioner so the guards have exactly one implementation.';

-- ---------------------------------------------------------------------------
-- 6. remove_league_member — same guards, better order.
--
-- Its never-zero guard has been there since phase 11 and is unchanged in
-- substance. What changes is that it now runs FIRST. Both guards can apply to
-- the same member, and the season-membership check was winning, so a sole
-- commissioner who had played a season got "cannot remove a member who is part
-- of a season" — true, but not the reason that matters, and not the one that
-- tells you what to do about it. It also meant the never-zero guard could not
-- be isolated by a test on any league that had ever run a season.
--
-- p1-style removals (a player who has played) and late-joiner removals (never
-- played, not a commissioner) are unaffected: only rows where BOTH conditions
-- hold see a different message.
-- ---------------------------------------------------------------------------
create or replace function public.remove_league_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member league_members%rowtype;
begin
  select * into v_member from league_members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;
  if not is_league_commissioner(v_member.league_id) then
    raise exception 'only a league commissioner can remove members';
  end if;

  if v_member.role = 'commissioner' and not exists (
    select 1 from league_members
    where league_id = v_member.league_id
      and role = 'commissioner'
      and id <> p_member_id
  ) then
    raise exception
      'a league must always have at least one commissioner — promote someone else first';
  end if;

  if exists (
    select 1
    from season_members sm
    join seasons s on s.id = sm.season_id
    where sm.profile_id = v_member.profile_id
      and s.league_id = v_member.league_id
  ) then
    raise exception 'cannot remove a member who is part of a season in this league';
  end if;

  delete from league_members where id = p_member_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'remove_league_member',
          jsonb_build_object('league_id', v_member.league_id,
                             'profile_id', v_member.profile_id,
                             'role', v_member.role));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The activity feed learns the two new verbs.
--
-- The whitelist in get_league_activity defaults an unrecognised action to
-- INVISIBLE, which is the right default but means every new membership action
-- has to be added here deliberately. Commissioner changes are exactly the kind
-- of event the feed exists to disclose, so both belong in it.
-- ---------------------------------------------------------------------------
create or replace function public.get_league_activity(
  p_league_id uuid,
  p_limit     integer default 12
)
returns table (
  -- bigint, NOT uuid: audit_log.id is a bigserial, and 20260802060000 already
  -- corrected this signature once. Redefining a function means carrying
  -- forward its LATEST definition, not the one it was introduced with —
  -- Postgres refuses to change a function's OUT-parameter row type, so this
  -- was caught by the push rather than shipped.
  id          bigint,
  action      text,
  at          timestamptz,
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
      a.season_id in (select id from seasons where league_id = p_league_id)
      or (a.season_id is null
          and nullif(a.detail->>'league_id', '')::uuid = p_league_id)
    )
    and a.action in (
      'create_season', 'update_season_status',
      'open_week', 'auto_open_week', 'close_week', 'resolve_week', 'week_scored',
      'add_league_member', 'accept_league_invite', 'remove_league_member',
      'handoff_league_commissioner',
      'promote_league_commissioner', 'demote_league_commissioner',
      'finalize_settlement'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.promote_league_commissioner(uuid) from public, anon;
revoke all on function public.demote_league_commissioner(uuid)  from public, anon;
grant execute on function public.promote_league_commissioner(uuid) to authenticated;
grant execute on function public.demote_league_commissioner(uuid)  to authenticated;
