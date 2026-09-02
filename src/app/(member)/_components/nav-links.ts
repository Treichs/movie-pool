import type { NavLeague } from "@/lib/nav";

/**
 * THE FOCUSED LEAGUE'S SECTIONS — one flat row, no levels (ADR-443).
 *
 * A plain module, not a component: the desktop band and the phone drawer render
 * the same list, and a second copy of "which addresses exist" would drift the
 * first time a route moved.
 *
 * ── IT USED TO BE TWO DROPDOWN GROUPS, "LEAGUE" AND "SEASON" ─────────────
 * That grouping mirrored how the route map divides — everything under
 * `/seasons/[seasonId]` belongs to a season that ends, every
 * `/leagues/[leagueId]` address outlives it — and it was the wrong thing to
 * show a player. A navigation LEVEL exists so somebody can pick among peers,
 * and ADR-020 gives a league exactly one season at a time, so Season was a
 * level with nothing to switch: it had no switcher because it could not have
 * one. A season is a TIME FILTER, and "which season" is only a question in the
 * archive, which the season page's own picker already answers.
 *
 * So the two groups collapse into the destinations themselves. Where an address
 * lives — under a league or under a season — stops being something the reader
 * has to know before they can find anything.
 *
 * ── WHAT LEFT THE ROW, AND WHERE IT WENT ────────────────────────────────
 * Nothing was orphaned; each was checked.
 *   · League home — left on the argument that the switcher lists every league,
 *     the focused one included. IT CAME BACK 2026-09-02, and it now LEADS the
 *     row. That argument depended on the switcher always being there, and it no
 *     longer is: a league is selected explicitly, the switcher only renders once
 *     one is, and from four routes underneath it the way back to the league
 *     itself was a breadcrumb rung and nothing else.
 *   · Announcements — League Home's own panel links to all of them.
 *   · Leaderboard — a tab on the season page, and the query string it lives in
 *     is invisible to `usePathname`, so it could never read as current here.
 *   · Settings — beside the switcher, not in the row: it is chrome ABOUT the
 *     league rather than a place inside it.
 *
 * ── THE ROW'S LENGTH, AND WHY MONEY IS NOT FOLDED ───────────────────────
 * Six was written here as a ceiling. League's return makes seven while a week
 * is open, and Bid is the item that pushes it there — which is the one item
 * worth the overflow, since it is the only thing in the game with a deadline
 * and it is absent six days a week.
 *
 * ADR-443 proposed one "Money" section folding dues and payouts. They are not
 * foldable: dues is league-scoped and permanent, payouts is season-scoped, and
 * `/seasons/[id]/payouts` has NO other inbound link anywhere in the app —
 * folding it away would have made a built page unreachable. They ride as two
 * adjacent items instead, which is the same idea without the orphan.
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

export function sectionLinks(league: NavLeague | null): NavLink[] {
  if (!league) return [];

  const leagueBase = `/leagues/${league.id}`;
  const season = league.currentSeason;

  // EXACT, for the same reason Season is: Films, Records, Dues and Settings are
  // all `/leagues/[id]/…` children with their own items in this row, and a
  // prefix match would light League up on every one of them.
  const links: NavLink[] = [
    { label: "League", href: leagueBase, match: leagueBase, exact: true },
  ];

  if (season) {
    const seasonBase = `/seasons/${season.id}`;
    // EXACT, and a drive is what caught it: a prefix match lit "Season" up
    // while the viewer was three routes deeper on the bid page, next to the
    // item that was actually current. A parent that claims its children's
    // routes tells you where you are not.
    links.push({ label: "Season", href: seasonBase, match: seasonBase, exact: true });

    // ONLY WHILE A WEEK IS TAKING BIDS. An item that is dead six days a week
    // teaches people to stop reading the row. It appears on the week being
    // OPEN, which every member can already see — never on whether the viewer
    // has bid, which would leak the one thing sealed bidding hides.
    if (league.openWeek) {
      links.push({
        label: "Bid",
        href: `${seasonBase}/weeks/${league.openWeek.id}/bid`,
        match: `${seasonBase}/weeks`,
      });
    }
  }

  links.push(
    { label: "Films", href: `${leagueBase}/films`, match: `${leagueBase}/films` },
    { label: "Records", href: `${leagueBase}/records`, match: `${leagueBase}/records` }
  );

  if (season) {
    links.push({
      label: "Payouts",
      href: `/seasons/${season.id}/payouts`,
      match: `/seasons/${season.id}/payouts`,
    });
  }

  links.push({ label: "Dues", href: `${leagueBase}/dues`, match: `${leagueBase}/dues` });

  return links;
}

/** Commissioner-only, and it rides beside the switcher rather than in the row.
 *
 *  ADR-060 is enforced in the RPCs, but a link a player cannot follow is a dead
 *  end with their name on it: settings 404s for them by design. */
export function settingsLink(league: NavLeague | null): NavLink | null {
  if (!league?.isCommissioner) return null;
  return {
    label: "Settings",
    href: `/leagues/${league.id}/settings`,
    match: `/leagues/${league.id}/settings`,
  };
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
