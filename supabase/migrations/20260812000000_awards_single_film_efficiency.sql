-- ---------------------------------------------------------------------------
-- Awards become one rule in two directions, and tied places consume the places
-- they occupy.  (Rulebook §7.1 and OQ-4, both rewritten 2026-08-12.)
--
-- THREE CHANGES, all of which move real money:
--
-- 1. THE DESSERT PRIZE IS NOW A RATIO, NOT A SCORE.  It was min(films.score) —
--    the lowest-scoring owned film — which measured a different thing from its
--    twin and produced results the game did not intend.  Scoring it on the
--    lowest-scoring FILM punishes owning a small film cheaply, and a $1 flyer
--    that returns almost nothing is not a bad decision, it is a cheap one.
--    Season 31 is the proof: the lowest-scoring film was Kiss of the Spider
--    Woman, owned for $2 at 0.34 pts/$; the season's genuinely worst pick was
--    $28 on Merrily We Roll Along for 1.24 points — 0.04 pts/$ — which the old
--    rule could not even see.  Both awards are now the best and worst
--    SINGLE-FILM points-per-dollar over the same qualifying set.
--
-- 2. BIDS AT THE SEASON MINIMUM NO LONGER QUALIFY, for either award.  This is
--    not new behaviour in the pool, only newly written down: Season 32's Best
--    Efficiency went to Crime 101 at $2 (6.04) even though The Undertone scored
--    6.16 on $1 bids, which is only explicable if minimum bids never qualified.
--    The reason is sound — a minimum bid on any halfway decent film wins the
--    award almost automatically — and applying it to the Dessert side keeps the
--    two symmetric.
--
-- 3. TIED PAYING PLACES CONSUME THE PLACES THEY OCCUPY AND SPLIT THE COMBINED
--    MONEY.  Two players tied for 1st hold 1st AND 2nd between them: they split
--    both prizes and the next player down is 3rd, not 2nd.  Previously they
--    split 1st only and a third player collected 2nd, which paid out the same
--    total to the wrong people.  The money ladder therefore runs on rank()
--    (which skips, so positions are consumed) while the DISPLAYED place stays
--    dense_rank() per ADR-028.
--
-- Also fixed here, both previously flagged and deliberately deferred:
--   - The dessert title list was built without an is_winning filter, so an
--     UNOWNED film scoring exactly the worst value was named alongside the real
--     one.  Both lists now come from the same owned set, so it cannot recur.
--   - Leftover whole dollars were distributed in display_name order.  A display
--     name is never a key (ADR-082) and changes when someone renames themselves;
--     the order is now season_member_id, which is arbitrary but stable.
--
-- worst_score is RENAMED to worst_ratio.  It is no longer a score and rendering
-- it as "pts" would be a lie, so the column changes name and every reader with
-- it.  A view column cannot be renamed by CREATE OR REPLACE, hence the drop.
-- ---------------------------------------------------------------------------

drop view if exists public.v_season_awards;

create view public.v_season_awards
with (security_invoker = true)
as
with cfg as (
  -- min_bid comes from settings_for_season so the season/league fallback has
  -- exactly one implementation.  One call per season, not per bid.
  select s.id as season_id,
         coalesce((public.settings_for_season(s.id)).min_bid, 1) as min_bid
  from seasons s
),
owned as (
  -- Every winning bid on an active, captured film, ABOVE the season minimum.
  -- An uncaptured film has a NULL score and must not win or lose an award.
  select
    w.season_id,
    f.title,
    f.score,
    b.amount,
    b.season_member_id,
    f.score / b.amount as ratio
  from bids b
  join films f on f.id = b.film_id
  join weeks w on w.id = f.week_id
  join cfg   c on c.season_id = w.season_id
  where b.is_winning
    and f.status = 'active'
    and f.captured_at is not null
    and b.amount > c.min_bid
),
extremes as (
  select season_id,
         max(ratio) as best_ratio,
         min(ratio) as worst_ratio
  from owned
  group by season_id
)
select
  e.season_id,
  e.best_ratio,
  e.worst_ratio,
  (select coalesce(jsonb_agg(distinct o.title), '[]'::jsonb)
     from owned o
    where o.season_id = e.season_id and o.ratio = e.best_ratio)   as efficiency_films,
  (select coalesce(array_agg(distinct o.season_member_id), '{}'::uuid[])
     from owned o
    where o.season_id = e.season_id and o.ratio = e.best_ratio)   as efficiency_member_ids,
  (select coalesce(jsonb_agg(distinct o.title), '[]'::jsonb)
     from owned o
    where o.season_id = e.season_id and o.ratio = e.worst_ratio)  as dessert_films,
  (select coalesce(array_agg(distinct o.season_member_id), '{}'::uuid[])
     from owned o
    where o.season_id = e.season_id and o.ratio = e.worst_ratio)  as dessert_member_ids
from extremes e;

comment on view public.v_season_awards is
  'Best Efficiency and the Dessert Prize (rulebook 7.1, rewritten 2026-08-12): '
  'the highest and lowest SINGLE-FILM points-per-dollar of the season, over '
  'winning bids ABOVE the season minimum on active captured films. One rule in '
  'two directions, so both title lists come from the same owned set. Distinct '
  'from v_standings.efficiency, which is a player season-long points/dollars.';

grant select on public.v_season_awards to authenticated;

-- ---------------------------------------------------------------------------
-- generate_settlement — slot-based ladder, stable tie-break, worst_ratio.
-- ---------------------------------------------------------------------------
create or replace function public.generate_settlement(p_season_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_config      league_settings%rowtype;
  v_buy_in      integer;
  v_awards      v_season_awards%rowtype;
  v_first_pct   integer;
  v_second_pct  integer;
  v_eff_pct     integer;
  v_dessert_pct integer;
  v_third_mode  text;
  v_third_pct   integer;
  v_eff_prize   integer;
  v_dessert     integer;
  v_n           integer;
  v_pot         integer;
  v_third_out   integer := 0;
  v_eff_out     integer := 0;
  v_dessert_out integer := 0;
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
  v_config := settings_for_season(p_season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;
  if exists (select 1 from settlements
             where season_id = p_season_id and status = 'final') then
    raise exception 'this season already has a final settlement';
  end if;

  v_buy_in := case when v_config.league_type = 'practice' then 0
                   else v_config.buy_in end;

  v_first_pct   := coalesce((v_config.payout_structure->>'first_pct')::integer, 70);
  v_second_pct  := coalesce((v_config.payout_structure->>'second_pct')::integer, 30);
  v_third_mode  := coalesce(v_config.payout_structure->>'third', 'buy_in_refund');
  v_third_pct   := coalesce((v_config.payout_structure->>'third_pct')::integer, 0);
  v_eff_pct     := case when v_config.side_bets_enabled and v_config.league_type = 'cash'
                        then coalesce((v_config.payout_structure->>'efficiency_prize')::integer, 0)
                        else 0 end;
  v_dessert_pct := case when v_config.side_bets_enabled and v_config.league_type = 'cash'
                        then coalesce((v_config.payout_structure->>'dessert_penalty')::integer, 0)
                        else 0 end;
  if v_first_pct + v_second_pct <> 100 then
    raise exception '1st + 2nd percentages must add up to 100 (rules page)';
  end if;

  select * into v_awards from v_season_awards where season_id = p_season_id;

  -- place = dense_rank, the app-wide DISPLAY model (ADR-028).
  -- slot  = rank, the MONEY ladder: it skips, so a tie consumes the positions
  --         it occupies and the next player starts below them.
  drop table if exists _ledger;
  create temp table _ledger on commit drop as
  select
    sm.id                              as member_id,
    pr.display_name                    as display_name,
    coalesce(sum(f.score), 0)::numeric as points,
    coalesce(sum(b.amount), 0)::integer as spent,
    dense_rank() over (order by coalesce(sum(f.score), 0) desc)::integer as place,
    rank()       over (order by coalesce(sum(f.score), 0) desc)::integer as slot,
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
  v_pot := v_buy_in * v_n;

  v_eff_prize := round(v_pot * v_eff_pct     / 100.0)::integer;
  v_dessert   := round(v_pot * v_dessert_pct / 100.0)::integer;

  -- Dessert penalty: split evenly across the tied worst pickers.
  -- Leftover dollars go one each in member_id order — arbitrary but STABLE,
  -- and not derived from a display name (ADR-082).
  if v_awards.worst_ratio is not null and v_dessert > 0 then
    update _ledger l
    set dessert_owed = v_dessert / x.cnt
                     + case when x.rn <= v_dessert % x.cnt then 1 else 0 end
    from (
      select d.member_id,
             row_number() over (order by d.member_id) as rn,
             count(*) over ()::integer as cnt
      from unnest(v_awards.dessert_member_ids) as d(member_id)
      join _ledger l2 on l2.member_id = d.member_id
    ) x
    where x.member_id = l.member_id;
    v_dessert_out := v_dessert;
    v_worst_films := v_awards.dessert_films;
  end if;

  -- Efficiency prize, plus the dessert penalty transferred to it.
  if v_awards.best_ratio is not null then
    v_eff_out := v_eff_prize;
    update _ledger l
    set eff_won = (v_eff_prize + v_dessert_out) / x.cnt
                + case when x.rn <= (v_eff_prize + v_dessert_out) % x.cnt then 1 else 0 end
    from (
      select e.member_id,
             row_number() over (order by e.member_id) as rn,
             count(*) over ()::integer as cnt
      from unnest(v_awards.efficiency_member_ids) as e(member_id)
      join _ledger l2 on l2.member_id = e.member_id
    ) x
    where x.member_id = l.member_id;
    v_eff_films := v_awards.efficiency_films;
  end if;

  -- A position is occupied whenever the roster reaches it: N members fill
  -- positions 1..N, whatever the ties do to their rank LABELS.
  if v_n >= 3 then
    v_third_out := case when v_third_mode = 'custom'
                        then round(v_pot * v_third_pct / 100.0)::integer
                        else v_buy_in end;
  end if;

  v_remainder := v_pot - v_third_out - v_eff_out;
  if v_remainder < 0 then
    raise exception 'the pot ($%) cannot cover the configured prizes ($%) — fix the rules first',
      v_pot, v_third_out + v_eff_out;
  end if;
  if v_n >= 2 then
    v_second_amt := round(v_remainder * v_second_pct / 100.0)::integer;
    v_first_amt  := v_remainder - v_second_amt;
  else
    v_first_amt  := v_remainder;
  end if;

  -- Pay each rank GROUP the sum of the positions it occupies: a group at rank r
  -- with n members holds positions r .. r+n-1.  Place money (positions 1-2) and
  -- the third-place refund stay separate columns so the breakdown still reads.
  update _ledger l
  set place_won  = t.place_share,
      refund_won = t.refund_share
  from (
    select
      m.member_id,
      (g.place_total  / g.n) + case when m.rn <= g.place_total  % g.n then 1 else 0 end as place_share,
      (g.refund_total / g.n) + case when m.rn <= g.refund_total % g.n then 1 else 0 end as refund_share
    from (
      select member_id, slot,
             row_number() over (partition by slot order by member_id) as rn
      from _ledger
    ) m
    join (
      select gr.slot, gr.n,
             (select coalesce(sum(case p when 1 then v_first_amt
                                         when 2 then v_second_amt
                                         else 0 end), 0)::integer
                from generate_series(gr.slot, gr.slot + gr.n - 1) as p) as place_total,
             (select coalesce(sum(case when p = 3 then v_third_out else 0 end), 0)::integer
                from generate_series(gr.slot, gr.slot + gr.n - 1) as p) as refund_total
      from (select slot, count(*)::integer as n from _ledger group by slot) gr
    ) g on g.slot = m.slot
  ) t
  where t.member_id = l.member_id;

  select sum(place_won + refund_won + eff_won),
         sum(v_buy_in + dessert_owed)
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
    'buy_in', v_buy_in,
    'member_count', v_n,
    'first_amount', v_first_amt,
    'second_amount', v_second_amt,
    'third_refund', v_third_out,
    'efficiency_prize', v_eff_out,
    'dessert_penalty', v_dessert_out,
    'best_ratio', v_awards.best_ratio,
    'efficiency_films', coalesce(v_eff_films, '[]'::jsonb),
    'worst_ratio', v_awards.worst_ratio,
    'dessert_films', coalesce(v_worst_films, '[]'::jsonb),
    'total_won', v_won_sum,
    'total_owing', v_owing_sum))
  returning id into v_id;

  insert into settlement_lines (settlement_id, season_member_id, won, owing, net, breakdown)
  select
    v_id,
    member_id,
    place_won + refund_won + eff_won,
    v_buy_in + dessert_owed,
    (place_won + refund_won + eff_won) - (v_buy_in + dessert_owed),
    jsonb_build_object(
      'place', place,
      'points', points,
      'spent', spent,
      'place_won', place_won,
      'third_refund', refund_won,
      'efficiency_won', eff_won,
      'buy_in', v_buy_in,
      'dessert_owed', dessert_owed)
  from _ledger;

  return v_id;
end;
$$;

revoke all on function public.generate_settlement(uuid) from public, anon;
grant execute on function public.generate_settlement(uuid) to authenticated;
