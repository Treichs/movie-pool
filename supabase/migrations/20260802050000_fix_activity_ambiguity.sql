-- Fixes get_league_activity, which returned nothing because of the SAME
-- ambiguity that broke create_league_invite earlier today.
--
-- The function's RETURNS TABLE declares an output column named `id`, and
-- plpgsql puts those names in the query's scope. The season subquery said
-- `select id from seasons where league_id = p_league_id`, where `id` could
-- mean the output column or seasons.id — so the row never matched and the
-- feed rendered empty rather than erroring visibly.
--
-- Lesson worth keeping: in a RETURNS TABLE function, qualify EVERY column
-- reference. The output names are not just labels, they are bindings.

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
    -- Read from `weeks` rather than trusting `detail`, so a malformed or
    -- absent detail yields null and the UI says less instead of lying.
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
