"use client";

import Link from "next/link";
import { CalendarDaysIcon, HomeIcon, UserIcon, UsersIcon } from "lucide-react";

import type { NavLeague } from "@/lib/nav";

import { isCurrent } from "./nav-links";

/**
 * FOUR DESTINATIONS, ALWAYS VISIBLE, ALWAYS ONE TAP — the places a member
 * returns to rather than everything they can reach. The rest is in the drawer.
 *
 * Labels are never hidden behind icons: an icon-only bar is a memory test, and
 * the four words fit. Every target is 56px tall against a 44px floor.
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
  const seasonHref = focused?.currentSeason ? `/seasons/${focused.currentSeason.id}` : "/leagues";
  const leagueHref = focused ? `/leagues/${focused.id}` : "/leagues";

  const tabs = [
    { label: "Home", href: "/leagues", match: "/leagues", exact: true, Icon: HomeIcon },
    { label: "Season", href: seasonHref, match: "/seasons", exact: false, Icon: CalendarDaysIcon },
    { label: "League", href: leagueHref, match: "/leagues", exact: false, Icon: UsersIcon },
    { label: "You", href: "/account", match: "/account", exact: true, Icon: UserIcon },
  ];

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-30 grid grid-cols-4 border-t bg-background md:hidden"
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
