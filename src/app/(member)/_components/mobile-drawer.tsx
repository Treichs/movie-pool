"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon, PlusIcon } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavLeague } from "@/lib/nav";

import { isCurrent, leagueLinks, seasonLinks, type NavLink } from "./nav-links";

/**
 * THE PHONE'S OTHER HALF. The bottom bar carries the four places you go
 * repeatedly; everything else is in here — both nav groups, the league list,
 * and the account items, which is exactly what the desktop dropdowns hold.
 *
 * It closes on navigation. Next's client router does not unmount the layout
 * between routes, so a sheet left open would still be open on the page you
 * just navigated to, covering it.
 */
export function MobileDrawer({
  leagues,
  focused,
  pathname,
}: {
  leagues: NavLeague[];
  focused: NavLeague | null;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const season = seasonLinks(focused);
  const league = leagueLinks(focused);

  const item = (link: NavLink) => (
    <Link
      key={link.href}
      href={link.href}
      onClick={() => setOpen(false)}
      className={`type-ui text-ui flex h-11 items-center px-5 ${
        isCurrent(pathname, link.match, link.exact) ? "bg-accent" : "hover:bg-muted"
      }`}
    >
      {link.label}
    </Link>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="flex size-11 items-center justify-center rounded-4xl text-nav-foreground outline-none hover:bg-nav-foreground/10 focus-visible:ring-3 focus-visible:ring-nav-foreground/30 md:hidden"
        aria-label="Open menu"
      >
        <MenuIcon className="size-5.5" aria-hidden />
      </SheetTrigger>

      <SheetContent side="left" className="w-75 gap-0 bg-background p-0" showCloseButton={false}>
        <div className="flex h-14 shrink-0 items-center bg-nav px-5">
          <SheetTitle className="type-eyebrow text-ui text-nav-primary">
            <span aria-hidden>TMP</span>
            <span className="sr-only">The Movie Pool — menu</span>
          </SheetTitle>
        </div>

        <div className="flex flex-col gap-1.5 overflow-y-auto py-4">
          <span className="type-micro text-micro px-5 text-muted-foreground">Your leagues</span>
          {leagues.map((l) => (
            <Link
              key={l.id}
              href={`/league/${l.id}`}
              onClick={() => setOpen(false)}
              className={`type-ui text-ui flex h-11 items-center gap-2.5 px-5 ${
                l.id === focused?.id ? "bg-accent" : "hover:bg-muted"
              }`}
            >
              <span
                aria-hidden
                className="type-micro text-micro flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground text-background"
              >
                {l.avatarGlyph ?? l.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{l.name}</span>
            </Link>
          ))}
          <Link
            href="/league/new"
            onClick={() => setOpen(false)}
            className="type-ui text-ui flex h-11 items-center gap-2.5 px-5 hover:bg-muted"
          >
            <PlusIcon className="size-4" aria-hidden />
            Start a league
          </Link>

          {season.length > 0 && (
            <>
              <span className="type-micro text-micro mt-3 px-5 text-muted-foreground">Season</span>
              {season.map(item)}
            </>
          )}

          {league.length > 0 && (
            <>
              <span className="type-micro text-micro mt-3 px-5 text-muted-foreground">League</span>
              {league.map(item)}
            </>
          )}
        </div>

        <div className="mt-auto flex shrink-0 flex-col border-t py-2">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="type-ui text-ui flex h-11 items-center px-5 hover:bg-muted"
          >
            Account settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="type-ui text-ui flex h-11 w-full items-center px-5 text-left hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
