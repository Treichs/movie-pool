-- A PLAYER'S WEEK IS ONE THING, AND $0 IS A LEGAL WAY TO SAY NOTHING.
--
-- Three changes, and they belong together because each is half of the same
-- idea: what a player does in a week is a single act with a state, not a
-- scattering of independent per-film rows.
--
-- 1. A BID SHEET — one row per (week, member), carrying a STATE.
--
--    The state is the whole point. A missing amount on a film is ambiguous: it
--    could mean "I passed on this one", "I have not finished", or "I never
--    opened the page", and NO value stored in bids.amount disambiguates it —
--    including zero. The question is about the player's whole week, so the
--    answer lives at the level of the week.
--
--      (no row)  — has not bid yet. Never opened the sheet.
--      open      — has a sheet and can still change it.
--      passed    — CHOSE not to bid this week. Terminal, and deliberately
--                  survives the close, because "sat this one out" is a fact
--                  worth still being able to see afterwards.
--      closed    — the deadline closed it. Whatever was in it counts.
--
--    NO FOREIGN KEY ON bids, and adding one would be a mistake. A bid's film
--    belongs to a week and the member is already on the row, so (week, member)
--    is functionally determined by every bid that exists. The sheet is
--    DERIVABLE, not referential — so bids is not migrated, gains no column, and
--    there is no denormalised link to keep in sync. It also lets a sheet exist
--    with no bids at all, which is exactly what `passed` IS.
--
-- 2. $0 IS A LEGAL BID THAT NEVER WINS.
--
--    Validity: `amount = 0 OR amount >= min_bid`. Zero means "in for nothing";
--    put money in and it must clear the season's minimum. A $3 bid in a
--    $5-minimum season stays illegal, which is the point of a minimum.
--
--    Resolution: a zero never wins, so a bankrupt player stays in the game
--    without being able to accrue points for free.
--
--    The table CHECK cannot express the real rule — min_bid lives in
--    season_settings and a CHECK cannot read another table — so it relaxes to
--    `>= 0` and the RPCs carry it.
--
-- 3. PARTICIPATION IS SEALED until the week closes.
--
--    ADR-022 sealed AMOUNTS but deliberately kept participation public as the
--    "who's in play" signal. That is withdrawn: seeing who has bid, even
--    without amounts, is a strategic signal sealed bidding exists to prevent.
--    This is the third tightening of the same rule (ADR-006 → ADR-022 → here).

-- ---------------------------------------------------------------------------
-- 1. The sheet.
-- ---------------------------------------------------------------------------
create type public.bid_sheet_status as enum ('open', 'passed', 'closed');

create table public.bid_sheets (
  id               uuid primary key default gen_random_uuid(),
  week_id          uuid not null references public.weeks (id) on delete cascade,
  season_member_id uuid not null references public.season_members (id) on delete cascade,
  status           public.bid_sheet_status not null default 'open',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (week_id, season_member_id)
);

create index bid_sheets_week_idx on public.bid_sheets (week_id);

alter table public.bid_sheets enable row level security;

-- YOUR OWN SHEET, ALWAYS. Everyone else's only once the week has closed.
--
-- The second half is the seal. A sheet's state says whether you have bid, are
-- still deciding, or have passed — which is precisely the participation signal
-- being withdrawn, so it stays private for exactly as long as amounts do. The
-- predicate is deliberately the same shape as bids_select's, so the two cannot
-- drift into disagreeing about when a week is readable.
create policy bid_sheets_select on public.bid_sheets
  for select to authenticated
  using (
    public.is_own_member(season_member_id)
    or exists (
      select 1 from public.weeks w
      where w.id = bid_sheets.week_id
        and w.status in ('closed', 'final')
        and public.is_season_member(w.season_id)
    )
  );

-- No insert/update/delete policies: every write goes through the RPCs below,
-- which is the ADR-004 architecture and what stops a player forging a state.

-- ---------------------------------------------------------------------------
-- 2. $0 becomes storable.
-- ---------------------------------------------------------------------------
alter table public.bids drop constraint if exists bids_amount_check;
alter table public.bids add constraint bids_amount_check check (amount >= 0);

comment on column public.bids.amount is
  'Whole dollars. 0 is legal and means "in for nothing" — it is recorded, but '
  'never wins. Any non-zero amount must clear the season''s min_bid, which is '
  'enforced in place_bid/place_bids because a CHECK cannot read season_settings.';

-- ---------------------------------------------------------------------------
-- 3. Sheet helpers.
-- ---------------------------------------------------------------------------

-- Internal: make sure the caller has an OPEN sheet for this week. Called by the
-- bid paths, so that bidding is itself the act that opens a sheet — a player
-- should never have to create one explicitly, and a bid arriving on a `passed`
-- sheet is a change of mind rather than an error.
create or replace function public.touch_bid_sheet(
  p_week_id uuid,
  p_member_id uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into bid_sheets (week_id, season_member_id, status)
  values (p_week_id, p_member_id, 'open')
  on conflict (week_id, season_member_id) do update
    set status = case when bid_sheets.status = 'closed'
                      then bid_sheets.status   -- a closed week is not reopened here
                      else 'open' end,
        updated_at = now();
end;
$$;

-- Say out loud that you are sitting this week out.
--
-- Clears any bids you had placed for the week, because "passed" and "still has
-- bids" cannot both be true and refusing would strand a player who changed
-- their mind. Reversible with resume_bidding while the week is still open.
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

-- Change your mind while the week is still open.
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

-- ---------------------------------------------------------------------------
-- 4. place_bid — from pg_get_functiondef, with the zero exemption and the
--    sheet touch. Everything else is the shipped body.
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

  -- CHANGED: zero is legal; anything above zero must clear the minimum.
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

  perform touch_bid_sheet(v_week.id, v_member.id);

  return v_bid_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. place_bids — same two changes, same shipped body otherwise.
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

  -- CHANGED: zero is legal; anything above zero must clear the minimum.
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

  -- Submitting a basket IS opening a sheet. A player never creates one by hand.
  perform touch_bid_sheet(v_week.id, v_member.id);

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. close_week — from 20260804240000, with TWO additions.
--
--    A zero never wins, and every still-open sheet closes with the week.
--    "Closing submits" is the rule: whatever was in an open sheet counts, so
--    nobody loses a bid by not pressing a button. A `passed` sheet is left
--    alone — it is terminal, and the fact that someone sat the week out should
--    survive the close rather than being overwritten by it.
-- ---------------------------------------------------------------------------
create or replace function public.close_week(p_week_id uuid, p_auto boolean default false)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_top_n   integer;
  v_winners integer;
  v_sheets  integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not p_auto and not is_commissioner(v_week.season_id) then
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

  -- Every open sheet closes with the week; `passed` is terminal and survives.
  update bid_sheets set status = 'closed', updated_at = now()
  where week_id = p_week_id and status = 'open';
  get diagnostics v_sheets = row_count;

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
                             'winning_bids', v_winners,
                             'sheets_closed', v_sheets));

  perform open_due_weeks(v_week.season_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. override_bid_amount re-resolves ONE film, so it carries the same zero
--    rule. Redeclared from 20260804240000 with that one change.
-- ---------------------------------------------------------------------------
create or replace function public.override_bid_amount(
  p_bid_id uuid,
  p_amount integer,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_bid       bids%rowtype;
  v_film      films%rowtype;
  v_week      weeks%rowtype;
  v_config    league_settings%rowtype;
  v_old       integer;
  v_remaining integer;
  v_member    season_members%rowtype;
begin
  select * into v_bid from bids where id = p_bid_id for update;
  if not found then
    raise exception 'bid not found';
  end if;

  select * into v_film from films where id = v_bid.film_id for update;
  select * into v_week from weeks where id = v_film.week_id for update;

  if not is_commissioner(v_week.season_id) then
    raise exception 'only a commissioner can correct a bid';
  end if;

  if v_week.status not in ('closed', 'final') then
    raise exception
      'bids can only be corrected after the week closes and amounts are revealed (status: %)',
      v_week.status;
  end if;

  if v_film.status <> 'active' then
    raise exception 'this film was removed from the slate — its bids are already refunded';
  end if;

  v_config := settings_for_season(v_week.season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'a bid is a whole number of dollars, 0 or more';
  end if;
  if p_amount > 0 and p_amount < v_config.min_bid then
    raise exception 'correct to $0, or to at least $%', v_config.min_bid;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'give a reason for the correction (players are told one was made)';
  end if;

  v_old := v_bid.amount;
  if v_old = p_amount then
    return;
  end if;

  update bids set amount = p_amount, updated_at = now() where id = p_bid_id;

  update bids b
  set is_winning = (
    v_film.eligible
    and b.amount > 0
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = v_film.id
        and b2.amount > 0
      order by b2.amount desc
      limit v_config.top_n_distinct
    )
  )
  where b.film_id = v_film.id;

  select * into v_member from season_members where id = v_bid.season_member_id;
  v_remaining := member_remaining_budget(v_bid.season_member_id);

  if v_remaining < 0 then
    raise exception
      'that correction puts the player $% over their $% bankroll',
      -v_remaining, v_config.fake_bankroll;
  end if;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'override_bid_amount',
          jsonb_build_object(
            'week_id', v_week.id, 'week_number', v_week.number,
            'week_status', v_week.status,
            'film_id', v_film.id, 'title', v_film.title,
            'season_member_id', v_bid.season_member_id,
            'profile_id', v_member.profile_id,
            'old', v_old, 'new', p_amount,
            'reason', trim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. THE SEAL. get_week_bidders existed only to publish participation during
--    an open week, and that signal is withdrawn — so the function goes rather
--    than being left ungranted. An exposed RPC nobody calls is still an
--    endpoint; a dropped one cannot be re-granted by accident.
-- ---------------------------------------------------------------------------
drop function if exists public.get_week_bidders(uuid);

-- ---------------------------------------------------------------------------
-- 9. Grants. touch_bid_sheet is internal — called by SECURITY DEFINER
--    functions that have already authorized the caller — so no role gets it.
-- ---------------------------------------------------------------------------
revoke all on function public.touch_bid_sheet(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pass_week(uuid)       from public, anon;
revoke all on function public.resume_bidding(uuid)  from public, anon;
grant execute on function public.pass_week(uuid)      to authenticated;
grant execute on function public.resume_bidding(uuid) to authenticated;
