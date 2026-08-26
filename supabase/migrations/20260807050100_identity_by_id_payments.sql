-- ---------------------------------------------------------------------------
-- ADR-082, the seventh read path: get_league_payments.
--
-- Split from 20260807050000 only because it was found after that one was
-- applied; it is the same change for the same reason. The league payments
-- table lists who is square in every finalized season, and it had nothing but
-- a display_name to name them with — so on a name collision it shows one
-- person's settlement twice and the other's not at all, with no way for either
-- to tell which line is theirs.
--
-- Drop-then-create, as before: RETURNS TABLE gaining a column is a shape change
-- and `create or replace` raises 42P13.
-- ---------------------------------------------------------------------------
drop function if exists public.get_league_payments(uuid);

create function public.get_league_payments(p_league_id uuid)
returns table (
  season_id        uuid,
  season_name      text,
  season_member_id uuid,
  profile_id       uuid,
  display_name     text,
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
    sp.status::text,
    sp.amount,
    sp.recorded_at
  from seasons s
  join settlements st on st.season_id = s.id and st.status = 'final'
  join season_members sm on sm.season_id = s.id
  join profiles p on p.id = sm.profile_id
  left join settlement_payments sp on sp.season_member_id = sm.id
  where s.league_id = p_league_id
  order by s.created_at desc, p.display_name;
end;
$$;

revoke all on function public.get_league_payments(uuid) from public, anon;
grant execute on function public.get_league_payments(uuid) to authenticated;

comment on function public.get_league_payments(uuid) is
  'Every finalized season of a league and who is square in it. Carries '
  'profile_id as of ADR-082 — a payment line must name an account.';
