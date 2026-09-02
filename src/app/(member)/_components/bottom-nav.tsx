"use client";

import Link from "next/link";
import { CalendarDaysIcon, HomeIcon, UserIcon, UsersIcon } from "lucide-react";

import type { NavLeague } from "@/lib/nav";

import { isCurrent } from "./nav-links";

/**
 * THE PLACES A MEMBER RETURNS TO, ALWAYS ONE TAP — not everything they can
 * reach. The rest is in the drawer.
 *
 * IT IS NOT ALWAYS FOUR, and that changed 2026-09-02. League and Season both
 * describe a league, and until then both were drawn even when no league was
 * selected — pointing at `/leagues`, which is where Home already goes. A tab
 * that lands you somewhere else's destination is worse than an absent one, so
 * the bar carries only the tabs it can honour: Home and You on `/leagues` and
 * `/account`, League and Season added once a league is in the address.
 *
 * LEAGUE SITS LEFT OF SEASON, outermost first: the league contains the season,
 * and the pair reads in the same order the desktop band lists them.
 *
 * Labels are never hidden behind icons: an icon-only bar is a memory test, and
 * the words fit. Every target is 56px tall against a 44px floor.
 *
 * It shipped drawn-to-shape under Ruling 78, which deferred the phone review
 * for the whole phase. That ruling was lifted 2026-08-31 and this bar has been
 * driven at 390×844 since.
 */
export function BottomNav({
  focused,
  pathname,
}: {
  focused: NavLeague | null;
  pathname: string;
}) {
  const season = focused?.currentSeason ?? null;

  const tabs = [
    { label: "Home", href: "/leagues", match: "/leagues", exact: true, Icon: HomeIcon },
    // MATCHED ON THE LEAGUE'S OWN PATH, not on `/leagues`. A bare prefix made
    // this tab current on `/leagues` too, so the command centre marked two tabs
    // at once and neither one meant anything.
    ...(focused
      ? [
          {
            label: "League",
            href: `/leagues/${focused.id}`,
            match: `/leagues/${focused.id}`,
            exact: false,
            Icon: UsersIcon,
          },
        ]
      : []),
    ...(season
      ? [
          {
            label: "Season",
            href: `/seasons/${season.id}`,
            match: "/seasons",
            exact: false,
            Icon: CalendarDaysIcon,
          },
        ]
      : []),
    { label: "You", href: "/account", match: "/account", exact: true, Icon: UserIcon },
  ];

  return (
    <nav
      aria-label="Primary"
      /* Spelled out rather than interpolated: Tailwind scans source text, so a
         `grid-cols-${n}` it cannot read is a class it never generates. */
      className={`sticky bottom-0 z-30 grid border-t bg-card md:hidden ${
        tabs.length === 4 ? "grid-cols-4" : tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"
      }`}
    >
      {tabs.map(({ label, href, match, exact, Icon }) => {
        const current = isCurrent(pathname, match, exact);
        return (
          <Link
            key={label}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`flex h-14 flex-col items-center justify-center gap-1 ${
              current ? "text-foreground shadow-[inset_0_2px_0_0_var(--foreground)]" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-5.5" aria-hidden />
            <span className="type-micro text-micro">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
