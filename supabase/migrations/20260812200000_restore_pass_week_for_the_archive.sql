-- RESTORES pass_week AND resume_bidding, DROPPED IN ERROR EARLIER TODAY.
--
-- 20260812180000 dropped both on the reasoning in ADR-109: sitting a week out
-- becomes a saved slate of $0 bids, so a flag on the week plus a deletion of
-- every bid behind it was redundant. That reasoning holds for the PLAYER, and
-- the player-facing control is gone and stays gone.
--
-- It was wrong about the callers. `pass_week` had one outside the app:
-- scripts/pool-replica.mts:528 uses it to ingest the real pool's archive, and
-- it is the only writer of the 263 `passed` sheets across replica seasons
-- 25-33 — nine seasons of "this player sat this week out", for weeks that have
-- NO bid rows at all because the workbooks record winners only. That fact is
-- therefore not derivable from `bids` the way a live player's is, and dropping
-- the function silently stopped it being recordable: the call site swallows its
-- error (`.catch(() => {})`), so the next backfill run would have completed
-- normally and simply omitted every sat-out week.
--
-- Bodies are re-created verbatim from 20260809020000 — including its deadline
-- check, which is the reason that migration touched them at all.

create or replace function public.pass_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_member  season_members%rowtype;
  v_cleared integer;
begin
  select * into v_week from weeks where id = p_week_id;
  if not found then
    raise exception 'week not found';
  end if;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member from season_members sm
  where sm.season_id = v_week.season_id and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  delete from bids b
  using films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and b.season_member_id = v_member.id;
  get diagnostics v_cleared = row_count;

  insert into bid_sheets (week_id, season_member_id, status)
  values (p_week_id, v_member.id, 'passed')
  on conflict (week_id, season_member_id)
  do update set status = 'passed', updated_at = now();

  -- Audit, but NOT in the members' activity feed: get_league_activity works
  -- from a whitelist and this action is not on it, so passing stays private
  -- exactly as long as every other participation fact does.
  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'pass_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'bids_cleared', v_cleared));
end;
$$;

create or replace function public.resume_bidding(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week   weeks%rowtype;
  v_member season_members%rowtype;
begin
  select * into v_week from weeks where id = p_week_id;
  if not found then
    raise exception 'week not found';
  end if;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member from season_members sm
  where sm.season_id = v_week.season_id and sm.profile_id = auth.uid();
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  update bid_sheets set status = 'open', updated_at = now()
  where week_id = p_week_id
    and season_member_id = v_member.id
    and status = 'passed';
end;
$$;

revoke all on function public.pass_week(uuid)      from public, anon;
revoke all on function public.resume_bidding(uuid) from public, anon;
grant execute on function public.pass_week(uuid)      to authenticated;
grant execute on function public.resume_bidding(uuid) to authenticated;

-- The comment 20260812180000 put on the enum said 'passed' could no longer be
-- produced. It can, and it is — restated so the type does not carry a claim the
-- functions above contradict.
comment on type public.bid_sheet_status is
  'open | passed | closed. No PLAYER-facing path writes ''passed'' since '
  'ADR-109 — sitting a week out is a saved slate of $0 bids — but pass_week '
  'survives as the archive ingest''s way of recording a sat-out week, which '
  'cannot be inferred from bids because backfilled weeks have none.';
