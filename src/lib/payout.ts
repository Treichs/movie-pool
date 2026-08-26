import type { LeagueSettings } from "@/lib/commish";
import { RULEBOOK_SEASON_DEFAULTS } from "@/lib/season-settings";
import type { SeasonSettingsDefaults } from "@/lib/season-settings";

/**
 * WHAT THE SEASON IS PLAYING FOR, before it is decided.
 *
 * A MIRROR OF THE SQL, and the SQL stays authoritative. `finalize_settlement`
 * (20260712170000) computes the real ledger and writes a payout_snapshot; this
 * reproduces its arithmetic so the leaderboard can show the prize ladder while
 * the season is still running, when no settlement exists to read.
 *
 * That makes it exactly the kind of second implementation that produced the
 * buildRank divergence, so two things guard it: the steps below are in the same
 * order as the SQL with the same rounding, and the unit tests assert the
 * Season 30 golden case the migration's own header documents. If the SQL's
 * split changes, these tests are what should fail.
 *
 * It is a PROJECTION, never a promise. Nobody is owed anything until the
 * commissioner finalizes, which is why nothing here is stored and why the
 * leaderboard labels it as what the places are worth rather than what anyone
 * has won.
 */
export type PayoutLadder = {
  pot: number;
  first: number;
  second: number;
  /** A buy-in refund under the default rules — third places "get their money
   *  back" rather than winning a share. Zero when the season has no third. */
  third: number;
  /** The Best Efficiency prize, off the top before 1st and 2nd split. */
  efficiency: number;
  /**
   * The Dessert penalty — what the worst pick's owner(s) PAY, split if tied
   * (OQ-4). It never touches the remainder math: it is collected on top of the
   * pot and transferred to the efficiency winner, which is why it is the one
   * negative number on the ladder.
   */
  dessert: number;
};

/**
 * @param memberCount how many people are in the season — the pot is per head.
 * @param places how many distinct finishing places will exist. Below three
 *   there is no third-place refund to pay, and below two no second share; a
 *   four-person league does not owe prizes it has no winners for.
 */
export function projectedPayouts(
  settings: SeasonSettingsDefaults,
  memberCount: number,
  places = 3,
): PayoutLadder | null {
  // A practice league plays for nothing. Returning null rather than a ladder of
  // zeros is what lets the caller render nothing at all.
  if (settings.buy_in <= 0 || memberCount <= 0) return null;

  const pot = settings.buy_in * memberCount;

  // Order matters and follows the SQL exactly: the third-place refund and the
  // efficiency prize come off the top, and 1st/2nd split only what is left.
  const third =
    places < 3
      ? 0
      : settings.third === "custom"
        ? Math.round((pot * settings.third_pct) / 100)
        : // 'buy_in_refund' keeps the historical wiring: one buy-in back, not a
          // share of the pot.
          settings.buy_in;

  // efficiency_prize IS A PERCENTAGE OF THE POT, not a dollar figure — changed
  // by 20260804040000 and easy to get wrong, because the rulebook default of 15
  // reads like $15 and on a ten-player $35 league resolves to $52. Getting this
  // backwards was the first version of this file.
  const efficiency = settings.side_bets_enabled
    ? Math.round((pot * settings.efficiency_prize) / 100)
    : 0;

  const remainder = pot - third - efficiency;
  // The SQL raises here rather than paying a negative prize. A projection has
  // no business throwing on a page render, so it reports the impossibility as
  // "no ladder" and the commissioner's own settlement page is where the error
  // belongs.
  if (remainder < 0) return null;

  // Second rounds half-up and FIRST TAKES THE EXACT REMAINDER — that asymmetry
  // is what keeps the ledger zero-sum (OQ-5 rounding), and reversing it would
  // leave a dollar unaccounted for on odd splits.
  const second =
    places >= 2 ? Math.round((remainder * settings.second_pct) / 100) : 0;
  const first = remainder - second;

  // Same shape as the efficiency prize — a percentage of the pot, live only
  // when side bets are (migration 20260804040000 changed both from flat
  // dollars at once). Computed AFTER the remainder because it never enters it.
  const dessert = settings.side_bets_enabled
    ? Math.round((pot * settings.dessert_penalty) / 100)
    : 0;

  return { pot, first, second, third, efficiency, dessert };
}

/**
 * The projected ladder for one season, from its LEAGUE SETTINGS — the shape
 * every page actually has in hand, rather than the defaults-merged object
 * projectedPayouts wants.
 *
 * This lived inline on the leaderboard page. It is here instead because the
 * header above is emphatic that this arithmetic mirrors the settlement SQL and
 * is guarded by the unit tests beside it — the merge, the fallbacks and the
 * places cap are part of that mirror, and a page component is not where any of
 * it should be spelled out.
 *
 * Null on a practice league: nothing is being played for, and the callers
 * render no prize figures at all rather than a ladder of zeros.
 */
export function seasonLadder(
  settings: LeagueSettings | null,
  playerCount: number,
): PayoutLadder | null {
  if (!settings || settings.league_type !== "cash") return null;
  return projectedPayouts(
    {
      ...RULEBOOK_SEASON_DEFAULTS,
      buy_in: settings.buy_in,
      side_bets_enabled: settings.side_bets_enabled,
      second_pct: settings.payout_structure?.second_pct ?? 30,
      third: settings.payout_structure?.third ?? "buy_in_refund",
      third_pct: settings.payout_structure?.third_pct ?? 0,
      efficiency_prize: settings.payout_structure?.efficiency_prize ?? 0,
      dessert_penalty:
        settings.payout_structure?.dessert_penalty ??
        RULEBOOK_SEASON_DEFAULTS.dessert_penalty,
    },
    playerCount,
    // Distinct places that will actually exist — a four-person league still
    // has three, a two-person one does not.
    Math.min(3, playerCount),
  );
}
