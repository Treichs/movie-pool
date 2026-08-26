-- The league's bids-due setting becomes a DEFAULT, and a week may override it
-- (2026-08-04, developer's call).
--
-- Three faults, one model. All of them come from bid_deadline being computed
-- once at seed time and then left alone.
--
-- 1. A PAST CUTOFF WAS SILENTLY SWALLOWED. seed_season_weeks computed each
--    week's deadline and, when it had already passed, wrote NULL:
--
--        if v_deadline <= now() then v_deadline := null; end if;
--
--    run_bidding_automation only closes weeks `where bid_deadline is not null`,
--    so that week opened on its clock, took bids, and then NEVER CLOSED. A
--    blind auction with no cutoff, produced by creating a season whose first
--    weekend is the current calendar week after the due day has been and gone.
--    Now it is refused at creation, with a message saying which two things can
--    be changed to fix it.
--
-- 2. CHANGING THE SETTING CHANGED NOTHING. update_league_settings wrote
--    league_settings and audited old-vs-new, and never touched weeks — while
--    its own comment claimed "ADR-059 makes every settings change LIVE for the
--    running season". A league created with Thursday, seeded, then switched to
--    Monday kept Thursday on every week, forever, with the settings screen
--    insisting otherwise.
--
-- 3. THE PER-WEEK EDIT HAD NO RELATIONSHIP TO THE DEFAULT. update_week could
--    already set a week's deadline, but nothing recorded whether a week's value
--    was chosen or inherited — so nothing could propagate a default without
--    destroying an override, and there was no way back to the default.
--
-- THE MODEL. bid_deadline_override is the input, nullable, meaning "inherit".
-- bid_deadline stays the EFFECTIVE value — every reader in the app and the
-- automation's own scan keep working untouched — and is written by exactly one
-- function, sync_week_deadlines. Two columns rather than a boolean flag because
-- the override is a VALUE the commissioner set, not a mode: keeping it lets a
-- week fall back to the default and return to its override without the
-- commissioner retyping it.
--
-- WHAT SYNC WILL NOT DO: move a deadline into the past. A deadline is a promise
-- to the players — bidding closes then, and blind bids depend on everyone
-- having had the same warning. Recomputing a live week's cutoff to a moment
-- that has already gone would close bidding retroactively and without notice,
-- which is exactly the unfairness the sealed-bid model exists to prevent. Such
-- a week keeps the deadline it was given and the new default takes effect from
-- the next week. Closed weeks are history and are never touched at all.

-- ---------------------------------------------------------------------------
-- 1. The override column.
-- ---------------------------------------------------------------------------
alter table public.weeks
  add column if not exists bid_deadline_override timestamptz;

comment on column public.weeks.bid_deadline_override is
  'A commissioner''s per-week bids-due moment. NULL means inherit the league '
  'default. Never read directly by the app — sync_week_deadlines folds it into '
  'bid_deadline, which is the effective value everything else reads.';

comment on column public.weeks.bid_deadline is
  'The EFFECTIVE bids-due moment: the override when set, else the league '
  'default for this week. Materialised, with sync_week_deadlines as its only '
  'writer.';

-- ---------------------------------------------------------------------------
-- 2. One definition of "the league default for this week".
--
--    The expression lived inline in seed_season_weeks and nowhere else, which
--    was fine while one caller existed and is not now that three do.
-- ---------------------------------------------------------------------------
create or replace function public.league_default_bid_deadline(
  p_week_of date,
  p_dow     integer,
  p_time    time,
  p_tz      text
)
returns timestamptz
language sql immutable
as $$
  -- week_of is the Monday, and bids_due_dow is 1-7 with Monday = 1, so the
  -- offset is dow - 1 days from the Monday.
  select ((p_week_of + (p_dow - 1))::timestamp + p_time)
         at time zone coalesce(p_tz, 'America/New_York');
$$;

-- ---------------------------------------------------------------------------
-- 3. The single writer of weeks.bid_deadline.
--
--    Returns how many rows it moved, so callers and spikes can assert on it.
-- ---------------------------------------------------------------------------
create or replace function public.sync_week_deadlines(p_season_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_config league_settings%rowtype;
  v_moved  integer := 0;
  r        record;
  v_target timestamptz;
begin
  v_config := settings_for_season(p_season_id);
  if v_config.league_id is null then
    return 0; -- no settings row: nothing to inherit from
  end if;

  for r in
    select w.id, w.week_of, w.status, w.bid_deadline, w.bid_deadline_override
    from weeks w
    where w.season_id = p_season_id
      -- Closed weeks are history. Their deadline records when bidding actually
      -- shut, and a later settings change must not rewrite that.
      and w.status in ('draft', 'open')
  loop
    v_target := coalesce(
      r.bid_deadline_override,
      league_default_bid_deadline(r.week_of, v_config.bids_due_dow,
                                  v_config.bids_due_time, v_config.bids_due_tz)
    );

    -- Never retroactively. An OPEN week whose new value has already passed
    -- keeps what it had; a DRAFT week has promised nobody anything yet, but a
    -- past deadline on it would make it un-closable the moment it opened, so
    -- it is skipped too and the gate in seed_season_weeks is what stops that
    -- state being created in the first place.
    if v_target <= now() then
      continue;
    end if;

    if r.bid_deadline is distinct from v_target then
      update weeks set bid_deadline = v_target where id = r.id;
      v_moved := v_moved + 1;
    end if;
  end loop;

  return v_moved;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. seed_season_weeks — refuse a past cutoff instead of nulling it.
--    Body from pg_get_functiondef; the gate and the helper call are new.
-- ---------------------------------------------------------------------------
create or replace function public.seed_season_weeks(
  p_season_id uuid,
  p_first_opening_date date,
  p_week_count integer
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_config   league_settings%rowtype;
  v_opening  date;
  v_week_of  date;
  v_deadline timestamptz;
  i          integer;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can lay out the season';
  end if;
  if p_first_opening_date is null then
    raise exception 'the season needs a first opening date';
  end if;
  if p_week_count is null or p_week_count < 1 or p_week_count > 52 then
    raise exception 'a season runs between 1 and 52 weeks';
  end if;
  if exists (select 1 from weeks where season_id = p_season_id) then
    raise exception 'this season already has weeks — add or remove them individually';
  end if;

  v_config := settings_for_season(p_season_id);

  -- THE GATE. Weeks run seven days apart in ascending order, so if the FIRST
  -- week's deadline is still ahead of us none of the others can be behind us —
  -- one check covers the season. The message names both levers because either
  -- one genuinely fixes it.
  v_week_of  := p_first_opening_date - (extract(isodow from p_first_opening_date)::int - 1);
  v_deadline := league_default_bid_deadline(v_week_of, v_config.bids_due_dow,
                                            v_config.bids_due_time, v_config.bids_due_tz);
  if v_deadline <= now() then
    raise exception
      'bids for that first weekend were due % — the week would open and never close. Start the season a week later, or move the league''s bids-due day.',
      to_char(v_deadline at time zone v_config.bids_due_tz, 'FMDay FMDD Mon at FMHH12:MIam');
  end if;

  for i in 0 .. p_week_count - 1 loop
    v_opening  := p_first_opening_date + (i * 7);
    v_week_of  := v_opening - (extract(isodow from v_opening)::int - 1);
    v_deadline := league_default_bid_deadline(v_week_of, v_config.bids_due_dow,
                                              v_config.bids_due_time, v_config.bids_due_tz);

    insert into weeks (season_id, number, opening_date, bid_deadline, bids_open_at)
    values (p_season_id, i + 1, v_opening, v_deadline,
            week_bids_open_at(v_opening, v_config.bids_due_tz));
  end loop;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'seed_season_weeks',
          jsonb_build_object('week_count', p_week_count,
                             'first_opening_date', p_first_opening_date,
                             'last_opening_date',
                               p_first_opening_date + ((p_week_count - 1) * 7)));

  return p_week_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. update_league_settings — propagate to every season still being played.
--    Body from pg_get_functiondef; only the sync loop at the end is new.
-- ---------------------------------------------------------------------------
create or replace function public.update_league_settings(
  p_league_id uuid,
  p_fake_bankroll integer,
  p_top_n_distinct integer,
  p_min_bid integer,
  p_buy_in integer,
  p_payout_structure jsonb,
  p_bids_due_dow integer,
  p_bids_due_time time without time zone,
  p_bids_due_tz text,
  p_league_type text default 'cash',
  p_default_season_length integer default 10,
  p_include_limited_releases boolean default false,
  p_side_bets_enabled boolean default true,
  p_box_office_days smallint[] default '{5,6,7}'::smallint[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old league_settings%rowtype;
  r     record;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can change the league settings';
  end if;

  select * into v_old from league_settings where league_id = p_league_id for update;
  if not found then
    raise exception 'league has no settings row';
  end if;

  update league_settings set
    fake_bankroll            = p_fake_bankroll,
    top_n_distinct           = p_top_n_distinct,
    min_bid                  = p_min_bid,
    buy_in                   = p_buy_in,
    payout_structure         = p_payout_structure,
    bids_due_dow             = p_bids_due_dow,
    bids_due_time            = p_bids_due_time,
    bids_due_tz              = p_bids_due_tz,
    league_type              = p_league_type,
    default_season_length    = p_default_season_length,
    include_limited_releases = p_include_limited_releases,
    side_bets_enabled        = p_side_bets_enabled,
    box_office_days          = p_box_office_days
  where league_id = p_league_id;

  -- THE PROMISE THIS FUNCTION HAS BEEN MAKING SINCE ADR-059, now kept. The
  -- audit comment below has always said a settings change is live for the
  -- running season; for the bids-due trio that was simply untrue, because the
  -- deadline was materialised at seed time and nothing recomputed it.
  --
  -- Every season still being played, not just the current one: a league can
  -- carry at most one active season today, but the loop costs nothing and does
  -- not encode that limit.
  for r in select id from seasons where league_id = p_league_id and status = 'active' loop
    perform sync_week_deadlines(r.id);
  end loop;

  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'update_league_settings',
          jsonb_build_object(
            'league_id', p_league_id,
            'old', to_jsonb(v_old) - 'id' - 'league_id' - 'created_at',
            'new', jsonb_build_object(
              'fake_bankroll', p_fake_bankroll,
              'top_n_distinct', p_top_n_distinct,
              'min_bid', p_min_bid,
              'buy_in', p_buy_in,
              'payout_structure', p_payout_structure,
              'bids_due_dow', p_bids_due_dow,
              'bids_due_time', p_bids_due_time,
              'bids_due_tz', p_bids_due_tz,
              'league_type', p_league_type,
              'default_season_length', p_default_season_length,
              'include_limited_releases', p_include_limited_releases,
              'side_bets_enabled', p_side_bets_enabled,
              'box_office_days', p_box_office_days)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The per-week override, set and cleared.
--
--    NULL clears it and the week falls back to the league default — which is
--    why this is its own RPC rather than a parameter on update_week: there,
--    null already means "no deadline", and the two meanings cannot share a
--    signature.
-- ---------------------------------------------------------------------------
create or replace function public.set_week_bid_deadline(
  p_week_id  uuid,
  p_deadline timestamptz
)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can change a week''s deadline';
  end if;
  -- Draft or open only. Once bidding has closed the deadline is a record of
  -- when it closed, and editing it would rewrite what happened.
  if v_week.status not in ('draft', 'open') then
    raise exception 'bidding on this week has closed — its deadline is now a matter of record (status: %)', v_week.status;
  end if;
  if p_deadline is not null and p_deadline <= now() then
    raise exception 'that moment has already passed — a deadline can only be moved to the future';
  end if;

  update weeks set bid_deadline_override = p_deadline where id = p_week_id;
  perform sync_week_deadlines(v_week.season_id);

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'set_week_bid_deadline',
          jsonb_build_object('week_id', p_week_id,
                             'week_number', v_week.number,
                             'from', v_week.bid_deadline,
                             'override', p_deadline));

  return (select bid_deadline from weeks where id = p_week_id);
end;
$$;

revoke all on function public.set_week_bid_deadline(uuid, timestamptz) from public, anon;
grant execute on function public.set_week_bid_deadline(uuid, timestamptz) to authenticated;
revoke all on function public.sync_week_deadlines(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 7. update_week keeps the opening date and stops touching the deadline.
--
--    Two callers wrote the same column with different meanings, which is how
--    an override became indistinguishable from an inherited value. The
--    deadline now has exactly one door: set_week_bid_deadline.
-- ---------------------------------------------------------------------------
create or replace function public.update_week(
  p_week_id uuid,
  p_opening_date date,
  p_bid_deadline timestamptz default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can edit weeks';
  end if;
  if v_week.status not in ('draft', 'open') then
    raise exception 'week can no longer be edited (status: %)', v_week.status;
  end if;
  if p_opening_date is null then
    raise exception 'week needs an opening date';
  end if;

  -- p_bid_deadline is ACCEPTED AND IGNORED, deliberately. The parameter is kept
  -- so existing callers do not fail to resolve while they are updated; the
  -- deadline is set through set_week_bid_deadline, which knows the difference
  -- between an override and an inherited value.
  update weeks
  set opening_date = p_opening_date,
      week_of      = p_opening_date - (extract(isodow from p_opening_date)::int - 1),
      bids_open_at = week_bids_open_at(p_opening_date,
                                       (settings_for_season(v_week.season_id)).bids_due_tz)
  where id = p_week_id;

  -- Moving the weekend moves the week it belongs to, so its inherited deadline
  -- moves with it. This is the case that made the old function wrong even
  -- before defaults existed: it changed opening_date and left the deadline
  -- pointing at the old week.
  perform sync_week_deadlines(v_week.season_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Backfill: bring every open season's weeks in line with its league's
--    current default. This is the repair for the leagues that changed a
--    setting and watched nothing happen.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from seasons where status = 'active' loop
    perform sync_week_deadlines(r.id);
  end loop;
end $$;
