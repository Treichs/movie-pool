-- ADR-070, part 2 of 2: the behaviour behind the new labels.
--
-- Every function below is re-declared IN FULL from its current definition —
-- read out of the hosted database and its owning migration rather than from
-- whichever copy was easiest to find. That is the rule the seed_season_weeks
-- regression bought on 2026-08-04: a re-declaration that starts from a stale
-- copy silently deletes whatever was added in between. Only the marked lines
-- differ from what shipped.
--
-- The seven that had to move, found by asking the database which bodies carry
-- the old labels rather than by grepping the tree:
--   close_week, resolve_week, capture_film, remove_film, override_bid_amount,
--   get_film_pool_stats, update_season_settings — plus the bids_select policy
--   and the activity whitelist.

-- ---------------------------------------------------------------------------
-- 1. close_week — closing a week now decides who owns what.
--
--    resolve_week took ONE argument and read ONE setting. There was no
--    judgement in it, nothing a commissioner could weigh and nothing they could
--    get wrong — so the only thing the button contributed was a wait, and an
--    unbounded one, because nothing resolved automatically. A week could sit
--    revealed but unowned for days because a person had not clicked.
--
--    THE ONE THING THE PAUSE REALLY BOUGHT was a last look at the slate before
--    money committed, since the rule below reads f.eligible and f.status. That
--    turns out to cost nothing: remove_film carries no week-status guard at
--    all, and refunds by removing the film — which works because money is
--    derived and never stored. The rulebook's own remedy already works after
--    the fact, so the window was guarding a door that was never locked.
--
--    Everything else here is the shipped body verbatim: the p_auto split, the
--    audit row that names nobody on an automatic close, and ADR-056's cascade.
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
  if not p_auto and not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can close bidding';
  end if;
  if v_week.status <> 'open' then
    raise exception 'week is not open for bidding';
  end if;

  -- NEW (ADR-070): resolve_week's whole body, inlined. Read BEFORE the status
  -- moves, so a season with no settings row fails with a sentence about
  -- settings rather than leaving a week closed and unowned.
  select (settings_for_season(v_week.season_id)).top_n_distinct into v_top_n;
  if v_top_n is null then
    raise exception 'season has no settings row — cannot decide winners';
  end if;

  update bids b
  set is_winning = (
    f.eligible
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = b.film_id
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
                             -- NEW: the reveal and the settlement are one event
                             -- now, so the one audit row has to carry both.
                             'top_n_distinct', v_top_n,
                             'winning_bids', v_winners));

  -- ADR-056: the reveal opens the next week, in the same act.
  perform open_due_weeks(v_week.season_id);
end;
$$;

comment on function public.close_week(uuid, boolean) is
  'ADR-070: closes bidding AND decides winners in one act. p_auto distinguishes '
  'the deadline firing from a commissioner closing early.';

-- Gone, not deprecated. Leaving it callable would let a commissioner re-run
-- resolution against a week that has already charged everybody.
drop function if exists public.resolve_week(uuid);

-- ---------------------------------------------------------------------------
-- 2. finalize_week — the week is over because the commissioner says so.
--
--    Replaces the trailing auto-flip that used to live at the bottom of
--    capture_film and remove_film, where "this week is finished" was a fact the
--    app inferred from the last capture happening to save. Now it is a
--    statement, and it has somewhere to refuse: every film still on the slate
--    must carry BOTH numbers.
--
--    Deliberately no un-finalize. ADR-060 already lets a commissioner correct a
--    settled score in place, and capture_film below still accepts `final`, so
--    fixing a wrong number never requires walking the week backwards.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_missing integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can finish a week';
  end if;
  if v_week.status = 'final' then
    raise exception 'this week is already final';
  end if;
  if v_week.status <> 'closed' then
    raise exception 'bidding has to close before a week can be finished (status: %)',
      v_week.status;
  end if;

  select count(*) into v_missing
  from films f
  where f.week_id = p_week_id
    and f.status = 'active'
    and f.eligible
    and (f.captured_at is null or f.box_office_m is null or f.tomatometer is null);
  if v_missing > 0 then
    raise exception
      '% film(s) still need an opening box office and a Tomatometer before this week can be finished',
      v_missing;
  end if;

  update weeks set status = 'final' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'finalize_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number));
end;
$$;

comment on function public.finalize_week(uuid) is
  'ADR-070: the commissioner declares a week done. Refused until every active '
  'eligible film carries both a box office figure and a Tomatometer.';

-- ---------------------------------------------------------------------------
-- 3. capture_film — from 20260803050000, with TWO changes:
--    the status gate now names the new labels, and the trailing auto-flip is
--    gone (finalize_week owns that transition). Everything between is the
--    shipped body: ADR-052 provenance validation and ADR-060's disclosure row.
-- ---------------------------------------------------------------------------
create or replace function public.capture_film(
  p_film_id      uuid,
  p_box_office_m numeric,
  p_tomatometer  integer,
  p_suggested    jsonb default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film       films%rowtype;
  v_week       weeks%rowtype;
  v_score      numeric;
  v_key        text;
  v_node       jsonb;
  v_provenance jsonb := '{}'::jsonb;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;

  select * into v_week from weeks where id = v_film.week_id for update;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can capture results';
  end if;
  -- CHANGED (ADR-070). `final` stays on the list so a wrong number can be
  -- corrected without walking the week backwards.
  if v_week.status not in ('closed', 'final') then
    raise exception 'bidding has to close before results can be captured (status: %)',
      v_week.status;
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the roster and is not scored';
  end if;
  if p_box_office_m is null or p_box_office_m < 0 then
    raise exception 'box office must be 0 or more, in $ millions (e.g. 81.4)';
  end if;
  if p_tomatometer is null or p_tomatometer < 0 or p_tomatometer > 100 then
    raise exception 'Tomatometer must be a whole number between 0 and 100';
  end if;

  if p_suggested is not null then
    if jsonb_typeof(p_suggested) <> 'object' then
      raise exception 'p_suggested must be a json object';
    end if;
    for v_key, v_node in select * from jsonb_each(p_suggested) loop
      if v_key not in ('tomatometer', 'box_office_m') then
        raise exception 'unknown suggestion key "%" (expected tomatometer or box_office_m)', v_key;
      end if;
      if jsonb_typeof(v_node) <> 'object' then
        raise exception 'suggestion "%" must be an object with value and source', v_key;
      end if;
      if nullif(trim(coalesce(v_node ->> 'source', '')), '') is null then
        raise exception 'suggestion "%" must name its source', v_key;
      end if;
      if not (v_node ? 'value') then
        raise exception 'suggestion "%" must carry a value (use null for "asked, nothing to report")', v_key;
      end if;
      if v_node ->> 'value' is not null and jsonb_typeof(v_node -> 'value') <> 'number' then
        raise exception 'suggestion "%" value must be a number or null', v_key;
      end if;

      v_provenance := v_provenance || jsonb_build_object(v_key, jsonb_build_object(
        'suggested', v_node -> 'value',
        'entered',   case v_key when 'tomatometer' then to_jsonb(p_tomatometer)
                                else to_jsonb(p_box_office_m) end,
        'source',    v_node ->> 'source',
        'accepted',  case
                       when v_node ->> 'value' is null then null
                       when v_key = 'tomatometer'
                         then (v_node ->> 'value')::numeric = p_tomatometer
                       else (v_node ->> 'value')::numeric = p_box_office_m
                     end));
    end loop;
  end if;

  update films set
    box_office_m = p_box_office_m,
    tomatometer  = p_tomatometer,
    captured_at  = now()
  where id = p_film_id;

  select score into v_score from films where id = p_film_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'capture_film',
          jsonb_build_object(
            'film_id', p_film_id, 'title', v_film.title,
            'box_office_m', p_box_office_m, 'tomatometer', p_tomatometer,
            'score', v_score,
            'recapture', v_film.captured_at is not null)
          || case when v_film.captured_at is not null then
               jsonb_build_object('old', jsonb_build_object(
                 'box_office_m', v_film.box_office_m,
                 'tomatometer', v_film.tomatometer,
                 'score', v_film.score))
             else '{}'::jsonb end
          || case when v_provenance <> '{}'::jsonb then
               jsonb_build_object('provenance', v_provenance)
             else '{}'::jsonb end);

  -- ADR-060: the disclosure row. Only on a re-capture — a first capture is
  -- ordinary lifecycle, not a correction of anything.
  if v_film.captured_at is not null then
    insert into audit_log (season_id, actor, action, detail)
    values (v_week.season_id, auth.uid(), 'override_film_score',
            jsonb_build_object(
              'week_id', v_week.id, 'week_number', v_week.number,
              'film_id', p_film_id, 'title', v_film.title,
              'old', jsonb_build_object('box_office_m', v_film.box_office_m,
                                        'tomatometer', v_film.tomatometer,
                                        'score', v_film.score),
              'new', jsonb_build_object('box_office_m', p_box_office_m,
                                        'tomatometer', p_tomatometer,
                                        'score', v_score)));
  end if;
  -- REMOVED (ADR-070): the auto-flip to `scored`. finalize_week owns it.
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. remove_film — from 20260803050000, with the same auto-flip removed and
--    nothing else touched. The ADR-061 reason wording stays as it shipped.
-- ---------------------------------------------------------------------------
create or replace function public.remove_film(p_film_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film         films%rowtype;
  v_week         weeks%rowtype;
  v_bid_count    integer;
  v_refund_count integer;
  v_refund_total integer;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;

  select * into v_week from weeks where id = v_film.week_id for update;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can remove films';
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has already been removed';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'give a removal reason (e.g. "opened limited, not wide")';
  end if;

  select count(*),
         count(*) filter (where is_winning),
         coalesce(sum(amount) filter (where is_winning), 0)
    into v_bid_count, v_refund_count, v_refund_total
  from bids
  where film_id = p_film_id;

  update films
  set status         = 'removed',
      removed_reason = trim(p_reason)
  where id = p_film_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'remove_film',
          jsonb_build_object(
            'film_id', p_film_id, 'title', v_film.title,
            'week_id', v_week.id, 'week_number', v_week.number,
            'week_status', v_week.status, 'reason', trim(p_reason),
            'bids', v_bid_count,
            'refunded_winning_bids', v_refund_count,
            'refunded_total', v_refund_total));
  -- REMOVED (ADR-070): the auto-flip to `scored`. Pulling the last uncaptured
  -- film no longer ends the week behind the commissioner's back; they finish it
  -- themselves, and finalize_week will now let them because the film they just
  -- removed is no longer counted as missing its numbers.
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. override_bid_amount — from 20260803050000, and SHORTER than it was.
--
--    The shipped body branched on whether ownership had been decided yet,
--    because a `locked` week had is_winning still null. There is no such week
--    any more: `closed` always has winners. So the conditional re-resolve
--    becomes unconditional, and the second budget rule — ADR-001 sum-exposure,
--    which existed only for the locked case — goes with it, along with
--    v_exposure. One path, which is the point of the merge.
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

  -- The ADR-022 fence, in the new labels.
  if v_week.status not in ('closed', 'final') then
    raise exception
      'bids can only be corrected after the week closes and amounts are revealed (status: %)',
      v_week.status;
  end if;

  if v_film.status <> 'active' then
    raise exception 'this film was removed from the slate — its bids are already refunded';
  end if;

  -- Rulebook §3: a correction is still a bid, so it obeys the bid rules.
  v_config := settings_for_season(v_week.season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;
  if p_amount is null or p_amount < v_config.min_bid then
    raise exception 'a bid is at least $%', v_config.min_bid;
  end if;

  -- Rulebook §3 on removals applies the same way here: there must BE a reason.
  -- It goes in the audit log and members see that a correction was made.
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'give a reason for the correction (players are told one was made)';
  end if;

  v_old := v_bid.amount;
  if v_old = p_amount then
    return;
  end if;

  update bids set amount = p_amount, updated_at = now() where id = p_bid_id;

  -- Re-decide ownership of THIS FILM only. Unconditional now: every week that
  -- gets this far has already had its winners decided at close.
  update bids b
  set is_winning = (
    v_film.eligible
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = v_film.id
      order by b2.amount desc
      limit v_config.top_n_distinct
    )
  )
  where b.film_id = v_film.id;

  -- Budget. Checked AFTER the write and rolled back by raising, because
  -- affordability depends on who won, which depends on the amounts. One
  -- transaction, so a rejected correction leaves nothing behind.
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

comment on function public.override_bid_amount(uuid, integer, text) is
  'ADR-060/070: correct a settled bid amount. Fenced to weeks past the close so '
  'ADR-022 holds during bidding. Re-resolves the film''s winners and re-checks '
  'the bankroll.';

-- ---------------------------------------------------------------------------
-- 6. bids_select — the ADR-022 reveal, in the new labels.
--
--    The stored policy already followed part 1's rename by OID and would have
--    kept working; it is re-declared anyway so it stops naming the dead
--    `locked` label, which would read to the next person as a state that still
--    exists.
-- ---------------------------------------------------------------------------
drop policy if exists bids_select on public.bids;

create policy bids_select on public.bids
  for select to authenticated
  using (
    public.is_own_member(season_member_id)
    or exists (
      select 1
      from public.films f
      join public.weeks w on w.id = f.week_id
      where f.id = bids.film_id
        and w.status in ('closed', 'final')
        and public.is_season_member(w.season_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 7. get_film_pool_stats — from 20260801130000, `scored` -> `final`. The reason
--    the scope exists is unchanged and now reads better: a week is `final`
--    exactly when the commissioner has said every number on it is in.
-- ---------------------------------------------------------------------------
create or replace function public.get_film_pool_stats(p_tmdb_id integer)
returns jsonb
language sql
stable security definer set search_path = public
as $$
  with played as (
    select
      f.score,
      f.box_office_m,
      f.tomatometer,
      w.week_of,
      s.league_id
    from films f
    join weeks w   on w.id = f.week_id
    join seasons s on s.id = w.season_id
    where f.tmdb_id = p_tmdb_id
      and f.status = 'active'
      and w.status = 'final'
      and f.captured_at is not null
      and f.score is not null
  )
  select jsonb_build_object(
    'times_played',    count(*),
    'league_count',    count(distinct league_id),
    'avg_score',       round(avg(score), 2),
    'best_score',      max(score),
    'avg_box_office',  round(avg(box_office_m), 2),
    'avg_tomatometer', round(avg(tomatometer)),
    'first_played',    min(week_of),
    'last_played',     max(week_of)
  )
  from played
  where exists (select 1 from played);
$$;

-- ---------------------------------------------------------------------------
-- 8. update_season_settings — from 20260804170000, one predicate changed.
--
--    THE BANKROLL GATE fires the moment money is charged, and that moment moved
--    forward: it used to be resolution, it is now the close. Same sentence to
--    the commissioner, because "once a week has been resolved" was always
--    describing when winners got charged rather than which enum member it was.
-- ---------------------------------------------------------------------------
create or replace function public.update_season_settings(
  p_season_id uuid,
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
  p_box_office_days smallint[] default '{5,6,7}'::smallint[],
  p_also_set_league_default boolean default false
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old    season_settings%rowtype;
  v_season seasons%rowtype;
  v_bad    smallint[];
begin
  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can change this season''s rules';
  end if;

  select * into v_old from season_settings where season_id = p_season_id for update;
  if not found then
    raise exception 'this season has no settings row';
  end if;

  if p_box_office_days is null or array_length(p_box_office_days, 1) is null then
    raise exception 'at least one box-office day must be counted';
  end if;

  select array_agg(d order by d) into v_bad
  from unnest(p_box_office_days) d
  where d <= p_bids_due_dow;
  if v_bad is not null then
    raise exception
      'box office cannot be counted on % — bidding is open until %. Pick days after the cutoff.',
      (select string_agg(iso_weekday_name(d), ', ') from unnest(v_bad) d),
      iso_weekday_name(p_bids_due_dow);
  end if;

  -- THE BANKROLL GATE. CHANGED (ADR-070): closed, not resolved.
  if p_fake_bankroll is distinct from v_old.fake_bankroll
     and exists (
       select 1 from weeks w
       where w.season_id = p_season_id and w.status in ('closed', 'final')
     )
  then
    raise exception
      'the bankroll cannot change once a week has closed — winners have already been charged, and changing it now would rewrite what everyone has spent. It can be set on the next season.';
  end if;

  update season_settings set
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
  where season_id = p_season_id;

  if p_also_set_league_default then
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
    where league_id = v_season.league_id;
  end if;

  -- The bids-due trio is this season's default for its weeks, so a change to
  -- it moves every week that is not pinned and has not already closed.
  perform sync_week_deadlines(p_season_id);

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'update_season_settings',
          jsonb_build_object(
            'old', to_jsonb(v_old) - 'season_id' - 'created_at',
            'also_set_league_default', p_also_set_league_default,
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
-- 9. get_league_activity — the whitelist learns the new events.
--
--    From 20260804060000 with three names added: finalize_week (which replaces
--    week_scored), and ADR-069's skip_week/unskip_week, because a weekend the
--    commissioner declared empty is exactly the kind of thing a member wonders
--    about. `resolve_week` and `week_scored` STAY on the list: nothing emits
--    them any more, but historical rows exist and should not vanish from the
--    feed because the code that wrote them was deleted.
-- ---------------------------------------------------------------------------
create or replace function public.get_league_activity(
  p_league_id uuid,
  p_limit     integer default 12
)
returns table (
  -- BIGINT, not uuid. audit_log.id is a bigserial, and 20260802060000 exists
  -- solely because this was once declared uuid — a mismatch that only shows up
  -- through a real call, because the feed's reader swallows errors so a rail
  -- cannot take a page down. Re-declaring it wrong here reintroduced that bug
  -- for exactly as long as it took the push to reject it.
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
      'open_week', 'auto_open_week', 'close_week',
      -- Dead writers, live history.
      'resolve_week', 'week_scored',
      -- ADR-070 / ADR-069.
      'finalize_week', 'skip_week', 'unskip_week',
      'add_league_member', 'accept_league_invite', 'remove_league_member',
      'handoff_league_commissioner',
      'promote_league_commissioner', 'demote_league_commissioner',
      'override_bid_amount', 'override_film_score', 'remove_film',
      'finalize_settlement'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.finalize_week(uuid) from public, anon;
grant execute on function public.finalize_week(uuid) to authenticated;
