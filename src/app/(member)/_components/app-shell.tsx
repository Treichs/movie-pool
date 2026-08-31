"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";

import { LeagueMark } from "@/components/league-mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveFocusedLeague } from "@/lib/league-focus";
import type { NavLeague } from "@/lib/nav";
import type { ShellAlert } from "@/lib/shell-alerts";

import { AccountMenu } from "./account-menu";
import { BottomNav } from "./bottom-nav";
import { LeagueSwitcher } from "./league-switcher";
import { MobileDrawer } from "./mobile-drawer";
import { isCurrent, leagueLinks, seasonLinks, type NavLink } from "./nav-links";
import { NotificationBell } from "./notification-bell";
import { SearchCommand } from "./search-command";

/**
 * THE SIGNED-IN FRAME — two bands, and the split between them is the point.
 *
 * BAND 1 IS INK, and it is the same black bar the signed-out header already
 * paints: signing in should not change what the top of the app looks like.
 * It is also the only ground in this palette where the accent is legal as
 * text (`--nav-primary` at 5.59:1), which is why the wordmark lives there and
 * why nothing else in the frame is red.
 *
 * BAND 2 IS PAPER, so navigation reads as part of the page rather than as a
 * second black slab, and the league switcher holds its right end.
 *
 * THIS COMPONENT RENDERS NO `<main>`. Every page owns its own landmark; two
 * would fail the accessibility pass on every screen at once.
 *
 * It is a client component because the current-item highlight needs
 * `usePathname`, and because the switcher, the bell and the menus are all
 * interactive. Everything it draws was fetched by `layout.tsx` and passed in —
 * nothing here reaches for data.
 */
export function AppShell({
  leagues,
  alerts,
  profile,
  children,
}: {
  leagues: NavLeague[];
  alerts: ShellAlert[];
  profile: { id: string; name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const focused = resolveFocusedLeague(leagues, pathname);
  const season = seasonLinks(focused);
  const league = leagueLinks(focused);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40">
        <div className="flex h-14 items-center gap-1 bg-nav px-2 text-nav-foreground md:px-8">
          <MobileDrawer leagues={leagues} focused={focused} pathname={pathname} />

          <Link
            href="/leagues"
            className="type-eyebrow text-ui rounded-lg px-2 py-1 text-nav-primary outline-none focus-visible:ring-3 focus-visible:ring-nav-foreground/30"
          >
            <span aria-hidden>TMP</span>
            <span className="sr-only">The Movie Pool — home</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <SearchCommand />
            <NotificationBell alerts={alerts} />
            <AccountMenu name={profile.name} email={profile.email} profileId={profile.id} />
          </div>
        </div>

        {/* THE NAV BAND, desktop only. On a phone these two groups live in the
            drawer, because a dropdown that opens under a thumb is a worse
            control than a list you can scroll. */}
        <div className="hidden h-13 items-center gap-1 border-b bg-background px-8 md:flex">
          <NavItem href="/leagues" label="Home" current={isCurrent(pathname, "/leagues", true)} />
          <NavGroup label="Season" links={season} pathname={pathname} />
          <NavGroup label="League" links={league} pathname={pathname} />
          <div className="ml-auto">
            <LeagueSwitcher leagues={leagues} focused={focused} />
          </div>
        </div>

        {/* The phone's stand-in for the switcher, which is inside the drawer
            there: without it nothing on screen says which league you are
            looking at, and a member can belong to several. */}
        {focused && (
          <div className="flex h-12 items-center gap-2 border-b bg-background px-4 md:hidden">
            <LeagueMark
              id={focused.id}
              name={focused.name}
              className="size-5.5"
            />
            <span className="type-ui truncate text-ui">{focused.name}</span>
          </div>
        )}
      </header>

      <div className="flex-1">{children}</div>

      <BottomNav focused={focused} pathname={pathname} />
    </div>
  );
}

function NavItem({
  href,
  label,
  current,
}: {
  href: string;
  label: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`type-ui text-ui flex h-8 items-center rounded-4xl px-3 ${
        current ? "bg-accent" : "hover:bg-muted"
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * A group renders NOTHING when the league in focus cannot fill it — a season
 * dropdown with no season in it is a control that answers a question nobody
 * can ask yet.
 */
function NavGroup({
  label,
  links,
  pathname,
}: {
  label: string;
  links: NavLink[];
  pathname: string;
}) {
  if (links.length === 0) return null;
  const active = links.some((link) => isCurrent(pathname, link.match, link.exact));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`type-ui text-ui flex h-8 items-center gap-1.5 rounded-4xl px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/30 ${
          active ? "bg-accent" : "hover:bg-muted"
        }`}
      >
        {label}
        <ChevronDownIcon
          className={`size-3 ${active ? "text-foreground" : "text-muted-foreground"}`}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {links.map((link) => (
          <DropdownMenuItem
            key={link.href}
            render={<Link href={link.href} />}
            className={isCurrent(pathname, link.match, link.exact) ? "bg-accent" : undefined}
          >
            {link.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
