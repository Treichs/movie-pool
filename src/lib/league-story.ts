import { rankBy } from "@/lib/pool";
import type { CareerRow, SeasonPlacement } from "@/lib/league-records";

/**
 * THE LEAGUE'S STORY — your career standing, and who you actually argue with.
 *
 * The league-scoped twin of `season-story.ts`, and deliberately the same four
 * ideas: a position, a gap to the person either side of you, and a rivalry
 * stated as a record over a named span. A season leaderboard and a league home
 * that used different vocabulary for the same question would be two products.
 *
 * ── IT ASKS THE DATABASE FOR NOTHING ──────────────────────────────────────
 * `getLeagueHome` already builds the record book, and the record book already
 * walks every season's standings. Careers and placements both fall out of that
 * one read; this file only arranges them.
 *
 * ── THE HERO IS A RANK, NOT A TITLE COUNT ─────────────────────────────────
 * Titles are the league's currency and the thing worth bragging about, but
 * most members of most leagues have none, and a hero numeral reading "0" is a
 * worse greeting than an honest position. Career points rank every member on
 * one axis from their first week, so that is the hero — the same shape the
 * season leaderboard leads with — and titles sit beside it as the figure that
 * actually settles arguments.
 *
 * ── A RIVALRY IS COUNTED ON FINISHES, NOT ON POINTS ───────────────────────
 * Career points reward turning up: a player of seven seasons outscores a
 * player of three whatever happened in them. Finishing above someone in a
 * season they both played is the comparison that survives uneven tenure, which
 * is why the record is counted over SHARED completed seasons and says how many
 * that was.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type CareerPosition = {
  /** Dense rank on career points, so ties share a place. */
  rank: number;
  memberCount: number;
  /** How many OTHER members hold this same rank. */
  sharedWith: number;
  titles: number;
  seasons: number;
  points: number;
  /** Best finish in a completed season. Null until one has finished. */
  bestFinish: number | null;
  /** The nearest member above on career points. */
  chasing: { name: string; gap: number } | null;
  /** The nearest member below on career points. */
  pursuedBy: { name: string; gap: number } | null;
};

export type CareerRival = {
  profileId: string;
  name: string;
  /** Completed seasons you finished above them, below them, and level. */
  above: number;
  below: number;
  level: number;
  /** Completed seasons you both played — the span the record is over. */
  shared: number;
  /** Their career points minus yours: positive means they are ahead. */
  gap: number;
};

export type LeagueStory = {
  position: CareerPosition | null;
  /** The member closest to you on career points who has actually shared a
   *  finished season with you. The one rivalry worth a sentence. */
  nearest: CareerRival | null;
  rivals: CareerRival[];
};

const EMPTY: LeagueStory = { position: null, nearest: null, rivals: [] };

export function buildLeagueStory(
  career: CareerRow[],
  placements: Map<string, SeasonPlacement[]>,
  myProfileId: string,
): LeagueStory {
  const me = career.find((c) => c.profileId === myProfileId) ?? null;
  if (!me || career.length === 0) return EMPTY;

  // Dense rank on career points, through the app's one rank model.
  const byPoints = [...career].sort((a, b) => b.points - a.points);
  const rankOf = new Map(
    rankBy(byPoints, (c) => c.points).map(([rank, c]) => [c.profileId, rank]),
  );
  const myRank = rankOf.get(myProfileId) ?? 1;

  // The nearest member either side is the nearest with a DIFFERENT rank — a
  // member level with you is level, not ahead of or behind you.
  const above = byPoints.filter((c) => (rankOf.get(c.profileId) ?? 0) < myRank).pop();
  const below = byPoints.find((c) => (rankOf.get(c.profileId) ?? 0) > myRank);

  const position: CareerPosition = {
    rank: myRank,
    memberCount: career.length,
    sharedWith:
      career.filter((c) => (rankOf.get(c.profileId) ?? 0) === myRank).length - 1,
    titles: me.titles,
    seasons: me.seasons,
    points: me.points,
    bestFinish: me.bestFinish,
    chasing: above
      ? { name: above.name, gap: round2(above.points - me.points) }
      : null,
    pursuedBy: below
      ? { name: below.name, gap: round2(me.points - below.points) }
      : null,
  };

  // ---- Career rivalries ----------------------------------------------------
  const mine = new Map(
    (placements.get(myProfileId) ?? []).map((p) => [p.seasonId, p.rank]),
  );

  const rivals: CareerRival[] = career
    .filter((c) => c.profileId !== myProfileId)
    .map((c) => {
      let aboveCount = 0;
      let belowCount = 0;
      let levelCount = 0;
      for (const p of placements.get(c.profileId) ?? []) {
        const myPlace = mine.get(p.seasonId);
        if (myPlace === undefined) continue;
        // A SMALLER rank is a better finish, so "above" is the lesser number.
        if (myPlace < p.rank) aboveCount++;
        else if (myPlace > p.rank) belowCount++;
        else levelCount++;
      }
      return {
        profileId: c.profileId,
        name: c.name,
        above: aboveCount,
        below: belowCount,
        level: levelCount,
        shared: aboveCount + belowCount + levelCount,
        gap: round2(c.points - me.points),
      };
    });

  // Only somebody you have actually finished a season against has a record to
  // quote. A new member is a member, not yet a rival.
  const contested = rivals.filter((r) => r.shared > 0);
  const nearest =
    contested.length > 0
      ? contested.reduce((a, b) => (Math.abs(b.gap) < Math.abs(a.gap) ? b : a))
      : null;

  return { position, nearest, rivals };
}
