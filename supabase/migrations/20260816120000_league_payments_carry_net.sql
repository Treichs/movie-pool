-- ---------------------------------------------------------------------------
-- The league Payments page becomes the place payments are RECORDED, not just
-- read (the payouts/payments layer split, 2026-08-16): the season layer says
-- what each player won or owes for that season, the league layer tracks the
-- money actually moving. Recording a payment needs the amount being settled,
-- and the all-time balance rollup needs each member's season net — neither of
-- which this read carried. It listed only what someone DID about a debt
-- (status/amount of the recorded payment), never the debt itself.
--
-- So the read gains `net`: the member's line from the FINAL settlement. Left
-- join, because a member enrolled after the roster locked has no line — their
-- net is null and the page shows them as a bystander rather than as $0.
--
-- Drop-then-create, as both predecessors: RETURNS TABLE gaining a column is a
-- shape change and `create or replace` raises 42P13.
-- ---------------------------------------------------------------------------
drop function if exists public.get_league_payments(uuid);

create function public.get_league_payments(p_league_id uuid)
returns table (
  season_id        uuid,
  season_name      text,
  season_member_id uuid,
  profile_id       uuid,
  display_name     text,
  net              integer,
  status           text,
  amount           integer,
  recorded_at      timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not is_league_member(p_league_id) then
    raise exception 'not a member of this league';
  end if;

  return query
  select
    s.id,
    s.name,
    sm.id,
    sm.profile_id,
    p.display_name,
    sl.net,
    sp.status::text,
    sp.amount,
    sp.recorded_at
  from seasons s
  join settlements st on st.season_id = s.id and st.status = 'final'
  join season_members sm on sm.season_id = s.id
  join profiles p on p.id = sm.profile_id
  left join settlement_lines sl
    on sl.settlement_id = st.id and sl.season_member_id = sm.id
  left join settlement_payments sp on sp.season_member_id = sm.id
  where s.league_id = p_league_id
  order by s.created_at desc, p.display_name;
end;
$$;

revoke all on function public.get_league_payments(uuid) from public, anon;
grant execute on function public.get_league_payments(uuid) to authenticated;

comment on function public.get_league_payments(uuid) is
  'Every finalized season of a league and who is square in it. Carries '
  'profile_id (ADR-082) and, since the payouts/payments split, the member''s '
  'settlement net — the debt the payment record is about.';
