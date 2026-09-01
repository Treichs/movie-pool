import "server-only";

import type { SeasonContext } from "@/lib/auth";
import {
  getOverdueWeeks,
  getSeasonLeague,
  getSettingsForSeason,
  type OverdueWeek,
} from "@/lib/commish";
import { getLeaderboard, type LeaderboardData } from "@/lib/leaderboard";
import { seasonLadder, type PayoutLadder } from "@/lib/payout";
import { getSeasonHub, type SeasonHub } from "@/lib/season-hub";
import { getSeasonOptions, type SeasonOption } from "@/lib/season-schedule";
import { buildSeasonStory, type SeasonStory } from "@/lib/season-story";

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
 * ── THE PRIZE LADDER WAS WRITTEN AND NEVER WIRED ──────────────────────────
 * `seasonLadder` has sat in `payout.ts` with zero consumers, under a comment
 * saying it "lived inline on the leaderboard page" — the same species of
 * composer-without-a-UI as the queue below it. It answers the question the
 * leaderboard is actually asked every Monday: not what did I score, but am I
 * in the money. It is a PROJECTION and nothing is stored; a practice league
 * gets null and no money register at all.
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
  /** Position, movement, rivalry and the money — derived from `leaderboard`,
   *  querying nothing of its own. */
  story: SeasonStory;
  /** What the places are worth while the season runs. Null for a practice
   *  league, which is playing for nothing. */
  ladder: PayoutLadder | null;
  /** Commissioner only. Empty for a player, because a player never asked. */
  overdue: OverdueWeek[];
  isCommissioner: boolean;
};

export async function getSeasonHome(ctx: SeasonContext): Promise<SeasonHome> {
  const { db, seasonId, memberId, role } = ctx;
  const isCommissioner = role === "commissioner";

  const [hub, leaderboard, league, settings] = await Promise.all([
    getSeasonHub(db, seasonId, memberId),
    getLeaderboard(db, seasonId, memberId),
    getSeasonLeague(db, seasonId),
    getSettingsForSeason(db, seasonId),
  ]);

  const ladder = seasonLadder(settings, leaderboard.playerCount);
  const story = buildSeasonStory(leaderboard, memberId, ladder);

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
    story,
    ladder,
    overdue,
    isCommissioner,
  };
}
