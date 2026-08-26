-- get_week_overrides: "column reference \"id\" is ambiguous".
--
-- The THIRD time this family of functions has hit the same trap — 20260802050000
-- and 20260802060000 were both this, on get_league_activity. The shape is
-- always the same and always invisible to a migration test, because the
-- function CREATES fine and only fails when it runs:
--
--   returns table (id bigint, ...)      <- declares an OUT parameter named `id`
--   ...
--   select * into v_week from weeks where id = p_week_id;   <- which `id`?
--
-- plpgsql resolves an unqualified name against OUT parameters as well as
-- against the table in scope, and refuses when both match. The lookup is not
-- even part of the query that returns `id`; it just shares the name.
--
-- Fixed by qualifying the column. Renaming the OUT parameter would also work
-- and is the wrong fix — `id` is the right name for the field callers read,
-- and the next function to declare one would hit this again.
--
-- The lesson worth keeping: any SECURITY DEFINER function that both RETURNS
-- TABLE and does a `select ... into` needs every column reference in the body
-- qualified, not just the ones inside the returning query.
--
-- ---------------------------------------------------------------------------
-- AND A SECOND BUG, which the first was hiding.
--
-- `id` was declared `uuid`, but it returns `audit_log.id`, which is a bigint
-- identity column. plpgsql does not check a RETURN QUERY's column types
-- against the OUT parameters until the query RUNS, so this passed `create
-- function` cleanly and would have failed on first call — except the
-- ambiguity error above fired first and masked it. Two runtime-only faults
-- stacked in one function is a good argument for the rule this migration's
-- header states.
--
-- DROPPED and recreated rather than replaced: Postgres refuses to change a
-- function's OUT-parameter row type in place, which is the same error the
-- first attempt at 20260803040000 hit on get_league_activity.
-- ---------------------------------------------------------------------------
drop function if exists public.get_week_overrides(uuid);

create or replace function public.get_week_overrides(p_week_id uuid)
returns table (
  id         bigint,
  action     text,
  at         timestamptz,
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

-- The drop took the grants with it.
revoke all on function public.get_week_overrides(uuid) from public, anon;
grant execute on function public.get_week_overrides(uuid) to authenticated;
