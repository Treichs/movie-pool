import "server-only";

import type { SeasonContext } from "@/lib/auth";
import { getOverdueWeeks, getSeasonLeague, type OverdueWeek } from "@/lib/commish";
import { getLeaderboard, type LeaderboardData } from "@/lib/leaderboard";
import { getSeasonHub, type SeasonHub } from "@/lib/season-hub";
import { getSeasonOptions, type SeasonOption } from "@/lib/season-schedule";

/**
 * SEASON HOME — the composer for `/seasons/[seasonId]`, the largest read screen
 * in the app and the one `chooseLandingPath` prefers above every other.
 *
 * ── IT COMPOSES; IT DOES NOT QUERY ────────────────────────────────────────
 * Every read here was already written and every one of them has a caller
 * somewhere else — except one. `getSeasonHub` carries the weeks, the slate, the
 * viewer's standing and the season table; `getLeaderboard` carries the rows,
 * the provisional awards, the bump-chart series and the film rail. Nothing is
 * re-derived.
 *
 * ── THE QUEUE, WHICH HAS NEVER BEEN RENDERED ──────────────────────────────
 * `getOverdueWeeks` has sat in `commish.ts` with **zero consumers** — a
 * composer with no UI, which is exactly the thing the plan's closing check
 * exists to catch. It is called here, behind the role check, and this screen is
 * its first appearance.
 *
 * Its rule, from its own comment: a week whose opening weekend has passed,
 * whose status is neither `final` nor `skipped`, and whose eligible films still
 * have no `captured_at`. **A week still marked `open` past its opening weekend
 * counts** — that combination is a deadline that did not fire, and surfacing it
 * is the whole point.
 *
 * ── THE ROLE GATE IS A READ GATE, NOT A RENDER GATE ───────────────────────
 * A player never fetches the queue at all. Hiding it in the component would
 * still have shipped the rows to the browser.
 */
export type SeasonHome = {
  season: { id: string; name: string };
  league: { id: string; name: string } | null;
  /** Every season of the league, for the header picker (sticky note 1: the
   *  picker is a header control, not a left rail). */
  seasonOptions: SeasonOption[];
  hub: SeasonHub;
  leaderboard: LeaderboardData;
  /** Commissioner only. Empty for a player, because a player never asked. */
  overdue: OverdueWeek[];
  isCommissioner: boolean;
};

export async function getSeasonHome(ctx: SeasonContext): Promise<SeasonHome> {
  const { db, seasonId, memberId, role } = ctx;
  const isCommissioner = role === "commissioner";

  const [hub, leaderboard, league] = await Promise.all([
    getSeasonHub(db, seasonId, memberId),
    getLeaderboard(db, seasonId, memberId),
    getSeasonLeague(db, seasonId),
  ]);

  const [seasonOptions, overdue] = await Promise.all([
    league ? getSeasonOptions(db, league.id) : Promise.resolve([]),
    isCommissioner ? getOverdueWeeks(db, seasonId) : Promise.resolve([]),
  ]);

  // The season's own name comes off the options list rather than a second read:
  // `getSeasonOptions` is `getLeagueSeasons` mapped, and this season is one of
  // them by construction.
  const name =
    seasonOptions.find((s) => s.id === seasonId)?.name ?? "This season";

  return {
    season: { id: seasonId, name },
    league,
    seasonOptions,
    hub,
    leaderboard,
    overdue,
    isCommissioner,
  };
}
