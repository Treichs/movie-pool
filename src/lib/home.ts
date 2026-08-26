import type { SupabaseClient } from "@/lib/supabase";
import { getNavLeagues, type NavLeague } from "@/lib/nav";

// Data for HOME — the signpost that replaced the Dashboard (2026-08-03).
//
// The Dashboard's job was to aggregate: every league, every season, points,
// money, rank, results. That was closed off deliberately, because each league
// has its own bankroll and its own rules, so a combined figure means nothing.
// The player's own numbers now live on League Home, scoped to one season.
//
// So this module is deliberately THIN. It answers "where am I going", nothing
// else. If a statistic ever appears in this file, that is the regression —
// Home slowly re-accumulating the surface it replaced.
//
// The one thing beyond a league list is STATE THAT EXPIRES: how many members,
// and when the current week's bidding closes. That is not a statistic, it is
// the thing that helps you choose which league to open first.

export type HomeLeague = NavLeague & {
  memberCount: number;
  /** The earliest still-open week's deadline, if any is taking bids. Under the
   *  2026-08-03 timing rule two weeks can be open at once, and the earliest is
   *  the one with a deadline actually approaching. */
  closesAt: string | null;
  openWeekNumber: number | null;
};

export async function getHomeLeagues(
  supabase: SupabaseClient,
  userId: string
): Promise<HomeLeague[]> {
  const leagues = await getNavLeagues(supabase, userId);
  if (leagues.length === 0) return [];

  // THE OPEN-WEEK READ MOVED TO getNavLeagues (CH-01-e). It used to be here,
  // and the nav countdown needed the same answer on every page — so rather than
  // a second query computing "earliest open week" a second way, the field comes
  // back on NavLeague and this module just reads it. Home keeps only the count,
  // which is the one thing genuinely its own.
  const countsRes = await supabase
    .from("league_members")
    .select("league_id")
    .in(
      "league_id",
      leagues.map((l) => l.id)
    );

  const counts = new Map<string, number>();
  for (const row of (countsRes.data ?? []) as { league_id: string }[]) {
    counts.set(row.league_id, (counts.get(row.league_id) ?? 0) + 1);
  }

  return leagues.map((l) => ({
    ...l,
    memberCount: counts.get(l.id) ?? 0,
    closesAt: l.openWeek?.bidDeadline ?? null,
    openWeekNumber: l.openWeek?.number ?? null,
  }));
}
