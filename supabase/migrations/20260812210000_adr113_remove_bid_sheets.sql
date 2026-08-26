-- bid_sheets IS REMOVED. Nothing reads it, and nothing needs to write it.
--
-- The table was introduced (20260805010000) to answer a question no per-film
-- amount could: has this player NOT GOT ROUND TO IT, or DECIDED NOT TO PLAY?
-- Its own header is explicit that "NO value stored in bids.amount disambiguates
-- it — including zero", and that was true of a table where a player only ever
-- had rows for films they actively bid on.
--
-- ADR-109 changed the premise. Saving a sheet now writes a row for EVERY film
-- on the slate, $0 where the player left it blank, so a saved slate of zeros IS
-- the decision not to play — recorded per film, in the same data as every other
-- decision. What remained was measured before this migration was written:
--
--   * 12 'open' and 705 'closed' sheets on the hosted database, every one with
--     bids behind it — so both states were already derivable as "has any bid
--     row for this week" crossed with the week's own status.
--   * 263 'passed' sheets, every one zero-bid, ALL of them in the replica
--     league. They were never ingested history: pool-replica.mts synthesised
--     them on a coin flip, and the workbooks carry no sat-out signal at all.
--   * No product surface read the table. `sheetStatus` had two consumers, both
--     in the week side panel that ADR-108 deleted; lib/week-board.ts went on
--     fetching it per render for nobody.
--
-- THE THREE RPCs THAT WROTE IT ARE RE-CREATED WITHOUT THAT WRITE, which is the
-- load-bearing half of this migration: place_bid and place_bids both called
-- touch_bid_sheet, and close_week updated the table, so dropping it without
-- redefining them would break bidding outright. Bodies are otherwise VERBATIM
-- from their current definitions (place_bid/place_bids from 20260805010000,
-- close_week from 20260809010000) — this migration removes lines, it does not
-- rewrite behaviour.

-- ---------------------------------------------------------------------------
-- 1. place_bid — 20260805010000's body, minus `perform touch_bid_sheet`.
-- ---------------------------------------------------------------------------
create or replace function public.place_bid(p_film_id uuid, p_amount integer)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_film      films%rowtype;
  v_week      weeks%rowtype;
  v_member    season_members%rowtype;
  v_config    league_settings%rowtype;
  v_remaining integer;
  v_exposure  integer;
  v_bid_id    uuid;
begin
  select * into v_film from films where id = p_film_id;
  if not found then
    raise exception 'film not found';
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the slate';
  end if;
  if not v_film.eligible then
    raise exception 'film is not eligible for bidding in this league';
  end if;

  select * into v_week from weeks where id = v_film.week_id;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member
  from season_members sm
  where sm.season_id = v_week.season_id
    and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  v_config := settings_for_season(v_week.season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;

  -- Zero is legal; anything above zero must clear the minimum.
  if p_amount is null or p_amount < 0 then
    raise exception 'a bid is a whole number of dollars, 0 or more';
  end if;
  if p_amount > 0 and p_amount < v_config.min_bid then
    raise exception 'bid $0, or at least $%', v_config.min_bid;
  end if;

  v_remaining := member_remaining_budget(v_member.id);
  select coalesce(sum(b.amount), 0) into v_exposure
  from bids b
  join films f on f.id = b.film_id
  where b.season_member_id = v_member.id
    and f.week_id = v_week.id
    and f.status = 'active'
    and b.film_id <> p_film_id;

  if v_exposure + p_amount > v_remaining then
    raise exception 'total bids this week ($%) would exceed your remaining budget ($%)',
      v_exposure + p_amount, v_remaining;
  end if;

  insert into bids (film_id, season_member_id, amount)
  values (p_film_id, v_member.id, p_amount)
  on conflict (film_id, season_member_id)
  do update set amount = excluded.amount, updated_at = now()
  returning id into v_bid_id;

  return v_bid_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. place_bids — 20260805010000's body, minus `perform touch_bid_sheet`.
-- ---------------------------------------------------------------------------
create or replace function public.place_bids(p_bids jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_week            weeks%rowtype;
  v_member          season_members%rowtype;
  v_config          league_settings%rowtype;
  v_remaining       integer;
  v_basket_total    integer;
  v_other_exposure  integer;
  v_n               integer;
  v_distinct        integer;
  v_matched         integer;
  v_week_count      integer;
  v_count           integer;
  v_bad_title       text;
begin
  if p_bids is null
     or jsonb_typeof(p_bids) <> 'array'
     or jsonb_array_length(p_bids) = 0 then
    raise exception 'no bids submitted';
  end if;

  select count(*), count(distinct x.film_id)
    into v_n, v_distinct
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer);
  if v_n <> v_distinct then
    raise exception 'the same film appears more than once in this submission';
  end if;

  select count(f.id), count(distinct f.week_id)
    into v_matched, v_week_count
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id;
  if v_matched <> v_n then
    raise exception 'one or more films in this submission no longer exist';
  end if;
  if v_week_count <> 1 then
    raise exception 'all bids in one submission must be for the same release week';
  end if;

  select w.* into v_week
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  join weeks w on w.id = f.week_id
  limit 1;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member
  from season_members sm
  where sm.season_id = v_week.season_id
    and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  v_config := settings_for_season(v_week.season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where f.status <> 'active'
  limit 1;
  if v_bad_title is not null then
    raise exception '"%" has been removed from the slate', v_bad_title;
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where not f.eligible
  limit 1;
  if v_bad_title is not null then
    raise exception '"%" is not eligible for bidding in this league', v_bad_title;
  end if;

  -- Zero is legal; anything above zero must clear the minimum.
  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where x.amount is null or x.amount < 0
  limit 1;
  if v_bad_title is not null then
    raise exception 'bid on "%" must be a whole number of dollars, 0 or more', v_bad_title;
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where x.amount > 0 and x.amount < v_config.min_bid
  limit 1;
  if v_bad_title is not null then
    raise exception 'bid $0 on "%", or at least $%', v_bad_title, v_config.min_bid;
  end if;

  v_remaining := member_remaining_budget(v_member.id);
  select coalesce(sum(x.amount), 0) into v_basket_total
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer);
  select coalesce(sum(b.amount), 0) into v_other_exposure
  from bids b
  join films f on f.id = b.film_id
  where b.season_member_id = v_member.id
    and f.week_id = v_week.id
    and f.status = 'active'
    and b.film_id not in (
      select x.film_id from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
    );
  if v_basket_total + v_other_exposure > v_remaining then
    raise exception 'these bids total $%, but only $% of your budget is uncommitted',
      v_basket_total, v_remaining - v_other_exposure;
  end if;

  insert into bids (film_id, season_member_id, amount)
  select x.film_id, v_member.id, x.amount
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  on conflict (film_id, season_member_id)
  do update set amount = excluded.amount, updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. close_week — 20260809010000's body, minus the sheet close and the
--    `sheets_closed` audit field that reported it.
-- ---------------------------------------------------------------------------
create or replace function public.close_week(p_week_id uuid, p_auto boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_top_n   integer;
  v_winners integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if p_auto then
    -- The automation identity is the ABSENCE of a user, not a flag. A JWT
    -- caller claiming p_auto is lying and gets the commissioner's answer.
    if auth.uid() is not null then
      raise exception 'only the commissioner can close bidding';
    end if;
    if v_week.bid_deadline is null or now() < v_week.bid_deadline then
      raise exception 'week is not yet due to close';
    end if;
  elsif not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can close bidding';
  end if;
  if v_week.status <> 'open' then
    raise exception 'week is not open for bidding';
  end if;

  select (settings_for_season(v_week.season_id)).top_n_distinct into v_top_n;
  if v_top_n is null then
    raise exception 'season has no settings row — cannot decide winners';
  end if;

  -- A ZERO NEVER WINS. `b.amount > 0` is the load-bearing half; excluding
  -- zeros from the distinct list too is belt-and-braces, and the reasoning is
  -- worth keeping so nobody "simplifies" it away: zero sorts last descending,
  -- so it can only occupy one of the N slots when there are fewer than N
  -- distinct real amounts — where it displaces nothing. Filtered anyway,
  -- because that argument is subtle.
  --
  -- This matters MORE since ADR-109, not less: saving a slate now writes a $0
  -- row for every film the player left blank, so most bids on a busy week are
  -- zeros and this filter is what keeps them out of the tiers.
  --
  -- NOTE what is deliberately NOT here: any re-check against min_bid. min_bid
  -- is mutable mid-season, so testing it at resolution would retroactively void
  -- a bid that was legal when placed and silently change who owned what.
  update bids b
  set is_winning = (
    f.eligible
    and b.amount > 0
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = b.film_id
        and b2.amount > 0
      order by b2.amount desc
      limit v_top_n
    )
  )
  from films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and f.status = 'active';

  update weeks set status = 'closed' where id = p_week_id;

  select count(*) into v_winners
  from bids b
  join films f on f.id = b.film_id
  where f.week_id = p_week_id
    and b.is_winning;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, case when p_auto then null else auth.uid() end,
          'close_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'automatic', p_auto,
                             'top_n_distinct', v_top_n,
                             'winning_bids', v_winners));

  perform open_due_weeks(v_week.season_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The drops. Functions first — pass_week and resume_bidding reference the
--    table, and touch_bid_sheet is nothing but a write to it.
-- ---------------------------------------------------------------------------
drop function if exists public.pass_week(uuid);
drop function if exists public.resume_bidding(uuid);
drop function if exists public.touch_bid_sheet(uuid, uuid);

-- The policy and grants go with the table; the enum has no other user.
drop table if exists public.bid_sheets;
drop type if exists public.bid_sheet_status;
