import type { NavLeague } from "@/lib/nav";

// Which league is the shell currently looking through?
//
// Lifted out of app-sidebar so the top nav can read it without importing a
// client component — and so the rule has one home now that TWO shells have
// existed. The URL decides; on league-free pages (Home, Releases, Settings)
// the first league stands in. A remembered-league cookie preference once sat
// between those two rules, but its write side was never built — the read
// plumbing was removed 2026-08-09 rather than left looking load-bearing.

export function resolveFocusedLeague(
  leagues: NavLeague[],
  pathname: string
): NavLeague | null {
  if (leagues.length === 0) return null;

  const leagueMatch = pathname.match(/^\/league\/([^/]+)/);
  if (leagueMatch) {
    const hit = leagues.find((l) => l.id === leagueMatch[1]);
    if (hit) return hit;
  }

  const seasonMatch = pathname.match(/^\/(?:season|commish)\/([^/]+)/);
  if (seasonMatch) {
    const hit = leagues.find((l) => l.seasonIds.includes(seasonMatch[1]));
    if (hit) return hit;
  }

  return leagues[0];
}
