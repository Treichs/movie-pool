import type { SupabaseClient } from "@/lib/supabase";
import { rankBy } from "@/lib/pool";

// Everything a season has SCORED so far, and the week-by-week rank trend
// derived from it. Shared by the Dashboard (season-card sparkline) and the
// Leaderboard (trend chart) so the two can never show a player different
// positions for the same week — the same reason the fun awards live in one
// view (ADR-029) rather than in two implementations.
//
// v_standings (ADR-013) is a whole-season aggregate with no week dimension, so
// a trend cannot come from it. It is derivable from the raw rows though: every
// point and every dollar is attributable to a week through
// bids.is_winning → films.week_id → weeks.number.

export type ScoredData = {
  weeks: { id: string; seasonId: string; number: number }[];
  films: {
    id: string;
    weekId: string;
    title: string;
    score: number;
    boxOfficeM: number | null;
    tomatometer: number | null;
  }[];
  // amount is what makes the EFFICIENCY trend possible; without it only points
  // can be tracked. Safe to read: a winning bid only exists on a resolved week,
  // whose amounts are revealed to every member (ADR-003/ADR-022).
  winningBids: { filmId: string; memberId: string; name: string; amount: number }[];
};

// Everything scored so far, across the given seasons, in three batched queries.
// Winning bids on closed weeks are league-visible by design (phase 11), so
// this is the same data the Leaderboard derives from.
export async function getScoredData(
  supabase: SupabaseClient,
  seasonIds: string[]
): Promise<ScoredData> {
  const empty: ScoredData = { weeks: [], films: [], winningBids: [] };
  if (seasonIds.length === 0) return empty;

  const { data: weekData } = await supabase
    .from("weeks")
    .select("id, season_id, number")
    .in("season_id", seasonIds)
    .eq("status", "final");
  const weeks = ((weekData ?? []) as { id: string; season_id: string; number: number }[]).map(
    (w) => ({ id: w.id, seasonId: w.season_id, number: w.number })
  );
  if (weeks.length === 0) return empty;

  const { data: filmData } = await supabase
    .from("films")
    .select("id, week_id, title, score, box_office_m, tomatometer")
    .in(
      "week_id",
      weeks.map((w) => w.id)
    )
    .eq("status", "active")
    .not("score", "is", null);
  const films = (
    (filmData ?? []) as {
      id: string;
      week_id: string;
      title: string;
      score: number;
      box_office_m: number | null;
      tomatometer: number | null;
    }[]
  ).map((f) => ({
    id: f.id,
    weekId: f.week_id,
    title: f.title,
    score: Number(f.score),
    boxOfficeM: f.box_office_m === null ? null : Number(f.box_office_m),
    tomatometer: f.tomatometer,
  }));
  if (films.length === 0) return { weeks, films: [], winningBids: [] };

  const { data: bidData } = await supabase
    .from("bids")
    .select(
      "film_id, season_member_id, amount, member:season_members(profile:profiles(display_name))"
    )
    .in(
      "film_id",
      films.map((f) => f.id)
    )
    .eq("is_winning", true);
  const winningBids = (
    (bidData ?? []) as unknown as {
      film_id: string;
      season_member_id: string;
      amount: number;
      member: { profile: { display_name: string } | null } | null;
    }[]
  ).map((b) => ({
    filmId: b.film_id,
    memberId: b.season_member_id,
    name: b.member?.profile?.display_name ?? "Unknown player",
    amount: Number(b.amount),
  }));

  return { weeks, films, winningBids };
}

// One player's standing as it read at the end of a given scored week.
// Rank, not raw value: cumulative points only ever go up, so their shape says
// nothing; position is the "how am I doing" answer.
export type TrendPoint = {
  week: number;
  pointsRank: number;
  // null until the player has spent a dollar — matching v_standings.efficiency,
  // which is NULL until then and so cannot be ranked.
  efficiencyRank: number | null;
  points: number;
  efficiency: number | null;
};

// v_standings computes points as a SUM of numeric(_,2) scores and efficiency as
// round(points/spent, 3). Doing the same arithmetic in JS floats drifts
// (0.1 + 0.2 = 0.30000000000000004), and a drift here is not cosmetic: dense
// ranking turns on exact EQUALITY, so an unrounded tie silently becomes two
// separate ranks and the trend's final week would disagree with the Leaderboard
// it sits next to. Round at each step to the same precision the database uses.
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function denseRanks(
  memberIds: string[],
  value: (id: string) => number | null
): Map<string, number | null> {
  const ranked = memberIds
    .map((id) => ({ id, v: value(id) }))
    .filter((r): r is { id: string; v: number } => r.v !== null)
    .sort((a, b) => b.v - a.v);

  // rankBy is the app's single rank model (dense, ADR-028) — reused rather than
  // reimplemented so the trend can't drift from the table beside it.
  const out = new Map<string, number | null>(memberIds.map((id) => [id, null]));
  for (const [rank, row] of rankBy(ranked, (r) => r.v)) out.set(row.id, rank);
  return out;
}

// Every member's position after each scored week. `memberIds` is the RANKING
// UNIVERSE — pass the season's full membership, or ranks will be computed
// against a partial field and be wrong.
export function buildSeasonTrend(
  scored: ScoredData,
  seasonId: string,
  memberIds: string[]
): Map<string, TrendPoint[]> {
  const trends = new Map<string, TrendPoint[]>(memberIds.map((id) => [id, []]));

  const weeks = scored.weeks
    .filter((w) => w.seasonId === seasonId)
    .sort((a, b) => a.number - b.number);
  if (weeks.length === 0 || memberIds.length === 0) return trends;

  const ownersByFilm = new Map<string, { memberId: string; amount: number }[]>();
  for (const bid of scored.winningBids) {
    const owners = ownersByFilm.get(bid.filmId) ?? [];
    owners.push({ memberId: bid.memberId, amount: bid.amount });
    ownersByFilm.set(bid.filmId, owners);
  }

  const points = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const spent = new Map<string, number>(memberIds.map((id) => [id, 0]));

  for (const week of weeks) {
    for (const film of scored.films.filter((f) => f.weekId === week.id)) {
      for (const owner of ownersByFilm.get(film.id) ?? []) {
        // A member can own a film from a season they are not in the universe
        // of only if the caller passed a partial list; ignore rather than
        // inventing a member.
        if (!points.has(owner.memberId)) continue;
        points.set(owner.memberId, round2(points.get(owner.memberId)! + film.score));
        spent.set(owner.memberId, spent.get(owner.memberId)! + owner.amount);
      }
    }

    const efficiencyOf = (id: string) => {
      const s = spent.get(id) ?? 0;
      return s > 0 ? round3((points.get(id) ?? 0) / s) : null;
    };
    const pointsRanks = denseRanks(memberIds, (id) => points.get(id) ?? 0);
    const efficiencyRanks = denseRanks(memberIds, efficiencyOf);

    for (const id of memberIds) {
      trends.get(id)!.push({
        week: week.number,
        pointsRank: pointsRanks.get(id)!,
        efficiencyRank: efficiencyRanks.get(id) ?? null,
        points: points.get(id) ?? 0,
        efficiency: efficiencyOf(id),
      });
    }
  }

  return trends;
}
