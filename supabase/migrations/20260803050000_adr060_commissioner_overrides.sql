-- ============================================================================
-- ADR-060 — Retroactive commissioner corrections (the override half)
--
-- A commissioner may correct settled values: bid amounts, film refunds and
-- captured scores. Two of the three already existed —
--   * refunds: remove_film (phase 7) works at any week status, refunds by
--     derivation and records a reason;
--   * scores: capture_film already re-runs on a resolved or scored week and
--     already records `recapture: true` with the old values.
-- Only BID AMOUNTS were genuinely uncorrectable, so that is the one new RPC
-- here. The rest of this migration is about DISCLOSURE, which is the half of
-- ADR-060 that the category research said actually keeps commissioner power
-- honest: making the corrections visible to members rather than possible.
--
-- THE FENCE. Every override requires the week to be past the REVEAL —
-- status in ('locked', 'resolved', 'scored'). ADR-022 seals bid amounts so
-- that nobody bids with knowledge of another bid; that guarantee has to hold
-- until the reveal and has nothing left to protect afterwards. A commissioner
-- who could edit amounts during an open week could also READ them, which
-- would destroy the blind auction outright. So the fence is not a nicety.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. override_bid_amount — the one new power.
--
-- Correcting an amount after the winners are settled cannot be a bare UPDATE:
-- ownership is decided BY the amount, so an edited bid whose is_winning flag
-- still reflects the old number leaves the season self-contradictory — a
-- player owning a film they no longer out-bid anyone for, or vice versa. So
-- the correction RE-RESOLVES that one film using the same top-N-distinct rule
-- resolve_week applies, and the budget is re-checked against the real
-- derivation afterwards rather than against a re-implementation of it.
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
  v_exposure  integer;
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

  -- The ADR-022 fence.
  if v_week.status not in ('locked', 'resolved', 'scored') then
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

  -- Re-decide ownership of THIS FILM only, and only where ownership has
  -- already been decided. On a merely `locked` week is_winning is still null
  -- and resolve_week will read the corrected amount when it runs.
  if v_week.status in ('resolved', 'scored') then
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
  end if;

  -- Budget. Which rule applies depends on whether ownership is decided yet,
  -- and getting this wrong in either direction lets a correction overdraw a
  -- player — so both cases are checked explicitly rather than sharing one.
  --
  -- Checked AFTER the write and rolled back by raising, because affordability
  -- depends on who won, which depends on the amounts. One transaction, so a
  -- rejected correction leaves nothing behind.
  select * into v_member from season_members where id = v_bid.season_member_id;
  v_remaining := member_remaining_budget(v_bid.season_member_id);

  if v_week.status in ('resolved', 'scored') then
    -- Ownership is settled, so member_remaining_budget already charges this
    -- bid if it won. Negative means the corrected amount is not affordable.
    if v_remaining < 0 then
      raise exception
        'that correction puts the player $% over their $% bankroll',
        -v_remaining, v_config.fake_bankroll;
    end if;
  else
    -- LOCKED, and this is the case that is easy to miss:
    -- member_remaining_budget charges only WINNING bids, and on a week that
    -- has not been resolved nothing is winning — so it would report the full
    -- bankroll no matter how large the correction, and resolve_week performs
    -- no budget check of its own. The rule that actually governs here is the
    -- one place_bid applies: ADR-001 sum-exposure, where a member's bids
    -- within ONE week must together fit their remaining budget.
    select coalesce(sum(b.amount), 0) into v_exposure
    from bids b
    join films f on f.id = b.film_id
    where b.season_member_id = v_bid.season_member_id
      and f.week_id = v_week.id
      and f.status = 'active';

    if v_exposure > v_remaining then
      raise exception
        'that correction puts the player''s week at $%, over their remaining $%',
        v_exposure, v_remaining;
    end if;
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
  'ADR-060: correct a settled bid amount. Fenced to weeks past the reveal so '
  'ADR-022 holds during bidding. Re-resolves the film''s winners and '
  're-checks the bankroll, so the correction cannot leave the season '
  'self-contradictory or a player overdrawn.';

-- ---------------------------------------------------------------------------
-- 2. capture_film — a re-capture says so out loud.
--
-- Carried forward verbatim from 20260803030000 (ADR-059/061) with ONE
-- addition: a second, distinctly-typed audit row when the film had already
-- been captured. Rewritten in full rather than patched because plpgsql has no
-- way to amend a function body, and this one carries the ADR-052 provenance
-- validation and the ADR-012 auto-flip that must not be dropped in passing.
--
-- Why a second row rather than renaming the action on re-capture: the
-- capture_film row is the record of WHAT was captured and phase6 reads it by
-- that name; the override row is the record of the commissioner CORRECTING
-- something already settled. They are different facts, and only the second
-- one belongs in a members' activity feed.
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
  if v_week.status not in ('resolved', 'scored') then
    raise exception 'resolve winners before capturing results (status: %)', v_week.status;
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

  if v_week.status = 'resolved' and not exists (
    select 1 from films f
    where f.week_id = v_week.id
      and f.status = 'active'
      and f.eligible
      and f.captured_at is null
  ) then
    update weeks set status = 'scored' where id = v_week.id;
    insert into audit_log (season_id, actor, action, detail)
    values (v_week.season_id, auth.uid(), 'week_scored',
            jsonb_build_object('week_id', v_week.id, 'week_number', v_week.number));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The feed shows corrections as corrections.
--
-- remove_film joins the whitelist for the first time. It was left out when the
-- feed shipped because the feed was "a story, not a log" — but a refund is
-- precisely the kind of thing ADR-060 says members are owed sight of, and it
-- is the one commissioner action that moves other people's money.
--
-- Note what still does NOT surface: capture_film, update_film, every rules
-- edit. Unrecognised actions default to invisible, and that stays the rule.
-- ---------------------------------------------------------------------------
create or replace function public.get_league_activity(
  p_league_id uuid,
  p_limit     integer default 12
)
returns table (
  -- bigint, NOT uuid: audit_log.id is a bigserial, and 20260802060000 already
  -- corrected this signature once. Redefining a function means carrying
  -- forward its LATEST definition, not the one it was introduced with —
  -- Postgres refuses to change a function's OUT-parameter row type, so this
  -- was caught by the push rather than shipped.
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
      a.season_id in (select id from seasons where league_id = p_league_id)
      or (a.season_id is null
          and nullif(a.detail->>'league_id', '')::uuid = p_league_id)
    )
    and a.action in (
      'create_season', 'update_season_status',
      'open_week', 'auto_open_week', 'close_week', 'resolve_week', 'week_scored',
      'add_league_member', 'accept_league_invite', 'remove_league_member',
      'handoff_league_commissioner',
      'promote_league_commissioner', 'demote_league_commissioner',
      -- ADR-060 commissioner overrides.
      'override_bid_amount', 'override_film_score', 'remove_film',
      'finalize_settlement'
    )
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. get_week_overrides — the corrections made to one week, for the week page.
--
-- The activity feed says THAT a correction happened; this says WHAT changed,
-- and it is deliberately a separate function with a narrower audience shape.
-- It returns no bid amounts for an open week because it cannot: every row it
-- reads belongs to a week already past the reveal, which the RPCs enforce at
-- write time. Members see it — disclosure is the point — but only members.
-- ---------------------------------------------------------------------------
create or replace function public.get_week_overrides(p_week_id uuid)
returns table (
  id         uuid,
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
  select * into v_week from weeks where id = p_week_id;
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
    -- Trimmed to the fields each override actually needs to explain itself.
    -- `detail` is not passed through wholesale: it carries season_member_id
    -- and profile_id, which the feed has no business publishing.
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

-- ---------------------------------------------------------------------------
-- 5. An ADR-061 leftover, fixed while the file is open.
--
-- remove_film's "give a reason" error still suggests `confirmed 850 screens`.
-- Screen counts were removed as a concept, and an example that names one tells
-- the commissioner to look for a number no source reports. The guard itself is
-- unchanged; only the sentence is. Redefined in full for the same reason as
-- capture_film above — plpgsql bodies are all-or-nothing.
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

  if v_week.status = 'resolved' and not exists (
    select 1 from films f
    where f.week_id = v_week.id
      and f.status = 'active'
      and f.eligible
      and f.captured_at is null
  ) then
    update weeks set status = 'scored' where id = v_week.id;
    insert into audit_log (season_id, actor, action, detail)
    values (v_week.season_id, auth.uid(), 'week_scored',
            jsonb_build_object('week_id', v_week.id, 'week_number', v_week.number));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------
revoke all on function public.override_bid_amount(uuid, integer, text) from public, anon;
revoke all on function public.get_week_overrides(uuid)                 from public, anon;
grant execute on function public.override_bid_amount(uuid, integer, text) to authenticated;
grant execute on function public.get_week_overrides(uuid)                 to authenticated;
