import type { NavLeague } from "@/lib/nav";

// Which league is the shell currently looking through?
//
// Lifted out of app-sidebar so the top nav can read it without importing a
// client component — and so the rule has one home now that TWO shells have
// existed. THE ADDRESS IS THE ONLY ANSWER. A remembered-league cookie
// preference once sat behind it, but its write side was never built — the read
// plumbing was removed 2026-08-09 rather than left looking load-bearing.
//
// ── NOTHING STANDS IN, AND THAT CHANGED 2026-09-02 ─────────────────────────
// This used to end `return leagues[0]`, so a page whose address names no league
// — `/leagues`, `/account`, `/leagues/new` — was still described as being
// inside one. The switcher named a league the reader had not opened and the
// section strip offered its Films and its Dues: the two controls that answer
// "where am I" were answering with a guess.
//
// Selection is EXPLICIT now. No league in the address means no league selected,
// and every control that describes one hides rather than invents one. That is
// the whole of the rule — there is no cookie, no last-used, nothing to restore.
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

  return null;
}
