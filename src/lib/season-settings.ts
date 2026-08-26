import type { SupabaseClient } from "@/lib/supabase";

// The season settings a wizard collects, and where a new season's defaults come
// from (ADR-078). Kept out of the client field component so a server helper can
// share the type and the rulebook constant without pulling a client boundary.

export type SeasonSettingsDefaults = {
  fake_bankroll: number;
  default_season_length: number;
  top_n_distinct: number;
  min_bid: number;
  bids_due_dow: number;
  /** "HH:MM". */
  bids_due_time: string;
  bids_due_tz: string;
  buy_in: number;
  first_pct: number;
  second_pct: number;
  /** "buy_in_refund" | "custom". */
  third: string;
  third_pct: number;
  side_bets_enabled: boolean;
  efficiency_prize: number;
  dessert_penalty: number;
};

// What a league's FIRST season starts from.
export const RULEBOOK_SEASON_DEFAULTS: SeasonSettingsDefaults = {
  fake_bankroll: 100,
  default_season_length: 10,
  top_n_distinct: 3,
  min_bid: 1,
  bids_due_dow: 4,
  bids_due_time: "12:00",
  bids_due_tz: "America/New_York",
  buy_in: 35,
  first_pct: 70,
  second_pct: 30,
  third: "buy_in_refund",
  third_pct: 0,
  side_bets_enabled: true,
  efficiency_prize: 15,
  dessert_penalty: 3,
};

type PayoutStructure = {
  first_pct?: number;
  second_pct?: number;
  third?: string;
  third_pct?: number;
  efficiency_prize?: number;
  dessert_penalty?: number;
};

// The defaults the NEW-season wizard opens on: the PREVIOUS season's settings
// (the most recent season of the league), or the rulebook if this is the first.
// Also returns the league's type, since the prize-money fields read differently
// for a practice league.
export async function getNextSeasonDefaults(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<{ leagueType: "cash" | "practice"; defaults: SeasonSettingsDefaults }> {
  const { data: league } = await supabase
    .from("league_settings")
    .select("league_type")
    .eq("league_id", leagueId)
    .maybeSingle();
  const leagueType: "cash" | "practice" =
    league?.league_type === "practice" ? "practice" : "cash";

  const { data: prev } = await supabase
    .from("seasons")
    .select(
      "created_at, season_settings(fake_bankroll, default_season_length, top_n_distinct, min_bid, bids_due_dow, bids_due_time, bids_due_tz, buy_in, payout_structure, side_bets_enabled)",
    )
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const raw = prev?.season_settings as unknown;
  const row = (Array.isArray(raw) ? raw[0] : raw) as
    | (Omit<SeasonSettingsDefaults, "first_pct" | "second_pct" | "third" | "third_pct" | "efficiency_prize" | "dessert_penalty"> & {
        payout_structure: PayoutStructure | null;
      })
    | undefined;

  if (!row) return { leagueType, defaults: RULEBOOK_SEASON_DEFAULTS };

  const p = row.payout_structure ?? {};
  return {
    leagueType,
    defaults: {
      fake_bankroll: row.fake_bankroll,
      default_season_length: row.default_season_length,
      top_n_distinct: row.top_n_distinct,
      min_bid: row.min_bid,
      bids_due_dow: row.bids_due_dow,
      bids_due_time: row.bids_due_time,
      bids_due_tz: row.bids_due_tz,
      buy_in: row.buy_in,
      first_pct: p.first_pct ?? RULEBOOK_SEASON_DEFAULTS.first_pct,
      second_pct: p.second_pct ?? RULEBOOK_SEASON_DEFAULTS.second_pct,
      third: p.third ?? RULEBOOK_SEASON_DEFAULTS.third,
      third_pct: p.third_pct ?? RULEBOOK_SEASON_DEFAULTS.third_pct,
      side_bets_enabled: row.side_bets_enabled,
      efficiency_prize: p.efficiency_prize ?? RULEBOOK_SEASON_DEFAULTS.efficiency_prize,
      dessert_penalty: p.dessert_penalty ?? RULEBOOK_SEASON_DEFAULTS.dessert_penalty,
    },
  };
}
