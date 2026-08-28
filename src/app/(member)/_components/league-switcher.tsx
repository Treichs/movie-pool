"use client";

import Link from "next/link";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NavLeague } from "@/lib/nav";

/** The mark a league carries in the nav: its chosen glyph, or its first letter. */
function LeagueMark({ league, size }: { league: NavLeague; size: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={
        size === "sm"
          ? "type-micro text-micro flex size-5.5 shrink-0 items-center justify-center rounded-lg bg-foreground text-background"
          : "type-micro text-micro flex size-6 shrink-0 items-center justify-center rounded-lg bg-foreground text-background"
      }
    >
      {league.avatarGlyph ?? league.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** What a league is doing right now, in six words or fewer. */
function leagueState(league: NavLeague): string {
  if (!league.currentSeason) return "No season yet";
  const season = league.currentSeason.name;
  if (league.openWeek) {
    return `${season} · week ${String(league.openWeek.number).padStart(2, "0")} open`;
  }
  return `${season} · between weeks`;
}

/**
 * ONE LEAGUE IN FOCUS, THE REST A CLICK AWAY (ADR-023).
 *
 * The switcher holds the right end of the nav band, which is the shape the
 * shadcnblocks shell puts an organization switcher in — the two are the same
 * idea, and a league is this app's organization.
 *
 * Every field shown here already comes back from `getNavLeagues`; nothing on
 * this component fetches. The zero-league case renders the create prompt
 * instead of an empty trigger, because a switcher with nothing to switch to is
 * a dead control on the one screen a new player sees first.
 */
export function LeagueSwitcher({
  leagues,
  focused,
}: {
  leagues: NavLeague[];
  focused: NavLeague | null;
}) {
  if (leagues.length === 0 || !focused) {
    return (
      <Link
        href="/leagues/new"
        className="type-ui text-ui flex h-8 items-center gap-2 rounded-4xl border border-edge px-3 hover:bg-muted"
      >
        <PlusIcon className="size-4" aria-hidden />
        Start a league
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="type-ui text-ui flex h-8 max-w-66 items-center gap-2 rounded-4xl border border-edge bg-card px-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30"
        aria-label={`League — ${focused.name}`}
      >
        <LeagueMark league={focused} size="sm" />
        <span className="truncate">{focused.name}</span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <div className="type-micro text-micro px-3 pt-2 pb-1 text-muted-foreground">
          Your leagues
        </div>
        {leagues.map((league) => (
          <DropdownMenuItem
            key={league.id}
            render={<Link href={`/leagues/${league.id}`} />}
            className={league.id === focused.id ? "bg-accent" : undefined}
          >
            <LeagueMark league={league} size="md" />
            <span className="flex min-w-0 grow flex-col gap-0.5">
              <span className="type-ui truncate text-ui">{league.name}</span>
              <span className="type-micro text-micro text-muted-foreground">
                {leagueState(league)}
              </span>
            </span>
            {league.id === focused.id && <CheckIcon className="size-4 shrink-0" aria-hidden />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/leagues/new" />}>
          <PlusIcon aria-hidden />
          Start a league
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
