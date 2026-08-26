import type { SupabaseClient } from "@/lib/supabase";

// Player-side data helpers for the /season pages. Reads go through the
// user's own JWT, so RLS does the real gatekeeping — most importantly the
// blind-bid policy: while a week is open a player's bid queries only ever
// return their OWN rows; once the week is locked/resolved/scored the same
// query returns everyone's bids.

export type MyBid = {
  film_id: string;
  amount: number;
};

export type RevealedBid = {
  /** ADR-060: override_bid_amount addresses a bid by its own id. */
  id: string;
  film_id: string;
  amount: number;
  is_winning: boolean | null; // null until the week closes (ADR-070)
  member: {
    id: string;
    profile: { id: string; display_name: string };
  };
};

// Remaining season budget = bankroll − winning bids on active films (derived
// in the database, see member_remaining_budget in the phase 1 migration).
export async function getRemainingBudget(
  supabase: SupabaseClient,
  seasonMemberId: string
): Promise<number | null> {
  const { data } = await supabase.rpc("member_remaining_budget", {
    p_season_member_id: seasonMemberId,
  });
  return typeof data === "number" ? data : null;
}

// The caller's own bids on the given films. The explicit member filter is
// for clarity — RLS already hides other players' bids while bidding is open.
export async function getMyBids(
  supabase: SupabaseClient,
  filmIds: string[],
  seasonMemberId: string
): Promise<MyBid[]> {
  if (filmIds.length === 0) return [];
  const { data } = await supabase
    .from("bids")
    .select("film_id, amount")
    .in("film_id", filmIds)
    .eq("season_member_id", seasonMemberId);
  return (data ?? []) as MyBid[];
}

// One standings row per season member, from the v_standings view (phase 6).
// The view is security_invoker, so RLS guarantees a member only ever sees
// standings built from bids they could already read (resolved weeks).
export type StandingsRow = {
  season_id: string;
  season_member_id: string;
  /** The ACCOUNT behind the membership (ADR-082). season_member_id is a real
   *  identity but the wrong one for anything that outlives a season — an
   *  avatar and a profile link belong to the person, not to the seat. */
  profile_id: string;
  display_name: string;
  role: "commissioner" | "player";
  films_owned: number;
  points: number;
  spent: number;
  efficiency: number | null; // points per dollar; null until they've spent
};

// Dense ranks: ties share a rank and the next rank does NOT skip (1, 1, 2 …).
// This is the app's single rank model (ADR-028) — it matches the dense_rank()
// the settlement ledger pays on, so a player is never shown one place and paid
// another. Dense is what makes the payout structure coherent: it names a fixed
// 1st/2nd/3rd prize, so every prize must always have a recipient even when
// players tie. Shared by the standings page and the dashboard so they can never
// disagree. `sorted` must already be ordered best-first by `value`.
export function rankBy<T>(
  sorted: T[],
  value: (row: T) => number
): [rank: number, row: T][] {
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((row) => {
    const current = value(row);
    if (previous === null || current !== previous) rank += 1;
    previous = current;
    return [rank, row];
  });
}

export async function getStandings(
  supabase: SupabaseClient,
  seasonId: string
): Promise<StandingsRow[]> {
  const { data } = await supabase
    .from("v_standings")
    .select("*")
    .eq("season_id", seasonId)
    .order("points", { ascending: false });
  return (data ?? []) as StandingsRow[];
}

// getWeekBidders was HERE and is gone (2026-08-05), along with the RPC behind
// it. ADR-022 sealed bid AMOUNTS but deliberately kept participation public as
// a "who's in play" signal; that is withdrawn — knowing who has already bid is
// itself a strategic signal, and it was on screen: buildFilmDetail listed every
// bidder by name on an open week. Sealed bidding now means sealed, and the
// third tightening of the same rule (ADR-006 -> ADR-022 -> here).
//
// The function is DROPPED rather than left ungranted. An exposed RPC nobody
// calls is still an endpoint, which is the same reasoning commish/actions.ts
// records for deleted server actions.

// Every bid on the given films — only returns other players' rows once the
// week is closed or later (the RLS reveal). The commissioner gets NO special
// arm: ADR-022 dropped ADR-006's commissioner-sees-all-while-open clause, so
// while a week is open everyone, commissioner included, reads only their own
// bids. Sorted for the top-3 display.
export async function getRevealedBids(
  supabase: SupabaseClient,
  filmIds: string[]
): Promise<RevealedBid[]> {
  if (filmIds.length === 0) return [];
  const { data } = await supabase
    .from("bids")
    .select(
      "id, film_id, amount, is_winning, member:season_members(id, profile:profiles(id, display_name))"
    )
    .in("film_id", filmIds)
    .order("amount", { ascending: false });
  return (data ?? []) as unknown as RevealedBid[];
}

/**
 * One player's two ranks within a season — the SINGLE implementation.
 *
 * The dashboard and the season hub each grew their own `buildRank`, and while
 * both routed through `rankBy` (so the rank MODEL agreed, per ADR-028), they
 * disagreed about a player with zero points: the dashboard ranked them last,
 * the hub returned null ("not yet"). Two players on 0 points therefore saw
 * different positions on two screens.
 *
 * Settled in favour of RANKING THEM. The Leaderboard's standings table has
 * always ranked every row, so the hub was the odd surface out — two agreed and
 * one did not, and "3rd of 3" is simply true once someone has scored. The one
 * case that stays null is a season where NOBODY has scored: every rank would
 * read "1st" and that is a lie dressed as a leaderboard (the same reasoning
 * the standings page uses for its `hasScores` guard).
 *
 * Efficiency is independent: it is null until a player has spent a dollar,
 * because v_standings.efficiency is NULL until then and cannot be ranked.
 */
export function buildDualRank(
  rows: StandingsRow[],
  seasonMemberId: string
): { pointsRank: number | null; efficiencyRank: number | null } | null {
  const mine = rows.find((r) => r.season_member_id === seasonMemberId);
  if (!mine) return null;

  const anyScored = rows.some((r) => Number(r.points) > 0);
  const byPoints = [...rows].sort((a, b) => Number(b.points) - Number(a.points));
  const pointsRank = anyScored
    ? (rankBy(byPoints, (r) => Number(r.points)).find(
        ([, r]) => r.season_member_id === seasonMemberId
      )?.[0] ?? null)
    : null;

  const byEfficiency = rows
    .filter((r) => r.efficiency !== null)
    .sort((a, b) => Number(b.efficiency) - Number(a.efficiency));
  const efficiencyRank =
    mine.efficiency === null
      ? null
      : (rankBy(byEfficiency, (r) => Number(r.efficiency)).find(
          ([, r]) => r.season_member_id === seasonMemberId
        )?.[0] ?? null);

  return { pointsRank, efficiencyRank };
}

// ---------------------------------------------------------------------------
// Week-over-week rank movement — DERIVED, never stored (2026-08-03).
//
// The design round asked for an up/down arrow beside each player. The obvious
// implementation is a `previous_rank` column on season_members, but that would
// be the first STORED standing in a codebase whose rule is that money and
// standings are derived on read. It is unnecessary: every winning bid already
// carries its film, and every film already carries its week, so "the table as
// it stood at the end of week N-1" is just the same sum over a smaller set.
//
// Ties share a rank (rankBy's contract), so movement is measured against that
// same shared rank rather than a row index.
// ---------------------------------------------------------------------------

/** One member's ownership of one scored film, flattened for ranking. */
export type ScoredOwnership = {
  seasonMemberId: string;
  weekNumber: number;
  score: number;
};

/**
 * Rank per member counting only weeks up to and including `upToWeek`.
 * Members with no scored film yet are absent — they have no rank to compare,
 * which is the same rule buildDualRank applies to a season nobody has scored.
 */
export function rankAsOfWeek(
  ownerships: ScoredOwnership[],
  upToWeek: number
): Map<string, number> {
  const points = new Map<string, number>();
  for (const o of ownerships) {
    if (o.weekNumber > upToWeek) continue;
    points.set(o.seasonMemberId, (points.get(o.seasonMemberId) ?? 0) + o.score);
  }
  const sorted = [...points.entries()].sort((a, b) => b[1] - a[1]);
  return new Map(rankBy(sorted, ([, pts]) => pts).map(([rank, [id]]) => [id, rank]));
}

/**
 * Movement since the end of the previous scored week, per member.
 *
 * Positive means climbed. Null means there is nothing honest to compare — the
 * member had no rank last week (their first points just landed), or no week has
 * scored yet. Null is deliberately NOT rendered as zero: "unchanged" and "no
 * previous position" are different facts and a dash says so.
 */
export function rankMovement(
  ownerships: ScoredOwnership[]
): Map<string, number | null> {
  const weeks = ownerships.map((o) => o.weekNumber);
  const latest = weeks.length ? Math.max(...weeks) : 0;
  const movement = new Map<string, number | null>();
  if (latest < 1) return movement;

  const now = rankAsOfWeek(ownerships, latest);
  const before = rankAsOfWeek(ownerships, latest - 1);
  for (const [id, rank] of now) {
    const prior = before.get(id);
    // A lower rank NUMBER is a better position, so prior - current is the climb.
    movement.set(id, prior === undefined ? null : prior - rank);
  }
  return movement;
}
