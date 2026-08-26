-- ============================================================================
-- Every payout is a PERCENTAGE OF THE POT. Only the buy-in is a dollar figure.
--
-- Before this, first_pct and second_pct were percentages while efficiency_prize
-- and dessert_penalty were flat dollar amounts, and third place was hard-wired
-- to "one buy-in back" with no way to change it. So one rules screen mixed two
-- units, and a league that doubled its buy-in silently halved the relative
-- weight of its side bets — the prizes did not move with the pot they came out
-- of. Percentages everywhere make the structure scale-free: the same rules
-- describe a $10 league and a $100 one.
--
-- THIRD PLACE gains a mode. `third` was already a string in payout_structure
-- ("buy_in_refund") and is now honoured rather than ignored:
--   'buy_in_refund' — one buy-in back, exactly the old behaviour and still the
--                     default, so an untouched league settles identically.
--   'custom'        — third_pct percent of the pot.
--
-- WHAT DOES NOT CHANGE, and this is the load-bearing part: the settlement stays
-- ZERO-SUM, and it stays so for the same reason as before. Third place and the
-- efficiency prize are carved out of the pot FIRST; what is left is the
-- remainder that 1st and 2nd split. So first_pct + second_pct must still total
-- 100 — they are 100% of the REMAINDER, not of the pot — and adding a third
-- percentage does not touch that constraint. The dessert penalty is still an
-- extra owing that transfers to the efficiency winners, cancelling exactly
-- because both sides use the same integer. The existing zero-sum assertion at
-- the end is unchanged and still the real guard.
--
-- One reordering was required: the percentages need the pot, and the pot needs
-- the member count, so the prize derivation moves BELOW the ledger build. The
-- body is otherwise the 20260803030000 definition verbatim — re-declaring a
-- function means starting from the CURRENT one, which is a lesson this project
-- has already paid for once (20260804010000).
-- ============================================================================
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

  -- ADR-059 wizard knobs. Practice league: every dollar is zero, places still
  -- computed, so completion runs the same path with nothing owed.
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
  -- 100% of the REMAINDER, not of the pot. See the header.
  if v_first_pct + v_second_pct <> 100 then
    raise exception '1st + 2nd percentages must add up to 100 (rules page)';
  end if;

  select * into v_awards from v_season_awards where season_id = p_season_id;

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
  v_pot := v_buy_in * v_n;

  -- The percentages resolve to dollars HERE, because they are percentages of
  -- the pot and the pot needs the member count. This is the one reordering
  -- against the previous definition.
  v_eff_prize := round(v_pot * v_eff_pct     / 100.0)::integer;
  v_dessert   := round(v_pot * v_dessert_pct / 100.0)::integer;

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

  if exists (select 1 from _ledger where place = 3) then
    -- 'buy_in_refund' keeps the old wiring exactly, which is why an untouched
    -- league settles to the same numbers it did before this migration.
    v_third_out := case when v_third_mode = 'custom'
                        then round(v_pot * v_third_pct / 100.0)::integer
                        else v_buy_in end;
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

-- The stored default moves to percentages too, so a league created from here on
-- starts scale-free. The old flat values (50 and 10 DOLLARS) become 15% and 3%
-- — chosen to land near the same money at the 6-player, $35 buy-in shape the
-- default buy-in describes ($210 pot -> $31.50 and $6.30), rather than pretending
-- a dollar figure and a percentage were ever the same number.
alter table public.league_settings
  alter column payout_structure set default
    '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "third_pct": 0,
      "efficiency_prize": 15, "dessert_penalty": 3}'::jsonb;

-- EXISTING leagues are deliberately NOT rewritten. Their stored numbers were
-- entered as dollars, and silently reinterpreting "50" as 50% of the pot would
-- change what those leagues pay out without anyone asking for it. They keep
-- their values and the commissioner re-enters them as percentages on the rules
-- screen, which now says what unit it wants.
comment on column public.league_settings.payout_structure is
  'first_pct/second_pct: percent of the REMAINDER (must total 100). third: '
  '"buy_in_refund" | "custom"; third_pct applies only to "custom". '
  'efficiency_prize/dessert_penalty: percent OF THE POT. Only buy_in is dollars.';
