-- The league activity feed (bug-backlog: a deferred feature with its design
-- already done).
--
-- The League page's "League Latest" rail shipped as recent RESULTS only, to
-- avoid backend work. This is the rest of the story: season started, week
-- opened, bidding closed, a member joined, the commissioner changed, the
-- settlement finalized.
--
-- `audit_log` is RLS-enabled with ZERO policies — a deliberate deny-all,
-- service-role only — and that stays true. Rather than adding a policy (which
-- would widen the table for every reader and every action), this exposes ONE
-- SECURITY DEFINER function returning a CURATED, league-scoped slice.
--
-- BID SECRECY: audit_log holds lifecycle events only. No row carries a bid
-- amount — place_bid and place_bids write no audit rows at all, and
-- close_week/resolve_week record only counts. Verified before this shipped,
-- and the whitelist below is what keeps it true as new actions are added: an
-- action that is not named here simply never surfaces. ADR-022 is unaffected.
--
-- The `detail` jsonb is NOT returned. Only a typed, per-action summary is, so
-- a future action cannot leak a field into the feed by accident.

create or replace function public.get_league_activity(
  p_league_id uuid,
  p_limit     integer default 12
)
returns table (
  id          uuid,
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
    -- Week number where the action names one. Read from the weeks table rather
    -- than from `detail`, so a malformed or absent detail cannot produce a
    -- wrong number — it produces null, and the UI says less rather than lying.
    (select w.number from weeks w
     where w.id = nullif(a.detail->>'week_id', '')::uuid)
  from audit_log a
  left join profiles p on p.id = a.actor
  left join seasons s on s.id = a.season_id
  where
    -- Season-scoped events in this league, UNION league-scoped events (which
    -- carry no season_id and name the league in `detail`).
    (
      a.season_id in (select id from seasons where league_id = p_league_id)
      or (a.season_id is null
          and nullif(a.detail->>'league_id', '')::uuid = p_league_id)
    )
    -- The whitelist. Everything else — every commissioner correction, every
    -- rules edit, every film add — stays out of the feed. This is a story, not
    -- a log, and an unrecognised action must default to INVISIBLE.
    and a.action in (
      'create_season', 'update_season_status',
      'open_week', 'auto_open_week', 'close_week', 'resolve_week', 'week_scored',
      'add_league_member', 'accept_league_invite', 'remove_league_member',
      'handoff_league_commissioner',
      'finalize_settlement'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

revoke all on function public.get_league_activity(uuid, integer) from public, anon;
grant execute on function public.get_league_activity(uuid, integer) to authenticated;

comment on function public.get_league_activity(uuid, integer) is
  'Curated, league-scoped activity feed over audit_log, which stays deny-all '
  'to everyone else. Whitelisted actions only and no `detail` passthrough, so '
  'a new audit action is invisible until deliberately added. Contains no bid '
  'amounts — audit_log records lifecycle events only (ADR-022 unaffected).';
