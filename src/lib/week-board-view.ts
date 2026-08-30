import type { SeasonContext } from "@/lib/auth";
import type { WeekOverride } from "@/lib/week-board";
import { getWeekBoard } from "@/lib/week-board";
import { buildRevealSheet, type RevealFilm } from "@/lib/reveal";
import { buildSeasonTrend, getScoredData } from "@/lib/season-trend";
import type { WeekStatus } from "@/lib/commish";

/**
 * `/seasons/[seasonId]/weeks/[weekId]` — the WEEK BOARD. Board 3.2.
 *
 * ── IT IS `getWeekBoardView`, IN ITS OWN FILE, AND THAT IS DELIBERATE ────
 * `getWeekBoard` already exists in `week-board.ts` and has other callers. Two
 * functions one letter apart in one file is how a wrong import happens and
 * then typechecks. This is the SCREEN's read; that one is the week's data, and
 * this calls it rather than repeating it.
 *
 * ── THE BOARD IS DRAWN SETTLED BECAUSE THE OPEN WEEK IS NOT THIS SCREEN ──
 * A live bidding window belongs to `/bid` and nowhere else (ADR-108). The page
 * redirects there when `biddable` is true — and `biddable`, not `open`: a week
 * past its deadline still reads open for up to a minute while the automated
 * close catches up, and bouncing a reader into a form the database would
 * refuse is worse than showing them a week that has just ended.
 *
 * ── THE REVEAL IS `reveal.ts`, NOT ARITHMETIC WRITTEN AGAIN HERE ─────────
 * That module is pure, already written, and carries ADR-096's locked ranking:
 * spread first, then owners, then bidders, with removed films last. It also
 * knows what I bid and lost, which is what lets a film say so.
 *
 * **What this screen does NOT render, and it is worth knowing:** `reveal.ts`
 * also produces the cut hairline, the "Everyone else — $0" roster line and
 * week-scaled bid bars — the fuller sheet ADR-096 locked. Board 3.2 draws a
 * compact settled week instead: owners as chips, one personal line, no bars.
 * The board and the plan agree with each other, so that is what is built, and
 * the richer sheet has no screen in the 25.
 */

export type WeekBoardView = {
  week: { id: string; number: number; weekOf: string | null; openingDate: string };
  status: WeekStatus;
  season: { id: string; name: string };
  league: { id: string; name: string } | null;
  /** True when a bid placed now would be accepted — the page redirects. */
  biddable: boolean;
  /** The week exists but the slate is still being built. */
  pending: boolean;
  /** Ranked by ADR-096's spread rule. Removed films are split out below. */
  sheet: RevealFilm[];
  removed: RevealFilm[];
  /** When the commissioner captured — the newest capture on the week. Null
   *  until one exists, which is also when no film has a score. */
  scoredAt: string | null;
  /** How many people bid at more than $0 anywhere in the week. */
  bidderCount: number;
  /** `season_settings.top_n_distinct` — how many DISTINCT amounts take a film.
   *  Read off a film's own detail rather than fetched again: `getWeekBoard`
   *  already resolved the season's settings to build it. */
  topNDistinct: number;
  /** The viewer's own week. Null while nothing has been revealed. */
  mine: MyWeek | null;
  /** ADR-060 commissioner corrections, newest first. */
  overrides: WeekOverride[];
};

export type MyWeek = {
  /** Points earned this week — the full score of every film I own. */
  score: number;
  /** What those wins cost. Losing bids cost nothing. */
  spent: number;
  filmsWon: number;
  /** How many films I bid on at all, which is what "2 of 3" counts against. */
  filmsBid: number;
  /** Points per dollar. Null when nothing was spent — never zero, which is a
   *  real and much worse result. */
  efficiency: number | null;
  /** Dense rank in the season after this week, and the change from the week
   *  before it. Both null unless the week is scored and ranked. */
  rank: number | null;
  /** Positive means the reader moved UP. Null on their first scored week,
   *  where there is no previous position to have moved from. */
  rankDelta: number | null;
};

export async function getWeekBoardView(
  ctx: SeasonContext,
  weekId: string
): Promise<WeekBoardView | null> {
  const board = await getWeekBoard(ctx.db, weekId, ctx.seasonId, ctx.memberId);
  if (!board) return null;

  const [{ data: season }, { data: seasonRow }] = await Promise.all([
    // v_seasons, not seasons: ADR-099 made the name a derivation living only
    // in the view.
    ctx.db.from("v_seasons").select("id, name").eq("id", ctx.seasonId).maybeSingle(),
    // The league comes off the BASE table — the embed resolves through
    // seasons.league_id, which the view does not declare.
    ctx.db
      .from("seasons")
      .select("league:leagues(id, name)")
      .eq("id", ctx.seasonId)
      .maybeSingle(),
  ]);

  const all = buildRevealSheet([...board.slate, ...board.removed], board.rosterSize);
  const sheet = all.filter((f) => !f.removed);
  const removed = all.filter((f) => f.removed);

  const captured = [...board.slate, ...board.removed]
    .map((f) => f.captured_at)
    .filter((v): v is string => v !== null)
    .sort();

  const bidders = new Set(
    all.flatMap((f) => f.rows.map((r) => r.seasonMemberId))
  );

  const mine = myWeek(all);

  return {
    week: {
      id: board.week.id,
      number: board.week.number,
      weekOf: board.week.week_of,
      openingDate: board.week.opening_date,
    },
    status: board.week.status,
    season: {
      id: ctx.seasonId,
      // A season with no weeks yet has no rank to name it; the view's own
      // fallback is what the rest of the app shows too.
      name: (season?.name as string | undefined) ?? "New season",
    },
    league:
      (seasonRow as { league: { id: string; name: string } | null } | null)
        ?.league ?? null,
    biddable: board.biddable,
    pending: board.pending,
    sheet,
    removed,
    scoredAt: captured.at(-1) ?? null,
    bidderCount: bidders.size,
    topNDistinct:
      board.slate[0]?.detail.topNDistinct ??
      board.removed[0]?.detail.topNDistinct ??
      3,
    // THE RANK LINE COSTS A WHOLE-SEASON READ, so it is only paid for on a
    // week that has one: an unscored week moved nobody anywhere.
    mine: mine && board.week.status === "final"
      ? { ...mine, ...(await myRank(ctx, board.week.number)) }
      : mine,
    overrides: board.overrides,
  };
}

/**
 * The reader's own result, from the sheet and nothing else.
 *
 * EVERY OWNER EARNS THE FULL SCORE — the rule the reveal states out loud, and
 * the reason this sums whole scores rather than shares of them.
 */
function myWeek(sheet: readonly RevealFilm[]): MyWeek | null {
  // A REMOVED FILM IS NOT PART OF ANYONE'S WEEK. It scores for nobody and its
  // bids were refunded in full (ADR-060), so counting its cost would show
  // money the reader still has, and counting it in "won 2 of 3" would count a
  // film that was pulled. It appears further down the page as an epilogue.
  const played = sheet.filter((f) => !f.removed);

  const bid = played.filter((f) => f.iBid);
  if (bid.length === 0 && !played.some((f) => f.iOwn)) return null;

  let score = 0;
  let spent = 0;
  let filmsWon = 0;
  for (const film of played) {
    const mine = film.rows.find((r) => r.isMe && r.isWinning);
    if (!mine) continue;
    filmsWon += 1;
    spent += mine.amount;
    // Null on a week the commissioner has not captured yet, which is the
    // closed-and-unscored state — the panel then reads 0.00 against real
    // spend, which is true and is why the page labels it "not scored yet".
    score += film.score ?? 0;
  }

  return {
    score,
    spent,
    filmsWon,
    filmsBid: bid.length,
    efficiency: spent > 0 ? score / spent : null,
    rank: null,
    rankDelta: null,
  };
}

/**
 * Where this week left the reader in the season, and which way they moved.
 *
 * `buildSeasonTrend` is the app's ONE cumulative-standings model — reused
 * rather than re-derived, so this line can never disagree with the leaderboard
 * sitting on the season page. It costs a whole-season read for two numbers,
 * which is why the caller only asks on a scored week.
 */
async function myRank(
  ctx: SeasonContext,
  weekNumber: number
): Promise<{ rank: number | null; rankDelta: number | null }> {
  const [scored, { data: members }] = await Promise.all([
    getScoredData(ctx.db, [ctx.seasonId]),
    ctx.db.from("season_members").select("id").eq("season_id", ctx.seasonId),
  ]);
  const memberIds = ((members ?? []) as { id: string }[]).map((m) => m.id);
  // The RANKING UNIVERSE has to be the whole season or every rank is computed
  // against a partial field — `buildSeasonTrend` says so in its own words.
  const walk = buildSeasonTrend(scored, ctx.seasonId, memberIds).get(ctx.memberId);
  if (!walk || walk.length === 0) return { rank: null, rankDelta: null };

  const here = walk.findIndex((p) => p.week === weekNumber);
  if (here === -1) return { rank: null, rankDelta: null };

  const rank = walk[here].pointsRank;
  const before = here > 0 ? walk[here - 1].pointsRank : null;
  // A SMALLER rank is better, so the delta is inverted to read as "moved up".
  return { rank, rankDelta: before === null ? null : before - rank };
}
