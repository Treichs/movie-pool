-- ---------------------------------------------------------------------------
-- peek_league_invite tells you what you are joining.
--
-- WHY. Board 4.9 draws four facts on the join screen — how many members, the
-- season bankroll, the number of winning tiers, and whether joining puts you in
-- the season already running. None of them was reachable. `leagues`,
-- `league_members`, `seasons` and `season_settings` all gate SELECT on
-- `is_league_member` / `is_season_member`, so a person holding an invitation —
-- who is by definition not yet a member — can read nothing at all. This
-- function is the one SECURITY DEFINER window through that wall, and it was
-- returning the league's name and three flags.
--
-- So the screen asked "will you join?" while refusing to say what. The four
-- facts are exactly what answers it.
--
-- WHAT IS DELIBERATELY NOT ADDED. The board also draws the members' avatars.
-- That is a roster — names and faces of people who have not agreed to be shown
-- to whoever holds a link — and it is not needed to answer the question. A
-- count is.
--
-- `drop` then `create`, not `create or replace`: Postgres refuses to replace a
-- function whose OUT parameters change, and this adds four.
--
-- THE SEASON IT REPORTS IS THE ONE YOU WOULD JOIN, chosen by the same rule
-- `accept_league_invite` uses — the newest ACTIVE season — so the numbers on
-- the screen are the numbers you get. A league between seasons has none, and
-- every season field comes back null rather than zero: nothing is a more honest
-- answer than a bankroll of $0.
-- ---------------------------------------------------------------------------

drop function if exists public.peek_league_invite(text);

create function public.peek_league_invite(p_token text)
returns table (
  league_name          text,
  already_member       boolean,
  expired              boolean,
  targeted_at          text,
  member_count         integer,
  bankroll             integer,
  winning_tiers        integer,
  joins_current_season boolean
)
language plpgsql security definer set search_path = public
as $$
declare
  v_invite   league_invites%rowtype;
  v_league   leagues%rowtype;
  v_season   seasons%rowtype;
  v_settings season_settings%rowtype;
  v_joins    boolean := false;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into v_invite from league_invites where token = p_token;
  if not found then
    raise exception 'that invitation link is not valid';
  end if;
  select * into v_league from leagues where id = v_invite.league_id;

  -- The same season accept_league_invite would put you in.
  select * into v_season from seasons
  where league_id = v_invite.league_id and status = 'active'
  order by created_at desc
  limit 1;

  if found then
    select * into v_settings from season_settings where season_id = v_season.id;
    -- Joining a season still being filled puts you in it; once a week has
    -- opened you play from the next one. Same rule, same function.
    v_joins := not season_bidding_has_begun(v_season.id);
  end if;

  return query select
    v_league.name,
    exists (
      select 1 from league_members
      where league_id = v_invite.league_id and profile_id = auth.uid()
    ),
    (v_invite.expires_at < now() or v_invite.accepted_at is not null),
    v_invite.email,
    (select count(*)::integer from league_members
      where league_id = v_invite.league_id),
    v_settings.fake_bankroll,
    v_settings.top_n_distinct,
    case when v_season.id is null then null else v_joins end;
end;
$$;

revoke all on function public.peek_league_invite(text) from public, anon;
grant execute on function public.peek_league_invite(text) to authenticated;
