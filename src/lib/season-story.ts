import type { LeaderboardData } from "@/lib/leaderboard";
import type { PayoutLadder } from "@/lib/payout";

/**
 * THE SEASON'S STORY — position, movement, rivalry and the money, derived from
 * the leaderboard data the page already has in hand.
 *
 * ── IT ASKS THE DATABASE FOR NOTHING ──────────────────────────────────────
 * Every number below comes out of `LeaderboardData`, which `getLeaderboard`
 * already assembles: `rows` for the standings, `allTrends` for each player's
 * cumulative points at the end of each scored week, and `rail` for every film
 * with its owners and what each of them paid. That is deliberate — the
 * leaderboard was already paying for this data and rendering a table of it,
 * and a second set of queries to say something interesting about the same rows
 * would be the drift this app's derived-not-stored rule exists to prevent.
 *
 * ── WHY A WEEKLY HAUL IS A SUBTRACTION ────────────────────────────────────
 * `TrendPoint.points` is CUMULATIVE, so what a player scored in week N is
 * their total after N minus their total after N−1. Both sides are already
 * rounded to the two decimals `v_standings` uses, and the difference is
 * rounded again: float subtraction of two rounded values still drifts, and a
 * haul is compared for equality when ties are collected.
 *
 * ── SEALED WEEKS CANNOT LEAK THROUGH HERE ─────────────────────────────────
 * The trend is built from `final` weeks only and the rail's owners come from
 * revealed bids, which RLS withholds until a week closes. Nothing in this file
 * can describe an open week, which is what makes a rivalry stat safe to show
 * while bidding is live.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** How many recent weeks "form" covers. */
const FORM_WEEKS = 3;

/** A finishing place that pays, and what it is worth. */
export type MoneyPlace = {
  place: number;
  amount: number;
  /** Third is a buy-in refund under the default rules, not a share of the pot. */
  kind: "first" | "second" | "third";
  /**
   * How many players currently hold this place. Above one the amount is NOT
   * what each of them receives, and the screen must say so rather than print
   * the full prize twice. How a tied place actually divides is a rulebook
   * question this file deliberately does not answer — it reports the tie and
   * lets the settlement decide.
   */
  heldBy: number;
};

export type MyPosition = {
  rank: number;
  playerCount: number;
  points: number;
  /** How many OTHER players hold this same rank. Ties are honoured. */
  sharedWith: number;
  /** Places gained (positive) or lost (negative) since the previous scored
   *  week. Null until two weeks have scored — there is no movement to report
   *  from a single week. */
  delta: { places: number; sinceWeek: number } | null;
  /** Points scored in the most recent scored week. */
  lastHaul: number | null;
  /** Points across the last few scored weeks. Null until the season is longer
   *  than that window, when it would only restate the season total. */
  form: { points: number; weeks: number } | null;
  /** The nearest player above, and the points between you. */
  chasing: { name: string; rank: number; gap: number } | null;
  /** The nearest player below, and the points between you. */
  pursuedBy: { name: string; rank: number; gap: number } | null;
  /** Null for a practice league — nothing is being played for, so no place
   *  pays and the whole money register is absent rather than zeroed. */
  money: {
    holding: MoneyPlace | null;
    /** The best paying place above you, and the points to the player holding
     *  it. Null when you already hold the top paying place. */
    next: { place: MoneyPlace; gap: number } | null;
  } | null;
};

export type Headline = {
  kind: "haul" | "mover" | "value" | "overpay";
  label: string;
  /** Every player who achieved it — ties share a headline rather than one of
   *  them being picked by a sort. Each carries its own flag, because a
   *  three-way tie that includes you contains two names that are not yours. */
  names: HeadlineName[];
  films: string[];
  figure: string;
  detail: string;
  isMine: boolean;
};

export type Rival = {
  seasonMemberId: string;
  profileId: string;
  name: string;
  /** Weeks in which you outscored them, they outscored you, and you drew. */
  wins: number;
  losses: number;
  draws: number;
  /** Their points minus yours: positive means they are ahead. */
  gap: number;
  rank: number;
};

export type SeasonStory = {
  position: MyPosition | null;
  headlines: Headline[];
  rivals: Rival[];
  /** The player closest to you on points, either side. The one rivalry worth
   *  putting on a phone. */
  nearest: Rival | null;
  lastScoredWeek: number | null;
};

const EMPTY: SeasonStory = {
  position: null,
  headlines: [],
  rivals: [],
  nearest: null,
  lastScoredWeek: null,
};

/**
 * The paying places, in order, from the projected ladder. A place worth nothing
 * is not a place anyone is chasing — a third that pays no refund is dropped
 * rather than shown as "$0".
 */
function payingPlaces(
  ladder: PayoutLadder,
  holdersOf: (place: number) => number,
): MoneyPlace[] {
  return [
    { place: 1, amount: ladder.first, kind: "first" as const },
    { place: 2, amount: ladder.second, kind: "second" as const },
    { place: 3, amount: ladder.third, kind: "third" as const },
  ]
    .filter((p) => p.amount > 0)
    .map((p) => ({ ...p, heldBy: holdersOf(p.place) }));
}

/** Every player who achieved something, and whether one of them is you. */
export type HeadlineName = { name: string; isMine: boolean };

/** Cumulative totals turned into what each week was worth. */
function hauls(points: number[]): number[] {
  return points.map((p, i) => round2(i === 0 ? p : p - points[i - 1]));
}

export function buildSeasonStory(
  data: LeaderboardData,
  seasonMemberId: string,
  ladder: PayoutLadder | null,
): SeasonStory {
  if (!data.hasScores || data.scoredWeeks.length === 0) return EMPTY;

  const lastScoredWeek = data.scoredWeeks[data.scoredWeeks.length - 1];
  const me = data.rows.find((r) => r.seasonMemberId === seasonMemberId) ?? null;

  // Weekly hauls for every player, keyed by membership, plus each player's rank
  // walk. Both come off the trend series the bump chart is already drawing.
  const haulOf = new Map<string, number[]>();
  const rankWalkOf = new Map<string, number[]>();
  for (const series of data.allTrends) {
    haulOf.set(series.seasonMemberId, hauls(series.trend.map((t) => t.points)));
    rankWalkOf.set(series.seasonMemberId, series.trend.map((t) => t.pointsRank));
  }

  // ---- Position ------------------------------------------------------------
  let position: MyPosition | null = null;
  if (me) {
    const myHauls = haulOf.get(seasonMemberId) ?? [];
    const myWalk = rankWalkOf.get(seasonMemberId) ?? [];

    const delta =
      myWalk.length >= 2
        ? {
            // A rank IMPROVING is a smaller number, so the sign is flipped:
            // going from 5th to 3rd is +2 places, not −2.
            places: myWalk[myWalk.length - 2] - myWalk[myWalk.length - 1],
            sinceWeek: data.scoredWeeks[data.scoredWeeks.length - 2],
          }
        : null;

    // FORM ONLY EXISTS ONCE IT DIFFERS FROM THE SEASON. In a season three
    // weeks old the last three weeks ARE the season, and printing 148.00 twice
    // under two labels reads as a bug in the arithmetic rather than as two
    // facts.
    const form =
      myHauls.length > FORM_WEEKS
        ? {
            points: round2(
              myHauls.slice(myHauls.length - FORM_WEEKS).reduce((a, b) => a + b, 0),
            ),
            weeks: FORM_WEEKS,
          }
        : null;

    // `rows` is already sorted by points descending, so the nearest player
    // either side is the nearest row with a DIFFERENT rank — a tied player is
    // level with you, not ahead of or behind you.
    const above = [...data.rows]
      .filter((r) => r.pointsRank < me.pointsRank)
      .pop();
    const below = data.rows.find((r) => r.pointsRank > me.pointsRank);

    let money: MyPosition["money"] = null;
    if (ladder) {
      const places = payingPlaces(
        ladder,
        (place) => data.rows.filter((r) => r.pointsRank === place).length,
      );
      const holding = places.find((p) => p.place === me.pointsRank) ?? null;
      // The best paying place you do not already hold, and what it costs in
      // points: the total of whoever currently holds it, less yours.
      const target = places.find((p) => p.place < me.pointsRank) ?? null;
      const holder = target
        ? data.rows.find((r) => r.pointsRank === target.place)
        : undefined;
      money = {
        holding,
        next:
          target && holder
            ? { place: target, gap: round2(holder.points - me.points) }
            : null,
      };
    }

    position = {
      rank: me.pointsRank,
      playerCount: data.playerCount,
      points: me.points,
      sharedWith:
        data.rows.filter((r) => r.pointsRank === me.pointsRank).length - 1,
      delta,
      lastHaul: myHauls.length > 0 ? myHauls[myHauls.length - 1] : null,
      form,
      chasing: above
        ? {
            name: above.name,
            rank: above.pointsRank,
            gap: round2(above.points - me.points),
          }
        : null,
      pursuedBy: below
        ? {
            name: below.name,
            rank: below.pointsRank,
            gap: round2(me.points - below.points),
          }
        : null,
      money,
    };
  }

  // ---- Rivals --------------------------------------------------------------
  // Week by week against every other player. A rivalry is a record over a
  // stated span, which is why the count of weeks compared is carried out with
  // it rather than assumed from the season's length.
  const rivals: Rival[] = me
    ? data.rows
        .filter((r) => r.seasonMemberId !== seasonMemberId)
        .map((r) => {
          const mine = haulOf.get(seasonMemberId) ?? [];
          const theirs = haulOf.get(r.seasonMemberId) ?? [];
          const weeks = Math.min(mine.length, theirs.length);
          let wins = 0;
          let losses = 0;
          let draws = 0;
          for (let i = 0; i < weeks; i++) {
            if (mine[i] > theirs[i]) wins++;
            else if (mine[i] < theirs[i]) losses++;
            else draws++;
          }
          return {
            seasonMemberId: r.seasonMemberId,
            profileId: r.profileId,
            name: r.name,
            wins,
            losses,
            draws,
            gap: round2(r.points - me.points),
            rank: r.pointsRank,
          };
        })
    : [];

  const nearest =
    rivals.length > 0
      ? rivals.reduce((a, b) => (Math.abs(b.gap) < Math.abs(a.gap) ? b : a))
      : null;

  // ---- Headlines -----------------------------------------------------------
  const headlines = buildHeadlines(data, lastScoredWeek, haulOf, rankWalkOf, seasonMemberId);

  return { position, headlines, rivals, nearest, lastScoredWeek };
}

/**
 * What the most recent scored week is remembered for.
 *
 * The season-long awards already live on the leaderboard and answer a
 * different question — those are the season's best and worst picks overall,
 * and they barely move once a season is a few weeks old. These are about the
 * week that just landed, which is the one people are still arguing about.
 */
function buildHeadlines(
  data: LeaderboardData,
  lastScoredWeek: number,
  haulOf: Map<string, number[]>,
  rankWalkOf: Map<string, number[]>,
  seasonMemberId: string,
): Headline[] {
  const out: Headline[] = [];
  const nameOf = new Map(data.rows.map((r) => [r.seasonMemberId, r.name]));
  const weekIndex = data.scoredWeeks.length - 1;

  // Biggest haul of the week.
  const weekHauls = data.rows
    .map((r) => ({ id: r.seasonMemberId, haul: haulOf.get(r.seasonMemberId)?.[weekIndex] ?? 0 }))
    .filter((h) => h.haul > 0);
  if (weekHauls.length > 0) {
    const best = Math.max(...weekHauls.map((h) => h.haul));
    const winners = weekHauls.filter((h) => h.haul === best);
    out.push({
      kind: "haul",
      label: "Biggest haul",
      names: winners.map((w) => ({
        name: nameOf.get(w.id) ?? "Unknown player",
        isMine: w.id === seasonMemberId,
      })),
      films: [],
      figure: best.toFixed(2),
      detail: `points in week ${String(lastScoredWeek).padStart(2, "0")}`,
      isMine: winners.some((w) => w.id === seasonMemberId),
    });
  }

  // Biggest climb of the week. Needs two weeks to have a direction at all.
  if (weekIndex >= 1) {
    const climbs = data.rows
      .map((r) => {
        const walk = rankWalkOf.get(r.seasonMemberId) ?? [];
        return { id: r.seasonMemberId, places: (walk[weekIndex - 1] ?? 0) - (walk[weekIndex] ?? 0) };
      })
      .filter((c) => c.places > 0);
    if (climbs.length > 0) {
      const best = Math.max(...climbs.map((c) => c.places));
      const winners = climbs.filter((c) => c.places === best);
      out.push({
        kind: "mover",
        label: "Biggest climb",
        names: winners.map((w) => ({
          name: nameOf.get(w.id) ?? "Unknown player",
          isMine: w.id === seasonMemberId,
        })),
        films: [],
        figure: `+${best}`,
        detail: best === 1 ? "place in a week" : "places in a week",
        isMine: winners.some((w) => w.id === seasonMemberId),
      });
    }
  }

  // Best and worst value on a single film of that week. A $0 bid never wins,
  // so a winning bid is always positive — the guard is for a rule that
  // changes, not for a case the rulebook currently allows.
  const picks = data.rail
    .filter((f) => f.weekNumber === lastScoredWeek && f.score !== null)
    .flatMap((f) =>
      f.owners
        .filter((o) => o.bid > 0)
        .map((o) => ({
          ratio: round2(f.score! / o.bid),
          film: f.title,
          name: o.name,
          id: o.seasonMemberId,
          bid: o.bid,
          score: f.score!,
        })),
    );

  if (picks.length > 0) {
    const bestRatio = Math.max(...picks.map((p) => p.ratio));
    const bestPicks = picks.filter((p) => p.ratio === bestRatio);
    out.push({
      kind: "value",
      label: "Best value",
      names: dedupeNames(bestPicks, seasonMemberId),
      films: [...new Set(bestPicks.map((p) => p.film))],
      figure: bestRatio.toFixed(2),
      detail: `points per dollar — ${bestPicks[0].score.toFixed(2)} for $${bestPicks[0].bid}`,
      isMine: bestPicks.some((p) => p.id === seasonMemberId),
    });

    // Only worth a headline when it is genuinely a different pick — a week with
    // one owned film would otherwise be its own best and worst.
    const worstRatio = Math.min(...picks.map((p) => p.ratio));
    if (worstRatio < bestRatio) {
      const worstPicks = picks.filter((p) => p.ratio === worstRatio);
      out.push({
        kind: "overpay",
        label: "Worst value",
        names: dedupeNames(worstPicks, seasonMemberId),
        films: [...new Set(worstPicks.map((p) => p.film))],
        figure: worstRatio.toFixed(2),
        detail: `points per dollar — ${worstPicks[0].score.toFixed(2)} for $${worstPicks[0].bid}`,
        isMine: worstPicks.some((p) => p.id === seasonMemberId),
      });
    }
  }

  return out;
}

/**
 * One entry per player, however many of that week's films they owned.
 *
 * A player who tied the best ratio on two films is one name, not two — and the
 * flag has to survive the dedupe, which is why this is a map rather than a Set
 * of strings.
 */
function dedupeNames(
  picks: { name: string; id: string }[],
  seasonMemberId: string,
): HeadlineName[] {
  const byName = new Map<string, HeadlineName>();
  for (const p of picks) {
    if (!byName.has(p.name)) {
      byName.set(p.name, { name: p.name, isMine: p.id === seasonMemberId });
    }
  }
  return [...byName.values()];
}
