import type { SupabaseClient } from "@/lib/supabase";

// COMPARABLES — the anticipation window's second line (ceremony phase,
// 2026-08-16). Between Thursday's close and Monday's capture a player owns
// films with no score, and the honest thing the app can say about the wait is
// what films LIKE THIS have done in THIS league before: same-ish Tomatometer,
// what did they average?
//
// League-scoped on principle, not convenience: commissioners hand-enter box
// office and Tomatometer per league-season (ADR-408's premise), so another
// league's history is a claim about numbers this league never recorded. The
// ingested archive (ADR-406) is what gives an established pool ~30 seasons of
// history to compare against; a young league simply shows nothing until it
// has played enough films to say something.

export type ComparablePoint = {
  score: number;
  tomatometer: number;
};

/**
 * Every captured film in the league's history, as (score, tomatometer)
 * points. Two queries rather than a deep join filter: seasons by league,
 * films by season — the same shape the record book reads with.
 */
export async function getLeagueComparables(
  supabase: SupabaseClient,
  leagueId: string
): Promise<ComparablePoint[]> {
  const { data: seasons } = await supabase
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId);
  const seasonIds = (seasons ?? []).map((s: { id: string }) => s.id);
  if (seasonIds.length === 0) return [];

  const { data } = await supabase
    .from("films")
    .select("score, tomatometer, week:weeks!inner(season_id)")
    .in("weeks.season_id", seasonIds)
    .eq("status", "active")
    .not("score", "is", null)
    .not("tomatometer", "is", null);

  return ((data ?? []) as { score: number | string; tomatometer: number }[]).map(
    (f) => ({
      // numeric arrives as a string from Postgres; sorting or averaging the
      // strings is the classic "9.5 above 10.2" mistake.
      score: Number(f.score),
      tomatometer: f.tomatometer,
    })
  );
}

/**
 * What films near this Tomatometer have averaged in this league.
 *
 * BAND, MINIMUM, or NOTHING: ±`band` points is "near" (a 71% and an 85% film
 * are different animals; a 74% and a 78% are the same conversation), and
 * fewer than `minCount` films is a sample that would lie with confidence —
 * null says "not enough history" honestly, and the caller renders nothing.
 * Pure, so the band and floor are unit-testable decisions rather than vibes.
 */
export function comparableSummary(
  history: readonly ComparablePoint[],
  tomatometer: number,
  band = 7,
  minCount = 3
): { avg: number; count: number } | null {
  const near = history.filter(
    (p) => Math.abs(p.tomatometer - tomatometer) <= band
  );
  if (near.length < minCount) return null;
  const avg = near.reduce((s, p) => s + p.score, 0) / near.length;
  return { avg, count: near.length };
}
