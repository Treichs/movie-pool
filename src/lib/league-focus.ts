import type { NavLeague } from "@/lib/nav";

// Which league is the shell currently looking through?
//
// Lifted out of app-sidebar so the top nav can read it without importing a
// client component — and so the rule has one home now that TWO shells have
// existed. The URL decides; on league-free pages (Home, Account) the first
// league stands in. A remembered-league cookie preference once sat between
// those two rules, but its write side was never built — the read plumbing was
// removed 2026-08-09 rather than left looking load-bearing.
//
// ── THE SEGMENTS ARE PLURAL, AND THEY WERE SINGULAR HERE UNTIL 2026-08-30 ──
// This file was written against the pre-rebuild route shapes, `/league/[id]`
// and `/season/[id]`. The rebuild made every collection plural (IA map §7.5)
// and this matcher was not carried across, so BOTH patterns silently stopped
// matching and every caller fell through to `leagues[0]`.
//
// Nothing failed loudly. The shell simply described the wrong league on every
// page: the switcher named a league you were not in, and the Season and League
// dropdowns pointed at that other league's addresses — so the two controls
// whose whole job is "where am I" were the two that lied. It was found by
// reading hrefs off the bid page during a UX walk, not by any check here.
//
// A test would have caught it, and the shape of these patterns is exactly the
// kind of thing that rots again the next time an address moves.

export function resolveFocusedLeague(
  leagues: NavLeague[],
  pathname: string
): NavLeague | null {
  if (leagues.length === 0) return null;

  const leagueMatch = pathname.match(/^\/leagues\/([^/]+)/);
  if (leagueMatch) {
    const hit = leagues.find((l) => l.id === leagueMatch[1]);
    if (hit) return hit;
  }

  const seasonMatch = pathname.match(/^\/seasons\/([^/]+)/);
  if (seasonMatch) {
    const hit = leagues.find((l) => l.seasonIds.includes(seasonMatch[1]));
    if (hit) return hit;
  }

  return leagues[0];
}
