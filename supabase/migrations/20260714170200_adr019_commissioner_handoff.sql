-- ============================================================================
-- ADR-019 — One commissioner per league; protected handoff; no self-demote
--
-- Supersedes ADR-016's multi-commissioner clause ("Leagues may have several
-- commissioners, never zero"). The new rule is exactly ONE, always:
--   * a league has exactly one commissioner at any moment;
--   * a commissioner cannot demote themselves — that would leave zero;
--   * the only way to relinquish the role is HANDOFF, which atomically makes
--     another member commissioner and drops the outgoing one to player. The
--     outgoing commissioner REMAINS in the league.
--
-- Enforced with a partial unique index rather than trigger logic, so the
-- invariant holds against any writer — RPC, service role, or psql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Normalise existing data before the constraint lands.
--
-- ADR-016 permitted several commissioners, so a league could legitimately have
-- more than one today and the index below would fail on it. Keep the earliest
-- (the league's creator, in practice) and drop the rest to player. Checked
-- against the hosted dev DB at time of writing: every league already has
-- exactly one, so this is expected to be a no-op — it exists so the migration
-- is correct wherever it runs, not because a fix is known to be needed.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    profile_id,
    league_id,
    row_number() over (partition by league_id order by created_at, id) as rn
  from public.league_members
  where role = 'commissioner'
),
demoted as (
  update public.league_members lm
  set role = 'player'
  from ranked r
  where lm.id = r.id
    and r.rn > 1
  returning lm.league_id, lm.profile_id
)
-- Season role mirrors league role (phase 11) — keep the mirror honest.
update public.season_members sm
set role = 'player'
from demoted d
join public.seasons s on s.league_id = d.league_id
where sm.season_id = s.id
  and sm.profile_id = d.profile_id;

-- The invariant: at most one commissioner per league. Combined with the
-- at-least-one guards in remove_league_member / set_league_member_role, this
-- means exactly one.
create unique index if not exists league_members_one_commissioner_idx
  on public.league_members (league_id)
  where role = 'commissioner';

-- ---------------------------------------------------------------------------
-- 2. handoff_league_commissioner — the ONLY way the role moves.
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
    raise exception 'only the league commissioner can hand off the role';
  end if;

  -- The caller is the outgoing commissioner (the check above proves it).
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

  -- Order matters: demote first, then promote. The partial unique index is
  -- checked per statement, so promoting first would momentarily create two
  -- commissioners and abort the handoff.
  update league_members set role = 'player'       where id = v_from.id;
  update league_members set role = 'commissioner' where id = v_to.id;

  -- Mirror onto every season in the league so the display never drifts.
  update season_members sm
  set role = 'player'
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_to.league_id
    and sm.profile_id = v_from.profile_id;

  update season_members sm
  set role = 'commissioner'
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_to.league_id
    and sm.profile_id = v_to.profile_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'handoff_league_commissioner',
          jsonb_build_object('league_id',      v_to.league_id,
                             'from_profile_id', v_from.profile_id,
                             'to_profile_id',   v_to.profile_id));
end;
$$;

comment on function public.handoff_league_commissioner(uuid) is
  'ADR-019: atomically transfer the league commissioner role. Caller must be '
  'the current commissioner; they become a player and REMAIN in the league.';

-- ---------------------------------------------------------------------------
-- 3. set_league_member_role — now almost entirely closed off.
--
-- Under one-commissioner-per-league both of its former uses are illegal:
-- promoting someone to commissioner IS a handoff (and must go through the
-- protected path, never a bare role dropdown — ADR-019 requires a confirmation
-- dialog behind an overflow menu), and demoting the commissioner can only mean
-- demoting yourself, which would leave the league with none.
--
-- Kept rather than dropped so the not-yet-rebuilt League page gets an
-- explanatory error instead of a missing-function failure. It should be
-- dropped once that page moves to the handoff RPC.
-- ---------------------------------------------------------------------------
create or replace function public.set_league_member_role(
  p_member_id uuid,
  p_role      public.member_role
)
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
    raise exception 'only a league commissioner can change roles';
  end if;
  if v_member.role = p_role then
    return;
  end if;

  if p_role = 'commissioner' then
    raise exception
      'a league has exactly one commissioner — hand the role over instead of adding a second';
  end if;

  -- Reaching here means demoting a commissioner. With exactly one per league,
  -- that commissioner is always the caller.
  if v_member.role = 'commissioner' then
    raise exception
      'a commissioner cannot step down directly — hand the role to another member first';
  end if;

  update league_members set role = p_role where id = p_member_id;

  update season_members sm
  set role = p_role
  from seasons s
  where s.id = sm.season_id
    and s.league_id = v_member.league_id
    and sm.profile_id = v_member.profile_id;

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'set_league_member_role',
          jsonb_build_object('league_id', v_member.league_id,
                             'profile_id', v_member.profile_id,
                             'from', v_member.role, 'to', p_role));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.handoff_league_commissioner(uuid) from public, anon;
grant execute on function public.handoff_league_commissioner(uuid) to authenticated;
