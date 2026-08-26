-- ============================================================================
-- ADR-029 — Fun awards derive from ONE security_invoker view (v_season_awards)
--
-- Sources of truth:
--   Docs/reference/movie_pool_official_rules.md §7.1 (secondary awards)
--   .pp-context/memory/decisions.md ADR-013 (the security_invoker view pattern)
--                                   ADR-015 (settlement engine)
--                                   ADR-029 (this change)
--
-- WHY THIS EXISTS
-- The Leaderboard (ADR-023) shows the Best Efficiency + Dessert awards
-- PROVISIONALLY while the season runs; the settlement page shows them
-- finalized, for real money. Until now the two rules existed only inside
-- generate_settlement — a commissioner-only SECURITY DEFINER RPC whose drafts
-- a player cannot even read. So the Leaderboard had no way to reach them, and
-- the only alternatives were to duplicate the rules in TypeScript (they would
-- drift, and a drift shows a player an award all season then pays them
-- nothing) or to drop the provisional awards.
--
-- This extracts both rules into one view. The Leaderboard reads it directly;
-- generate_settlement below is refactored to read the SAME view instead of
-- carrying its own copies. One definition, two readers, no drift possible.
--
-- WHY security_invoker IS SAFE FOR BOTH CALLERS (this is the load-bearing bit)
-- The awards only ever concern WINNING bids on CAPTURED, ACTIVE films.
-- capture_film auto-flips its week to 'scored' (ADR-012), and a scored week's
-- bid amounts are already readable by every season member (ADR-003/ADR-022).
-- So the rows a player's RLS lets them see here are exactly the rows the
-- definer sees. The two reads provably coincide — which is what makes a single
-- definition correct for a player preview AND for the money.
--   • Read by a player  → runs under their RLS → scored-week bids → same rows.
--   • Read inside generate_settlement (SECURITY DEFINER) → runs as the owner,
--     which is precisely what the inlined queries did before. No change.
-- Open weeks can never leak: is_winning is NULL until resolve_week, and the
-- `b.is_winning` predicate drops those rows before the view sees an amount.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. v_season_awards — one row per season that has at least one owned,
--    captured film. Seasons with none return NO row, which plpgsql's
--    SELECT INTO renders as NULLs — the same state the old inlined
--    `select max(...) into v_best_ratio` produced, so both awards skip.
-- ---------------------------------------------------------------------------
create or replace view public.v_season_awards
with (security_invoker = true)
as
with owned as (
  -- Every winning bid on an active, captured film, tagged with its season.
  -- This is the same derivation v_standings (ADR-013) sums over, plus the
  -- bid amount (needed for the ratio) and captured_at (an uncaptured film has
  -- a NULL score and must not win or lose an award).
  select
    w.season_id,
    f.title,
    f.score,
    b.amount,
    b.season_member_id
  from bids b
  join films f on f.id = b.film_id
  join weeks w on w.id = f.week_id
  where b.is_winning
    and f.status = 'active'
    and f.captured_at is not null
),
captured as (
  -- Every captured active film, OWNED OR NOT.
  -- Deliberate: this reproduces a quirk of the pre-ADR-029 code exactly. The
  -- dessert TITLE list was built without an is_winning filter, so an UNOWNED
  -- film that happens to score exactly the worst owned score gets named
  -- alongside it. Only the title list is affected — who PAYS the penalty has
  -- always come from `owned` and still does. Preserved rather than fixed so
  -- this migration is a pure extraction with no behaviour change; correcting
  -- it is a separate decision for the rule owner.
  select w.season_id, f.title, f.score
  from films f
  join weeks w on w.id = f.week_id
  where f.status = 'active'
    and f.captured_at is not null
),
extremes as (
  -- Best pick = highest points-per-dollar on ONE film (rulebook §7.1's "Best
  -- Efficiency Award"). NOT the same metric as v_standings.efficiency, which
  -- is a player's season-long points ÷ dollars. Two different things the
  -- rulebook gives near-identical names; see ADR-029.
  -- Worst pick = lowest score among OWNED captured films (the Dessert Prize).
  select
    season_id,
    max(score / amount) as best_ratio,
    min(score)          as worst_score
  from owned
  group by season_id
)
select
  e.season_id,
  e.best_ratio,
  e.worst_score,
  (select coalesce(jsonb_agg(distinct o.title), '[]'::jsonb)
     from owned o
    where o.season_id = e.season_id
      and o.score / o.amount = e.best_ratio)          as efficiency_films,
  (select coalesce(array_agg(distinct o.season_member_id), '{}'::uuid[])
     from owned o
    where o.season_id = e.season_id
      and o.score / o.amount = e.best_ratio)          as efficiency_member_ids,
  (select coalesce(jsonb_agg(distinct c.title), '[]'::jsonb)
     from captured c
    where c.season_id = e.season_id
      and c.score = e.worst_score)                    as dessert_films,
  (select coalesce(array_agg(distinct o.season_member_id), '{}'::uuid[])
     from owned o
    where o.season_id = e.season_id
      and o.score = e.worst_score)                    as dessert_member_ids
from extremes e;

comment on view public.v_season_awards is
  'ADR-029: the single definition of the rulebook §7.1 fun awards (Best '
  'Efficiency = best single pick by points-per-dollar; Dessert = worst owned '
  'pick). Read by the Leaderboard for the PROVISIONAL awards and by '
  'generate_settlement for the real money, so the two can never disagree.';

grant select on public.v_season_awards to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. generate_settlement — REFACTOR ONLY. Identical ledger, identical
--    snapshot, identical zero-sum guarantee (ADR-015 is untouched). The only
--    change: the two award rules and their winner/title lists now come from
--    v_season_awards instead of six inlined queries and two temp tables.
--    Proven by npm run spike:phase9 (the Season 30 golden ledger + OQ-4 ties),
--    which must pass UNCHANGED — that is the point (ADR-026).
-- ---------------------------------------------------------------------------
create or replace function public.generate_settlement(p_season_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_config      rule_configs%rowtype;
  v_awards      v_season_awards%rowtype;  -- ADR-029: all awards, one read
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

  -- ADR-029: both awards, their winners and their film titles in one read.
  -- No row (a season with nothing owned+captured yet) leaves every field NULL,
  -- exactly as the old `select max(...) into` did, so both awards skip below.
  select * into v_awards from v_season_awards where season_id = p_season_id;

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
  if v_awards.worst_score is not null and v_dessert > 0 then
    update _ledger l
    set dessert_owed = v_dessert / x.cnt
                     + case when x.rn <= v_dessert % x.cnt then 1 else 0 end
    from (
      select d.member_id,
             row_number() over (order by l2.display_name, d.member_id) as rn,
             count(*) over ()::integer as cnt
      from unnest(v_awards.dessert_member_ids) as d(member_id)
      join _ledger l2 on l2.member_id = d.member_id
    ) x
    where x.member_id = l.member_id;
    v_dessert_out := v_dessert;
    v_worst_films := v_awards.dessert_films;
  end if;

  -- Efficiency award (rulebook §7.1): the single most efficient pick =
  -- highest score-per-dollar among winning bids on captured active films.
  -- Everyone holding a max-ratio pick splits prize + dessert transfer.
  if v_awards.best_ratio is not null then
    v_eff_out := v_eff_prize;
    update _ledger l
    set eff_won = (v_eff_prize + v_dessert_out) / x.cnt
                + case when x.rn <= (v_eff_prize + v_dessert_out) % x.cnt then 1 else 0 end
    from (
      select e.member_id,
             row_number() over (order by l2.display_name, e.member_id) as rn,
             count(*) over ()::integer as cnt
      from unnest(v_awards.efficiency_member_ids) as e(member_id)
      join _ledger l2 on l2.member_id = e.member_id
    ) x
    where x.member_id = l.member_id;
    v_eff_films := v_awards.efficiency_films;
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
    'best_ratio', v_awards.best_ratio,
    'efficiency_films', coalesce(v_eff_films, '[]'::jsonb),
    'worst_score', v_awards.worst_score,
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

revoke all on function public.generate_settlement(uuid) from public, anon;
