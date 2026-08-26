-- ============================================================================
-- Phase 9 — Season-end settlement engine (generate_settlement / finalize)
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §5 (domain logic) §6 (application structure)
--   Docs/reference/movie_pool_official_rules.md §7 (winning) §9 OQ-4 (tie splits)
--   Docs/reference/movie_pool_current_management_and_pain_points.md §5
--     (Season 30 reconstruction — the OQ-5 payout hypothesis, seeded as the
--      rule_configs.payout_structure default in phase 3; commissioner ratifies)
--   ADR-004 deny-by-default exposure
--
-- Real money and fake money never mix: this engine reads points/spent from
-- the same derivations as v_standings and writes ONLY the real-money ledger
-- (settlements + settlement_lines, schema from phase 1).
--
-- The math (Season 30 golden case: $35 buy-in × 10 = $350 pot):
--   pot − 3rd-place refund (one buy-in) − efficiency prize = remainder
--   2nd = round(remainder × second_pct); 1st = remainder − 2nd  ← zero-sum
--   dessert penalty is COLLECTED from the worst pick's owners and TRANSFERRED
--   to the efficiency winner(s).
--   → 350 − 35 − 50 = 265 → 2nd 80, 1st 185; efficiency nets 50+10.
--
-- Ties (OQ-4): money places use DENSE ranking — every member at a tied place
-- splits that place's value equally; leftover whole dollars go one each in
-- display-name order (money is integer dollars). Same split for tied awards.
-- Zero-sum (total won = total owing) is asserted before anything is written.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. generate_settlement — commissioner-only; produces a DRAFT ledger any
--    time (a preview of "if the season ended now"). Regenerating replaces the
--    existing draft; a season with a FINAL settlement refuses.
-- ---------------------------------------------------------------------------
create or replace function public.generate_settlement(p_season_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_config      rule_configs%rowtype;
  v_first_pct   integer;
  v_second_pct  integer;
  v_eff_prize   integer;
  v_dessert     integer;
  v_n           integer;
  v_pot         integer;
  v_third_out   integer := 0;  -- 3rd-place refund actually carved out
  v_eff_out     integer := 0;  -- efficiency prize actually carved out
  v_dessert_out integer := 0;  -- dessert penalty actually collected
  v_remainder   integer;
  v_first_amt   integer := 0;
  v_second_amt  integer := 0;
  v_best_ratio  numeric;
  v_worst_score numeric;
  v_eff_films   jsonb;
  v_worst_films jsonb;
  v_won_sum     integer;
  v_owing_sum   integer;
  v_id          uuid;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can generate the settlement';
  end if;
  select * into v_config from rule_configs where season_id = p_season_id;
  if not found then
    raise exception 'season has no rule configuration';
  end if;
  if exists (select 1 from settlements
             where season_id = p_season_id and status = 'final') then
    raise exception 'this season already has a final settlement';
  end if;

  v_first_pct  := coalesce((v_config.payout_structure->>'first_pct')::integer, 70);
  v_second_pct := coalesce((v_config.payout_structure->>'second_pct')::integer, 30);
  v_eff_prize  := coalesce((v_config.payout_structure->>'efficiency_prize')::integer, 0);
  v_dessert    := coalesce((v_config.payout_structure->>'dessert_penalty')::integer, 0);
  if v_first_pct + v_second_pct <> 100 then
    raise exception '1st + 2nd percentages must add up to 100 (rules page)';
  end if;

  -- Working ledger: one row per member, points/spent from the same
  -- winning-bids-on-active-films derivation as v_standings.
  drop table if exists _ledger;
  create temp table _ledger on commit drop as
  select
    sm.id                              as member_id,
    pr.display_name                    as display_name,
    coalesce(sum(f.score), 0)::numeric as points,
    coalesce(sum(b.amount), 0)::integer as spent,
    dense_rank() over (order by coalesce(sum(f.score), 0) desc)::integer as place,
    0::integer as place_won,
    0::integer as refund_won,
    0::integer as eff_won,
    0::integer as dessert_owed
  from season_members sm
  join profiles pr on pr.id = sm.profile_id
  left join (
    bids b
    join films f on f.id = b.film_id and f.status = 'active'
  ) on b.season_member_id = sm.id and b.is_winning
  where sm.season_id = p_season_id
  group by sm.id, pr.display_name;

  select count(*) into v_n from _ledger;
  if v_n = 0 then
    raise exception 'season has no members';
  end if;
  v_pot := v_config.buy_in * v_n;

  -- Dessert first (its penalty transfers to the efficiency winners below):
  -- worst pick = lowest-scoring OWNED captured film; its owners split the
  -- penalty (OQ-4: tied worst-pickers split the negative).
  select min(f.score) into v_worst_score
  from films f
  join weeks w on w.id = f.week_id
  where w.season_id = p_season_id
    and f.status = 'active' and f.captured_at is not null
    and exists (select 1 from bids b where b.film_id = f.id and b.is_winning);

  if v_worst_score is not null and v_dessert > 0 then
    drop table if exists _dessert;
    create temp table _dessert on commit drop as
    select distinct b.season_member_id as member_id
    from bids b
    join films f on f.id = b.film_id
    join weeks w on w.id = f.week_id
    where w.season_id = p_season_id
      and f.status = 'active' and f.captured_at is not null
      and f.score = v_worst_score
      and b.is_winning;

    update _ledger l
    set dessert_owed = v_dessert / x.cnt
                     + case when x.rn <= v_dessert % x.cnt then 1 else 0 end
    from (
      select d.member_id,
             row_number() over (order by l2.display_name, d.member_id) as rn,
             count(*) over ()::integer as cnt
      from _dessert d
      join _ledger l2 on l2.member_id = d.member_id
    ) x
    where x.member_id = l.member_id;
    v_dessert_out := v_dessert;

    select jsonb_agg(distinct f.title) into v_worst_films
    from films f
    join weeks w on w.id = f.week_id
    where w.season_id = p_season_id
      and f.status = 'active' and f.captured_at is not null
      and f.score = v_worst_score;
  end if;

  -- Efficiency award (rulebook §7.1): the single most efficient pick =
  -- highest score-per-dollar among winning bids on captured active films.
  -- Everyone holding a max-ratio pick splits prize + dessert transfer.
  select max(f.score / b.amount) into v_best_ratio
  from bids b
  join films f on f.id = b.film_id
  join weeks w on w.id = f.week_id
  where w.season_id = p_season_id
    and f.status = 'active' and f.captured_at is not null
    and b.is_winning;

  if v_best_ratio is not null then
    drop table if exists _eff;
    create temp table _eff on commit drop as
    select distinct b.season_member_id as member_id
    from bids b
    join films f on f.id = b.film_id
    join weeks w on w.id = f.week_id
    where w.season_id = p_season_id
      and f.status = 'active' and f.captured_at is not null
      and b.is_winning
      and f.score / b.amount = v_best_ratio;

    v_eff_out := v_eff_prize;
    update _ledger l
    set eff_won = (v_eff_prize + v_dessert_out) / x.cnt
                + case when x.rn <= (v_eff_prize + v_dessert_out) % x.cnt then 1 else 0 end
    from (
      select e.member_id,
             row_number() over (order by l2.display_name, e.member_id) as rn,
             count(*) over ()::integer as cnt
      from _eff e
      join _ledger l2 on l2.member_id = e.member_id
    ) x
    where x.member_id = l.member_id;

    select jsonb_agg(distinct f.title) into v_eff_films
    from bids b
    join films f on f.id = b.film_id
    join weeks w on w.id = f.week_id
    where w.season_id = p_season_id
      and f.status = 'active' and f.captured_at is not null
      and b.is_winning
      and f.score / b.amount = v_best_ratio;
  end if;

  -- 3rd place = one buy-in refunded, split among the members at place 3.
  if exists (select 1 from _ledger where place = 3) then
    v_third_out := v_config.buy_in;
    update _ledger l
    set refund_won = v_third_out / x.cnt
                   + case when x.rn <= v_third_out % x.cnt then 1 else 0 end
    from (
      select member_id,
             row_number() over (order by display_name, member_id) as rn,
             count(*) over ()::integer as cnt
      from _ledger where place = 3
    ) x
    where x.member_id = l.member_id;
  end if;

  -- 1st/2nd split what remains of the pot. 2nd rounds half-up; 1st takes the
  -- exact remainder, which is what keeps the ledger zero-sum (OQ-5 rounding).
  v_remainder := v_pot - v_third_out - v_eff_out;
  if v_remainder < 0 then
    raise exception 'the pot ($%) cannot cover the configured prizes ($%) — fix the rules first',
      v_pot, v_third_out + v_eff_out;
  end if;
  if exists (select 1 from _ledger where place = 2) then
    v_second_amt := round(v_remainder * v_second_pct / 100.0)::integer;
    v_first_amt  := v_remainder - v_second_amt;
    update _ledger l
    set place_won = v_second_amt / x.cnt
                  + case when x.rn <= v_second_amt % x.cnt then 1 else 0 end
    from (
      select member_id,
             row_number() over (order by display_name, member_id) as rn,
             count(*) over ()::integer as cnt
      from _ledger where place = 2
    ) x
    where x.member_id = l.member_id;
  else
    -- Everyone is tied for 1st (or there is one member): 1st takes it all.
    v_first_amt := v_remainder;
  end if;

  update _ledger l
  set place_won = place_won + v_first_amt / x.cnt
                + case when x.rn <= v_first_amt % x.cnt then 1 else 0 end
  from (
    select member_id,
           row_number() over (order by display_name, member_id) as rn,
           count(*) over ()::integer as cnt
    from _ledger where place = 1
  ) x
  where x.member_id = l.member_id;

  -- Zero-sum gate (build plan §5): total won must equal total owing.
  select sum(place_won + refund_won + eff_won),
         sum(v_config.buy_in + dessert_owed)
    into v_won_sum, v_owing_sum
  from _ledger;
  if v_won_sum <> v_owing_sum then
    raise exception 'settlement is not zero-sum (won $% vs owing $%) — refusing to write',
      v_won_sum, v_owing_sum;
  end if;

  delete from settlements where season_id = p_season_id and status = 'draft';

  insert into settlements (season_id, payout_snapshot)
  values (p_season_id, jsonb_build_object(
    'pot', v_pot,
    'buy_in', v_config.buy_in,
    'member_count', v_n,
    'first_amount', v_first_amt,
    'second_amount', v_second_amt,
    'third_refund', v_third_out,
    'efficiency_prize', v_eff_out,
    'dessert_penalty', v_dessert_out,
    'best_ratio', v_best_ratio,
    'efficiency_films', coalesce(v_eff_films, '[]'::jsonb),
    'worst_score', v_worst_score,
    'dessert_films', coalesce(v_worst_films, '[]'::jsonb),
    'total_won', v_won_sum,
    'total_owing', v_owing_sum))
  returning id into v_id;

  insert into settlement_lines (settlement_id, season_member_id, won, owing, net, breakdown)
  select
    v_id,
    member_id,
    place_won + refund_won + eff_won,
    v_config.buy_in + dessert_owed,
    (place_won + refund_won + eff_won) - (v_config.buy_in + dessert_owed),
    jsonb_build_object(
      'place', place,
      'points', points,
      'spent', spent,
      'place_won', place_won,
      'third_refund', refund_won,
      'efficiency_won', eff_won,
      'buy_in', v_config.buy_in,
      'dessert_owed', dessert_owed)
  from _ledger;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'generate_settlement',
          jsonb_build_object('settlement_id', v_id, 'pot', v_pot,
                             'total_won', v_won_sum, 'total_owing', v_owing_sum));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. finalize_settlement — draft → final, only once the season is completed
--    (update_season_status active → completed is the commissioner saying the
--    season is over). Finalizing reveals the ledger to every member via RLS.
-- ---------------------------------------------------------------------------
create or replace function public.finalize_settlement(p_settlement_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_settlement settlements%rowtype;
  v_season     seasons%rowtype;
begin
  select * into v_settlement from settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'settlement not found';
  end if;
  if not is_commissioner(v_settlement.season_id) then
    raise exception 'only the commissioner can finalize the settlement';
  end if;
  if v_settlement.status <> 'draft' then
    raise exception 'settlement is already final';
  end if;
  select * into v_season from seasons where id = v_settlement.season_id;
  if v_season.status not in ('completed', 'archived') then
    raise exception 'complete the season before finalizing the settlement (status: %)',
      v_season.status;
  end if;

  update settlements set status = 'final' where id = p_settlement_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_settlement.season_id, auth.uid(), 'finalize_settlement',
          jsonb_build_object('settlement_id', p_settlement_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS — drafts are the commissioner's workspace; finals are public to the
--    season. (Tables have been RLS-enabled with no policies since phase 1.)
-- ---------------------------------------------------------------------------
create policy settlements_select on public.settlements
  for select to authenticated
  using (
    public.is_commissioner(season_id)
    or (status = 'final' and public.is_season_member(season_id))
  );

create policy settlement_lines_select on public.settlement_lines
  for select to authenticated
  using (
    exists (
      select 1 from public.settlements s
      where s.id = settlement_lines.settlement_id
        and (public.is_commissioner(s.season_id)
             or (s.status = 'final' and public.is_season_member(s.season_id)))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Grants — ADR-004 deliberate exposure.
-- ---------------------------------------------------------------------------
grant select on public.settlements, public.settlement_lines to authenticated;

revoke all on function public.generate_settlement(uuid) from public, anon;
revoke all on function public.finalize_settlement(uuid)  from public, anon;
grant execute on function public.generate_settlement(uuid),
                          public.finalize_settlement(uuid)
  to authenticated;
