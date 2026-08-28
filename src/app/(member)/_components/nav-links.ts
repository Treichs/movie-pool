import type { NavLeague } from "@/lib/nav";

/**
 * THE TWO GROUPS THE NAV OFFERS, derived from the league in focus.
 *
 * A plain module, not a component: the desktop dropdowns and the phone drawer
 * render the same two lists, and a second copy of "which addresses exist"
 * would drift the first time a route moved.
 *
 * The grouping is not invented — it is how the 25-route map already divides.
 * Everything under `/seasons/[seasonId]` belongs to a season that ends; every
 * `/leagues/[leagueId]` address outlives it.
 */
export type NavLink = {
  label: string;
  href: string;
  /**
   * The pathname that lights this item up, or `null` for a destination the
   * path cannot identify. Prefix by default — `/leagues/x` claims
   * `/leagues/x/records` — and `exact` where the item is a parent whose
   * children belong to a sibling item instead.
   */
  match: string | null;
  exact?: boolean;
};

export function seasonLinks(league: NavLeague | null): NavLink[] {
  const season = league?.currentSeason;
  if (!season) return [];
  const base = `/seasons/${season.id}`;
  const links: NavLink[] = [
    // EXACT, and the drive is what caught it: a prefix match here lit "Season
    // home" up while the viewer was three routes deeper on the bid page, next
    // to the item that was actually current. A parent that claims its
    // children's routes tells you where you are not.
    { label: "Season home", href: base, match: base, exact: true },
    // The season page owns the leaderboard as a tab, and the Monday scores
    // email links this exact address — so the nav points at the same one
    // rather than inventing a second way in. It can never read as current:
    // the tab lives in the query string, and `usePathname` cannot see it.
    { label: "Leaderboard", href: `${base}?tab=leaderboard`, match: null },
  ];
  if (league?.openWeek) {
    links.splice(1, 0, {
      label: `Week ${String(league.openWeek.number).padStart(2, "0")} — bidding`,
      href: `${base}/weeks/${league.openWeek.id}/bid`,
      match: `${base}/weeks`,
    });
  }
  links.push({ label: "Payouts", href: `${base}/payouts`, match: `${base}/payouts` });
  return links;
}

export function leagueLinks(league: NavLeague | null): NavLink[] {
  if (!league) return [];
  const base = `/leagues/${league.id}`;
  const links: NavLink[] = [
    { label: "League home", href: base, match: base, exact: true },
    { label: "Record book", href: `${base}/records`, match: `${base}/records` },
    { label: "Dues", href: `${base}/dues`, match: `${base}/dues` },
    { label: "Announcements", href: `${base}/announcements`, match: `${base}/announcements` },
  ];
  // ADR-060 is enforced in the RPCs, but a link a player cannot follow is a
  // dead end with their name on it: settings 404s for them by design.
  if (league.isCommissioner) {
    links.push({ label: "Settings", href: `${base}/settings`, match: `${base}/settings` });
  }
  return links;
}

export function isCurrent(
  pathname: string,
  match: string | null,
  exact = false
): boolean {
  if (match === null) return false;
  if (exact) return pathname === match;
  return pathname === match || pathname.startsWith(`${match}/`);
}
