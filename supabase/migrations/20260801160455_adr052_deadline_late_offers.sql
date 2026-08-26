-- ============================================================================
-- ADR-052 — the bid deadline becomes enforcing, with a sealed late-offer
-- window; weeks auto-open on a league-configured schedule.
--
-- Supersedes ADR-003's advisory-deadline stance. Rulebook §4 + OQ-3 were
-- updated FIRST (2026-08-02) — this migration implements them.
--
-- The design in one paragraph: enforcement is per-season, gated on the new
-- rule_configs.bidding_automation flag (ships OFF, so no in-flight season
-- changes behavior on migration day — OQ-3 records that carve-out). Where it
-- is ON and a week has a deadline, place_bid/place_bids stop accepting
-- standard bids at that deadline; a NEW bid after it is held as a sealed LATE
-- OFFER (bids.late = true) that joins the week only when the commissioner
-- accepts it, and the acceptance window closes forever at close_week — the
-- reveal (ADR-022) — when pending offers are auto-declined. The commissioner
-- reviews offers through get_late_offers, which never returns amounts: the
-- ADR-022 seal holds through the entire late window.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema: the late flag + the automation config.
-- ---------------------------------------------------------------------------
alter table public.bids
  add column late boolean not null default false;

comment on column public.bids.late is
  'ADR-052: a sealed late offer — placed after the deadline, part of the week '
  'only once the commissioner accepts (late flips false). Pending offers are '
  'deleted at close_week. Never included in winner resolution or who''s-in.';

alter table public.rule_configs
  add column bidding_automation boolean not null default false,
  add column auto_open_dow      integer not null default 1
    check (auto_open_dow between 1 and 7),
  add column auto_open_time     time    not null default '09:00',
  add column auto_close_dow     integer not null default 4
    check (auto_close_dow between 1 and 7),
  add column auto_close_time    time    not null default '12:00',
  add column automation_tz      text    not null default 'America/New_York';

comment on column public.rule_configs.bidding_automation is
  'ADR-052 master switch: deadline enforcement + late offers + auto-open + '
  'default deadlines. OFF preserves the pre-ADR-052 advisory behavior '
  '(rulebook OQ-3 carve-out), so existing seasons are unchanged until a '
  'commissioner opts in.';

-- ---------------------------------------------------------------------------
-- 2. handle_new_user: prefer Google's full_name before the email localpart,
--    so an OAuth signup never renders as "chris.t" on a leaderboard.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The deadline branch in place_bid (single).
-- ---------------------------------------------------------------------------
create or replace function public.place_bid(
  p_film_id uuid,
  p_amount  integer
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_film      films%rowtype;
  v_week      weeks%rowtype;
  v_member    season_members%rowtype;
  v_config    rule_configs%rowtype;
  v_remaining integer;
  v_exposure  integer;
  v_bid_id    uuid;
  v_existing  bids%rowtype;
  v_late      boolean;
begin
  select * into v_film from films where id = p_film_id;
  if not found then
    raise exception 'film not found';
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the slate';
  end if;
  if not v_film.eligible then
    raise exception 'film is not eligible for bidding (under the screen threshold)';
  end if;

  select * into v_week from weeks where id = v_film.week_id;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;

  select sm.* into v_member
  from season_members sm
  where sm.season_id = v_week.season_id
    and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  select * into v_config from rule_configs where season_id = v_week.season_id;
  if not found then
    raise exception 'season has no rule configuration';
  end if;

  if p_amount is null or p_amount < v_config.min_bid then
    raise exception 'bid must be at least $%', v_config.min_bid;
  end if;

  -- ADR-052: past the deadline (enforced only under the automation flag),
  -- an existing standard bid STANDS and a new bid becomes a sealed offer.
  v_late := v_config.bidding_automation
    and v_week.bid_deadline is not null
    and now() > v_week.bid_deadline;

  select * into v_existing
  from bids
  where film_id = p_film_id and season_member_id = v_member.id;

  if v_late and found and not v_existing.late and v_existing.amount <> p_amount then
    raise exception 'the deadline has passed — your earlier bid stands';
  end if;

  -- Exposure includes pending late offers on purpose: an accepted offer must
  -- never be able to overdraw the bankroll it was checked against.
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

  insert into bids (film_id, season_member_id, amount, late)
  values (p_film_id, v_member.id, p_amount, v_late)
  on conflict (film_id, season_member_id)
  do update set
    amount     = excluded.amount,
    -- An open-window write refreshes a bid to standard; a late write can only
    -- reach here when it targets the member's own still-pending offer.
    late       = case when bids.late then excluded.late else false end,
    updated_at = now()
  returning id into v_bid_id;

  return v_bid_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The deadline branch in place_bids (batch). The UI always submits the
--    full displayed basket (merge==replace, session-6 note), so after the
--    deadline the batch must let UNCHANGED standard bids flow through as
--    no-ops, hold NEW films as late offers, and reject only actual edits.
-- ---------------------------------------------------------------------------
create or replace function public.place_bids(p_bids jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_week            weeks%rowtype;
  v_member          season_members%rowtype;
  v_config          rule_configs%rowtype;
  v_remaining       integer;
  v_basket_total    integer;
  v_other_exposure  integer;
  v_n               integer;
  v_distinct        integer;
  v_matched         integer;
  v_week_count      integer;
  v_count           integer;
  v_bad_title       text;
  v_late            boolean;
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

  select sm.* into v_member
  from season_members sm
  where sm.season_id = v_week.season_id
    and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  select * into v_config from rule_configs where season_id = v_week.season_id;
  if not found then
    raise exception 'season has no rule configuration';
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
    raise exception '"%" is not eligible for bidding (under the screen threshold)', v_bad_title;
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where x.amount is null or x.amount < v_config.min_bid
  limit 1;
  if v_bad_title is not null then
    raise exception 'bid on "%" must be at least $%', v_bad_title, v_config.min_bid;
  end if;

  v_late := v_config.bidding_automation
    and v_week.bid_deadline is not null
    and now() > v_week.bid_deadline;

  -- ADR-052: an EDIT to a standard bid after the deadline is the one thing
  -- the batch refuses. Unchanged rows are no-ops; new films become offers.
  if v_late then
    select f.title into v_bad_title
    from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
    join films f on f.id = x.film_id
    join bids b on b.film_id = x.film_id and b.season_member_id = v_member.id
    where not b.late and b.amount <> x.amount
    limit 1;
    if v_bad_title is not null then
      raise exception 'the deadline has passed — your bid on "%" stands', v_bad_title;
    end if;
  end if;

  -- ADR-001 sum-exposure over the whole basket plus untouched bids.
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

  insert into bids (film_id, season_member_id, amount, late)
  select x.film_id, v_member.id, x.amount, v_late
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  on conflict (film_id, season_member_id)
  do update set
    amount     = excluded.amount,
    late       = case when bids.late then excluded.late else false end,
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Pending offers stay OUT of the who's-in signal: a bidder who might be
--    declined must not shape anyone's read of the market.
-- ---------------------------------------------------------------------------
create or replace function public.get_week_bidders(p_week_id uuid)
returns table (
  film_id          uuid,
  season_member_id uuid,
  display_name     text
)
language sql stable security definer set search_path = public
as $$
  select
    b.film_id,
    b.season_member_id,
    pr.display_name
  from bids b
  join films f          on f.id  = b.film_id
  join weeks w          on w.id  = f.week_id
  join season_members sm on sm.id = b.season_member_id
  join profiles pr      on pr.id = sm.profile_id
  where f.week_id = p_week_id
    and not b.late  -- ADR-052: pending offers are invisible until accepted
    and public.is_season_member(w.season_id)
$$;

-- ---------------------------------------------------------------------------
-- 6. The commissioner's review surface. NO amount column exists in the
--    return type — the ADR-022 seal survives the late window by construction,
--    exactly the get_week_bidders precedent.
-- ---------------------------------------------------------------------------
create or replace function public.get_late_offers(p_week_id uuid)
returns table (
  bid_id           uuid,
  film_id          uuid,
  film_title       text,
  season_member_id uuid,
  display_name     text,
  offered_at       timestamptz
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.film_id, f.title, b.season_member_id, pr.display_name, b.created_at
  from bids b
  join films f           on f.id  = b.film_id
  join weeks w           on w.id  = f.week_id
  join season_members sm on sm.id = b.season_member_id
  join profiles pr       on pr.id = sm.profile_id
  where f.week_id = p_week_id
    and b.late
    and public.is_commissioner(w.season_id)
  order by b.created_at
$$;

create or replace function public.review_late_offer(
  p_bid_id uuid,
  p_accept boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_bid       bids%rowtype;
  v_week      weeks%rowtype;
  v_remaining integer;
  v_exposure  integer;
begin
  select b.* into v_bid from bids b where b.id = p_bid_id for update;
  if not found then
    raise exception 'offer not found';
  end if;
  if not v_bid.late then
    raise exception 'this bid is not a pending late offer';
  end if;

  select w.* into v_week
  from weeks w join films f on f.week_id = w.id
  where f.id = v_bid.film_id;

  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can review late offers';
  end if;
  -- The window closes at the reveal, physically: after locked the amounts
  -- are public and acceptance would be a bid placed with open eyes.
  if v_week.status <> 'open' then
    raise exception 'bids are released — the late-offer window is closed';
  end if;

  if p_accept then
    -- Re-check exposure at acceptance: submission already gated it, but
    -- another week may have resolved since and shrunk the bankroll.
    v_remaining := member_remaining_budget(v_bid.season_member_id);
    select coalesce(sum(b.amount), 0) into v_exposure
    from bids b
    join films f on f.id = b.film_id
    where b.season_member_id = v_bid.season_member_id
      and f.week_id = v_week.id
      and f.status = 'active'
      and b.id <> v_bid.id;
    if v_exposure + v_bid.amount > v_remaining then
      raise exception 'accepting would overdraw the player''s remaining budget — decline it';
    end if;

    update bids set late = false, updated_at = now() where id = p_bid_id;
  else
    delete from bids where id = p_bid_id;
  end if;

  -- The audit row names the act and the people, never the amount: audit_log
  -- carries lifecycle events only (League-page feed design, 2026-07-17).
  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(),
          case when p_accept then 'accept_late_offer' else 'decline_late_offer' end,
          jsonb_build_object('week_id', v_week.id, 'week_number', v_week.number,
                             'film_id', v_bid.film_id,
                             'season_member_id', v_bid.season_member_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. close_week: the reveal now auto-declines whatever is still pending,
--    BEFORE the status flip makes amounts readable.
-- ---------------------------------------------------------------------------
create or replace function public.close_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_pending integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can close bidding';
  end if;
  if v_week.status <> 'open' then
    raise exception 'week is not open for bidding';
  end if;

  delete from bids b
  using films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and b.late;
  get diagnostics v_pending = row_count;

  update weeks set status = 'locked' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'close_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'declined_pending_offers', v_pending));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. create_week: under automation, a week born without a deadline gets the
--    configured one (close dow/time in the league's zone, inside the week —
--    which is exactly what the ADR-042 trigger then re-asserts).
-- ---------------------------------------------------------------------------
create or replace function public.create_week(
  p_season_id    uuid,
  p_number       integer,
  p_opening_date date,
  p_bid_deadline timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_week_id  uuid;
  v_config   rule_configs%rowtype;
  v_deadline timestamptz := p_bid_deadline;
  v_week_of  date;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can create weeks';
  end if;
  if p_number is null or p_number < 1 then
    raise exception 'week number must be 1 or higher';
  end if;
  if p_opening_date is null then
    raise exception 'week needs an opening date';
  end if;
  if exists (select 1 from weeks where season_id = p_season_id and number = p_number) then
    raise exception 'week % already exists in this season', p_number;
  end if;

  select * into v_config from rule_configs where season_id = p_season_id;
  if v_deadline is null and v_config.bidding_automation then
    v_week_of  := p_opening_date - (extract(isodow from p_opening_date)::int - 1);
    v_deadline := ((v_week_of + (v_config.auto_close_dow - 1))::timestamp
                   + v_config.auto_close_time)
                  at time zone v_config.automation_tz;
  end if;

  insert into weeks (season_id, number, opening_date, bid_deadline)
  values (p_season_id, p_number, p_opening_date, v_deadline)
  returning id into v_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'create_week',
          jsonb_build_object('week_id', v_week_id, 'week_number', p_number,
                             'opening_date', p_opening_date,
                             'bid_deadline', v_deadline,
                             'deadline_defaulted', p_bid_deadline is null and v_deadline is not null));

  return v_week_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. resolve_week: late offers can no longer exist at resolution (close_week
--    purged them), but the flag joins the winner predicate anyway — a belt
--    for the service-role writes the RPCs never see.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_week(p_week_id uuid)
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
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can resolve winners';
  end if;
  if v_week.status <> 'locked' then
    raise exception 'close bidding before resolving winners (status: %)', v_week.status;
  end if;

  select top_n_distinct into v_top_n
  from rule_configs where season_id = v_week.season_id;
  if v_top_n is null then
    raise exception 'season has no rule configuration';
  end if;

  update bids b
  set is_winning = (
    f.eligible
    and not b.late
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = b.film_id
        and not b2.late
      order by b2.amount desc
      limit v_top_n
    )
  )
  from films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and f.status = 'active';

  update weeks set status = 'resolved' where id = p_week_id;

  select count(*) into v_winners
  from bids b
  join films f on f.id = b.film_id
  where f.week_id = p_week_id
    and b.is_winning;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'resolve_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'top_n_distinct', v_top_n, 'winning_bids', v_winners));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. update_rule_config grows the automation parameters. Same drop-and-recreate
--     dance as phase 11: the signature changes, so the old grant dies with it.
-- ---------------------------------------------------------------------------
drop function if exists public.update_rule_config(
  uuid, integer, integer, integer, integer, text, text, boolean,
  public.weekday_start, integer, jsonb);

create or replace function public.update_rule_config(
  p_season_id             uuid,
  p_fake_bankroll         integer,
  p_screen_threshold      integer,
  p_top_n_distinct        integer,
  p_min_bid               integer,
  p_capture_timing        text,
  p_bid_deadline_default  text,
  p_include_previews      boolean,
  p_preview_start_weekday public.weekday_start,
  p_buy_in                integer,
  p_payout_structure      jsonb,
  p_bidding_automation    boolean default false,
  p_auto_open_dow         integer default 1,
  p_auto_open_time        time    default '09:00',
  p_auto_close_dow        integer default 4,
  p_auto_close_time       time    default '12:00',
  p_automation_tz         text    default 'America/New_York'
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_season seasons%rowtype;
  v_old    rule_configs%rowtype;
begin
  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can change the rules';
  end if;

  select * into v_old from rule_configs where season_id = p_season_id for update;
  if not found then
    raise exception 'season has no rule configuration';
  end if;

  update rule_configs set
    fake_bankroll         = p_fake_bankroll,
    screen_threshold      = p_screen_threshold,
    top_n_distinct        = p_top_n_distinct,
    min_bid               = p_min_bid,
    capture_timing        = p_capture_timing,
    bid_deadline_default  = p_bid_deadline_default,
    include_previews      = p_include_previews,
    preview_start_weekday = p_preview_start_weekday,
    buy_in                = p_buy_in,
    payout_structure      = p_payout_structure,
    bidding_automation    = p_bidding_automation,
    auto_open_dow         = p_auto_open_dow,
    auto_open_time        = p_auto_open_time,
    auto_close_dow        = p_auto_close_dow,
    auto_close_time       = p_auto_close_time,
    automation_tz         = p_automation_tz
  where season_id = p_season_id;

  if v_season.status <> 'draft' then
    insert into audit_log (season_id, actor, action, detail)
    values (p_season_id, auth.uid(), 'update_rule_config',
            jsonb_build_object(
              'old', to_jsonb(v_old) - 'id' - 'season_id' - 'created_at',
              'new', jsonb_build_object(
                'fake_bankroll', p_fake_bankroll,
                'screen_threshold', p_screen_threshold,
                'top_n_distinct', p_top_n_distinct,
                'min_bid', p_min_bid,
                'capture_timing', p_capture_timing,
                'bid_deadline_default', p_bid_deadline_default,
                'include_previews', p_include_previews,
                'preview_start_weekday', p_preview_start_weekday,
                'buy_in', p_buy_in,
                'payout_structure', p_payout_structure,
                'bidding_automation', p_bidding_automation,
                'auto_open_dow', p_auto_open_dow,
                'auto_open_time', p_auto_open_time,
                'auto_close_dow', p_auto_close_dow,
                'auto_close_time', p_auto_close_time,
                'automation_tz', p_automation_tz)));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. The automation runner. Service-role only — it acts for no user, so it
--     must not be callable by one. Opens every due week that has something
--     to bid on; a slate-less week is skipped, never force-opened.
-- ---------------------------------------------------------------------------
create or replace function public.run_bidding_automation()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_opened integer := 0;
  r record;
begin
  for r in
    select w.id, w.season_id, w.number
    from weeks w
    join seasons s on s.id = w.season_id
    join rule_configs rc on rc.season_id = w.season_id
    where w.status = 'draft'
      and s.status = 'active'
      and rc.bidding_automation
      and now() >= (
        (((w.opening_date - (extract(isodow from w.opening_date)::int - 1))
          + (rc.auto_open_dow - 1))::timestamp + rc.auto_open_time)
        at time zone rc.automation_tz
      )
      and exists (
        select 1 from films f
        where f.week_id = w.id and f.status = 'active' and f.eligible
      )
  loop
    update weeks set status = 'open' where id = r.id;
    insert into audit_log (season_id, actor, action, detail)
    values (r.season_id, null, 'auto_open_week',
            jsonb_build_object('week_id', r.id, 'week_number', r.number));
    v_opened := v_opened + 1;
  end loop;

  return v_opened;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Grants — ADR-004 deliberate exposure. The runner is the one function
--     in the schema that authenticated may NOT execute.
-- ---------------------------------------------------------------------------
revoke all on function public.place_bid(uuid, integer)          from public, anon;
revoke all on function public.place_bids(jsonb)                 from public, anon;
revoke all on function public.get_week_bidders(uuid)            from public, anon;
revoke all on function public.get_late_offers(uuid)             from public, anon;
revoke all on function public.review_late_offer(uuid, boolean)  from public, anon;
revoke all on function public.close_week(uuid)                  from public, anon;
revoke all on function public.create_week(uuid, integer, date, timestamptz) from public, anon;
revoke all on function public.resolve_week(uuid)                from public, anon;
revoke all on function public.update_rule_config(uuid, integer, integer, integer, integer, text, text, boolean, public.weekday_start, integer, jsonb, boolean, integer, time, integer, time, text) from public, anon;
revoke all on function public.run_bidding_automation()          from public, anon, authenticated;

grant execute on function public.place_bid(uuid, integer)         to authenticated;
grant execute on function public.place_bids(jsonb)                to authenticated;
grant execute on function public.get_week_bidders(uuid)           to authenticated;
grant execute on function public.get_late_offers(uuid)            to authenticated;
grant execute on function public.review_late_offer(uuid, boolean) to authenticated;
grant execute on function public.close_week(uuid)                 to authenticated;
grant execute on function public.create_week(uuid, integer, date, timestamptz) to authenticated;
grant execute on function public.resolve_week(uuid)               to authenticated;
grant execute on function public.update_rule_config(uuid, integer, integer, integer, integer, text, text, boolean, public.weekday_start, integer, jsonb, boolean, integer, time, integer, time, text) to authenticated;
grant execute on function public.run_bidding_automation()         to service_role;

comment on function public.get_late_offers(uuid) is
  'ADR-052: pending late offers for a week, commissioner-only. Returns WHO '
  'offered on WHAT and WHEN — never the amount. The ADR-022 seal holds '
  'through the entire late window.';
comment on function public.review_late_offer(uuid, boolean) is
  'ADR-052: accept (late=false, joins the week) or decline (delete) one '
  'pending offer. Only while the week is open — the reveal closes the window.';
comment on function public.run_bidding_automation() is
  'ADR-052: opens due weeks for seasons with bidding_automation on. '
  'Service-role only; driven by /api/cron/automate.';
