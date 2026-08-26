-- Corrects the payout literal in 20260802100000.
--
-- `league_rule_defaults.payout_structure` was given a hand-written default of
-- efficiency_prize 0 / dessert_penalty 0. That is not the app's default and
-- never was: phase 3 seeds every rule_config with the OQ-5 payout hypothesis
-- (70/30, $50 efficiency prize, $10 dessert penalty), and since create_season
-- now COPIES the league's answer sheet instead of falling back to the column
-- defaults, the invented literal became what every new season inherited.
--
-- Caught by spike:phase3, which asserts the seeded hypothesis by value — the
-- migration itself pushed clean, and the app typechecked and linted green. A
-- default is only wrong in the eyes of something that knows what it should be.
--
-- The backfill is written to touch ONLY rows still carrying the exact wrong
-- literal, so a league that has deliberately configured a 0/0 payout since is
-- left alone rather than silently re-prized.

alter table public.league_rule_defaults
  alter column payout_structure set default
    '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "efficiency_prize": 50, "dessert_penalty": 10}'::jsonb;

update public.league_rule_defaults
set payout_structure =
  '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "efficiency_prize": 50, "dessert_penalty": 10}'::jsonb
where payout_structure =
  '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "efficiency_prize": 0, "dessert_penalty": 0}'::jsonb;
