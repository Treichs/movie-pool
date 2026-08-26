-- get_league_activity: restore the qualification that two ADR-060 migrations
-- silently undid (2026-08-04).
--
-- THE BUG. The function's RETURNS TABLE declares an OUT parameter named `id`,
-- so an unqualified `id` inside the body is ambiguous — PL/pgSQL cannot tell
-- the OUT parameter from `seasons.id`. Postgres raises 42702 at RUNTIME, not at
-- CREATE time, so the function installs cleanly and fails on every call.
--
-- 20260802050000_fix_activity_ambiguity.sql fixed exactly this, aliasing the
-- subquery to `s2`. Then 20260803040000_adr060_multi_commissioner.sql and
-- 20260803050000_adr060_commissioner_overrides.sql each re-declared the whole
-- function to add actions to the whitelist, and each started from the ORIGINAL
-- 20260802040000 body — the copy that is easiest to find by grep, and the one
-- with the bug. The fix was reverted twice in two days by migrations that had
-- nothing to do with it.
--
-- WHAT IT COST. Since 2026-08-03 get_league_activity has raised on every call,
-- in every league. src/lib/league.ts swallows the error and returns [], so
-- League Home's Activity panel has rendered "Nothing has happened here yet" for
-- leagues with thousands of audit rows, and the commissioner portal's
-- corrections table reads the same list. Nothing failed loudly: the RPC exists,
-- the grant is right, the page renders, and the empty state is a legitimate
-- state that a new league really does reach.
--
-- THE LESSON, which is now the second time it has been paid for: a migration
-- that re-declares a function to change one line must start from the CURRENT
-- definition (`pg_get_functiondef`), never from whichever earlier migration is
-- easiest to find. The same mistake hit seed_season_weeks on 2026-08-04 and was
-- caught there by a spike; this one had no spike over it and ran for a day.
--
-- This body IS the live definition, taken from pg_get_functiondef, with only
-- the two subquery references qualified. The whitelist is unchanged from what
-- is deployed — including the ADR-060 override actions, which are what the
-- corrections table reads.

create or replace function public.get_league_activity(
  p_league_id uuid,
  p_limit integer default 12
)
returns table (
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
    -- Week number where the action names one. Read from the weeks table rather
    -- than trusting the detail payload's own copy.
    (select w.number from weeks w
     where w.id = nullif(a.detail->>'week_id', '')::uuid)
  from audit_log a
  left join profiles p on p.id = a.actor
  left join seasons s on s.id = a.season_id
  where
    (
      -- `s2`, not a bare `seasons` — this is the whole fix. An unqualified
      -- `id` or `league_id` here resolves against the OUT parameters above.
      a.season_id in (select s2.id from seasons s2 where s2.league_id = p_league_id)
      or (a.season_id is null
          and nullif(a.detail->>'league_id', '')::uuid = p_league_id)
    )
    and a.action in (
      'create_season', 'update_season_status',
      'open_week', 'auto_open_week', 'close_week', 'resolve_week', 'week_scored',
      'add_league_member', 'accept_league_invite', 'remove_league_member',
      'handoff_league_commissioner',
      'promote_league_commissioner', 'demote_league_commissioner',
      -- ADR-060 commissioner overrides. No `detail` passthrough, so a
      -- correction is reported without its amounts.
      'override_bid_amount', 'override_film_score', 'remove_film',
      'finalize_settlement'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

revoke all on function public.get_league_activity(uuid, integer) from public, anon;
grant execute on function public.get_league_activity(uuid, integer) to authenticated;
