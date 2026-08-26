import type { SupabaseClient } from "@/lib/supabase";
import {
  getRevealedBids,
  getStandings,
  rankBy,
  type RevealedBid,
} from "@/lib/pool";
import { buildSeasonTrend, type ScoredData, type TrendPoint } from "@/lib/season-trend";

// Data for the Leaderboard (ADR-023) — the season's payoff surface: where a
// player finds out how they are doing, and the home of the provisional fun
// awards while the season runs.
//
// Deliberately a NARROW loader rather than a reuse of getSeasonHub, which
// fetches every week and film of the season to answer a different question.
// Same call the week board made.

export type LeaderboardRow = {
  seasonMemberId: string;
  /** The account behind the seat (ADR-082) — what a chip identifies a player by. */
  profileId: string;
  name: string;
  isMe: boolean;
  points: number;
  spent: number;
  filmsOwned: number;
  /** Season-long points ÷ dollars. NOT the Best Efficiency award — see below. */
  efficiency: number | null;
  pointsRank: number;
  /** null until they have spent a dollar; v_standings.efficiency is NULL then. */
  efficiencyRank: number | null;
};

export type AwardWinner = {
  seasonMemberId: string;
  profileId: string | null;
  name: string;
  isMe: boolean;
};

// The rulebook (§7.1) names two different things almost identically, and this
// screen shows BOTH — so the distinction is carried in the types rather than
// left to the reader:
//   • LeaderboardRow.efficiency — a PLAYER's season points ÷ their dollars.
//   • bestEfficiency            — the single best PICK of the season, by
//                                 points-per-dollar on ONE film.
// A player can lead the efficiency ranking and not hold the best pick.
export type ProvisionalAwards = {
  bestEfficiency: { ratio: number; films: string[]; winners: AwardWinner[] } | null;
  dessert: { ratio: number; films: string[]; winners: AwardWinner[] } | null;
};

/** One player's whole rank walk, for the bump chart. */
export type TrendSeries = {
  seasonMemberId: string;
  profileId: string;
  name: string;
  isMe: boolean;
  trend: TrendPoint[];
};

/**
 * A film on the season's "Top films" rail.
 *
 * EVERY film of every visible week, not just the scored ones — the rail is a
 * season-long list that fills in, so an uncaptured film shows dashes and sorts
 * last rather than being absent and making the season look shorter than it is.
 */
/**
 * One winning bid on a rail film — who owns it and what they paid.
 *
 * Ordered by AMOUNT, highest first, which is why `isTopBid` can be a flag on
 * the row rather than a lookup: ties on the top amount all carry it, because
 * the rulebook honours ties and two people can genuinely share the top bid.
 */
export type RailOwner = {
  seasonMemberId: string;
  profileId: string | null;
  name: string;
  /** What this owner paid. Every owner pays their OWN bid (rulebook §Payment). */
  bid: number;
  /** Highest amount paid on this film. Shared when the top amount is tied. */
  isTopBid: boolean;
  isMe: boolean;
};

export type RailFilm = {
  id: string;
  title: string;
  weekNumber: number;
  /** Null until the commissioner captures the week. */
  score: number | null;
  boxOfficeM: number | null;
  tomatometer: number | null;
  /** For the poster. Null when the film was never matched to the catalog. */
  posterPath: string | null;
  /**
   * Owners and their bids, highest first. Empty while bids are still sealed.
   *
   * This replaced a bare `ownerNames: string[]` when the ownership matrix was
   * retired into this list (2026-08-08) — the matrix said WHO owned a film in
   * a grid of dots, and the amounts that make ownership interesting were not
   * on it at all.
   */
  owners: RailOwner[];
  /** True when the viewer is one of those owners. */
  iOwn: boolean;
};

export type LeaderboardData = {
  rows: LeaderboardRow[];
  /** False before anything is scored — every rank would otherwise read "1st". */
  hasScores: boolean;
  awards: ProvisionalAwards;
  /** EVERY player's walk, for the bump chart — buildSeasonTrend returns the
   *  whole field keyed by member, and the page picks "me" out of the rows. */
  allTrends: TrendSeries[];
  /** Number of scored weeks — the bump chart's x domain. */
  scoredWeeks: number[];
  /** The season's films, scored or not, for the Top-films rail. */
  rail: RailFilm[];
  playerCount: number;
};

// ADR-029: the ONE definition of the fun awards, shared with the settlement
// that pays them. security_invoker means this read is RLS-filtered to what the
// caller may see — which, for awards (winning bids on captured films, always in
// scored weeks), is exactly what the commissioner's settlement read sees.
type AwardsRow = {
  best_ratio: number | string | null;
  worst_ratio: number | string | null;
  efficiency_films: string[];
  efficiency_member_ids: string[];
  dessert_films: string[];
  dessert_member_ids: string[];
};

export async function getSeasonAwards(
  supabase: SupabaseClient,
  seasonId: string
): Promise<AwardsRow | null> {
  const { data } = await supabase
    .from("v_season_awards")
    .select("*")
    .eq("season_id", seasonId)
    .maybeSingle();
  return (data as AwardsRow) ?? null;
}

type ScoredWeekRow = { id: string; number: number; opening_date: string; week_of: string };

export async function getLeaderboard(
  supabase: SupabaseClient,
  seasonId: string,
  seasonMemberId: string
): Promise<LeaderboardData> {
  const [standings, awardsRow, weekData, railWeekData] = await Promise.all([
    getStandings(supabase, seasonId),
    getSeasonAwards(supabase, seasonId),
    supabase
      .from("weeks")
      .select("id, number, opening_date, week_of")
      .eq("season_id", seasonId)
      .eq("status", "final")
      .order("number"),
    // The rail's wider universe: every week a player may see. Draft weeks are
    // the commissioner's workbench (the same exclusion getWeekBoard makes), so
    // listing their films here would leak an unannounced slate.
    supabase
      .from("weeks")
      .select("id, number")
      .eq("season_id", seasonId)
      .neq("status", "draft")
      .order("number"),
  ]);

  const nameOf = new Map(standings.map((r) => [r.season_member_id, r.display_name]));
  // season_member_id -> profile id. The awards RPC hands back membership ids
  // and nothing else, so this is how an award winner becomes an account.
  const profileOf = new Map(standings.map((r) => [r.season_member_id, r.profile_id]));
  const memberIds = standings.map((r) => r.season_member_id);

  // ---- Ranked rows ---------------------------------------------------------
  // Dense rank (ADR-028) via the shared rankBy, so the table, the bar chart and
  // the settlement all name the same place for the same player.
  const byPoints = [...standings].sort((a, b) => Number(b.points) - Number(a.points));
  const pointsRanks = new Map(
    rankBy(byPoints, (r) => Number(r.points)).map(([rank, r]) => [r.season_member_id, rank])
  );
  const byEfficiency = standings
    .filter((r) => r.efficiency !== null)
    .sort((a, b) => Number(b.efficiency) - Number(a.efficiency));
  const efficiencyRanks = new Map(
    rankBy(byEfficiency, (r) => Number(r.efficiency)).map(([rank, r]) => [
      r.season_member_id,
      rank,
    ])
  );

  const rows: LeaderboardRow[] = byPoints.map((r) => ({
    seasonMemberId: r.season_member_id,
    profileId: r.profile_id,
    name: r.display_name,
    isMe: r.season_member_id === seasonMemberId,
    points: Number(r.points),
    spent: Number(r.spent),
    filmsOwned: Number(r.films_owned),
    efficiency: r.efficiency === null ? null : Number(r.efficiency),
    pointsRank: pointsRanks.get(r.season_member_id) ?? 1,
    efficiencyRank: efficiencyRanks.get(r.season_member_id) ?? null,
  }));

  const weeks = (weekData.data ?? []) as ScoredWeekRow[];

  // ---- Films + bids for the trend ------------------------------------------
  // Note this deliberately does NOT call getScoredData: that helper batches
  // across seasons for the dashboard. The part that MUST be shared is the
  // cumulative walk (buildSeasonTrend), not the fetch. (An ownership-matrix
  // build also fed from this fetch until 2026-08-09 — the matrix was retired
  // into the rail's films list, and the computation went with it.)
  type TrendFilmRow = {
    id: string;
    week_id: string;
    title: string;
    score: number | string;
    box_office_m: number | null;
    tomatometer: number | null;
  };
  let films: TrendFilmRow[] = [];
  let revealed: RevealedBid[] = [];
  if (weeks.length > 0) {
    const { data: filmData } = await supabase
      .from("films")
      .select("id, week_id, title, score, box_office_m, tomatometer")
      .in(
        "week_id",
        weeks.map((w) => w.id)
      )
      .eq("status", "active")
      .not("score", "is", null);
    films = (filmData ?? []) as TrendFilmRow[];
    revealed = await getRevealedBids(
      supabase,
      films.map((f) => f.id)
    );
  }

  // ---- Trend ---------------------------------------------------------------
  // The shared walk, fed from the rows already in hand.
  const scored: ScoredData = {
    weeks: weeks.map((w) => ({ id: w.id, seasonId, number: w.number })),
    films: films.map((f) => ({
      id: f.id,
      weekId: f.week_id,
      title: f.title,
      score: Number(f.score),
      boxOfficeM: f.box_office_m,
      tomatometer: f.tomatometer,
    })),
    winningBids: revealed
      .filter((b) => b.is_winning)
      .map((b) => ({
        filmId: b.film_id,
        memberId: b.member.id,
        name: b.member.profile.display_name,
        amount: b.amount,
      })),
  };
  // One walk, two consumers. buildSeasonTrend has always returned the whole
  // field keyed by member; the old loader kept one row and discarded the rest,
  // which is precisely the data the bump chart needs. Ordered by the ranked
  // rows so the chart's series order matches the table beneath it.
  const trendsByMember = buildSeasonTrend(scored, seasonId, memberIds);
  const allTrends: TrendSeries[] = rows.map((r) => ({
    seasonMemberId: r.seasonMemberId,
    profileId: r.profileId,
    name: r.name,
    isMe: r.isMe,
    trend: trendsByMember.get(r.seasonMemberId) ?? [],
  }));

  // ---- The Top-films rail --------------------------------------------------
  const railWeeks = (railWeekData.data ?? []) as { id: string; number: number }[];
  const rail = await buildRail(supabase, railWeeks, seasonMemberId);

  // ---- Awards --------------------------------------------------------------
  const winners = (ids: string[]): AwardWinner[] =>
    (ids ?? []).map((id) => ({
      seasonMemberId: id,
      profileId: profileOf.get(id) ?? null,
      name: nameOf.get(id) ?? "Unknown player",
      isMe: id === seasonMemberId,
    }));

  const awards: ProvisionalAwards = {
    bestEfficiency:
      awardsRow?.best_ratio != null
        ? {
            ratio: Number(awardsRow.best_ratio),
            films: awardsRow.efficiency_films ?? [],
            winners: winners(awardsRow.efficiency_member_ids),
          }
        : null,
    dessert:
      awardsRow?.worst_ratio != null
        ? {
            ratio: Number(awardsRow.worst_ratio),
            films: awardsRow.dessert_films ?? [],
            winners: winners(awardsRow.dessert_member_ids),
          }
        : null,
  };

  return {
    rows,
    hasScores: rows.some((r) => r.points > 0),
    awards,
    allTrends,
    scoredWeeks: weeks.map((w) => w.number),
    rail,
    playerCount: rows.length,
  };
}

/**
 * Every film of every non-draft week, with its numbers and its owners.
 *
 * Separate from the trend fetch above on purpose: the trend walks only SCORED
 * films, while the rail is the season's whole film list watching itself fill
 * in. Sharing one fetch would mean the rail lost its unscored films.
 *
 * Owner names come from revealed bids, which RLS only returns once a week is
 * closed — so a film in an open week correctly shows no owners rather than
 * leaking who is winning it (ADR-022).
 */
async function buildRail(
  supabase: SupabaseClient,
  weeks: { id: string; number: number }[],
  seasonMemberId: string,
): Promise<RailFilm[]> {
  if (weeks.length === 0) return [];
  // catalog:film_catalog(poster_path) resolves through films.tmdb_id — the same
  // join commish.ts and season-schedule.ts use. Only poster_path is taken: this
  // list draws a thumbnail, not a film page, and the rest of the catalog row is
  // several hundred bytes per film of overview and tagline nobody reads here.
  const { data } = await supabase
    .from("films")
    .select(
      "id, week_id, title, score, box_office_m, tomatometer, catalog:film_catalog(poster_path)"
    )
    .in("week_id", weeks.map((w) => w.id))
    .eq("status", "active");
  const films = (data ?? []) as unknown as {
    id: string;
    week_id: string;
    title: string;
    score: number | null;
    box_office_m: number | null;
    tomatometer: number | null;
    catalog: { poster_path: string | null } | null;
  }[];
  if (films.length === 0) return [];

  const revealed = await getRevealedBids(supabase, films.map((f) => f.id));
  const numberOf = new Map(weeks.map((w) => [w.id, w.number]));

  return films
    .map((f) => {
      // getRevealedBids already orders by amount descending, so this is sorted
      // without re-sorting — but it is re-sorted anyway rather than relying on
      // a helper's ordering from three files away, which is exactly the kind of
      // implicit contract that breaks silently when the helper is touched.
      const winning = revealed
        .filter((b) => b.film_id === f.id && b.is_winning)
        .sort((a, b) => b.amount - a.amount);
      // TIES SHARE THE TOP. The rulebook honours tied bids, so "the top bid" is
      // an amount, not a person — two players who both paid $18 are both the
      // top bidder and both get the marker.
      const topAmount = winning.length > 0 ? winning[0].amount : null;
      const owners: RailOwner[] = winning.map((b) => ({
        seasonMemberId: b.member.id,
        profileId: b.member.profile.id ?? null,
        name: b.member.profile.display_name,
        bid: b.amount,
        isTopBid: b.amount === topAmount,
        isMe: b.member.id === seasonMemberId,
      }));
      return {
        id: f.id,
        title: f.title,
        weekNumber: numberOf.get(f.week_id) ?? 0,
        score: f.score === null ? null : Number(f.score),
        boxOfficeM: f.box_office_m === null ? null : Number(f.box_office_m),
        tomatometer: f.tomatometer,
        posterPath: f.catalog?.poster_path ?? null,
        owners,
        iOwn: owners.some((o) => o.isMe),
      };
    })
    .sort((a, b) => a.weekNumber - b.weekNumber || a.title.localeCompare(b.title));
}
