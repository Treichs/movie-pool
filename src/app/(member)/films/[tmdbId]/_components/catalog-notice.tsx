import Link from "next/link";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CatalogLeague } from "@/lib/film-catalog";

/**
 * "YOU ARE LOOKING AT THE CATALOG" — board 2.2's dashed panel.
 *
 * It is the page saying what it is NOT. Bids, owners and scores are
 * league-local (ADR-408), so rather than leave a reader wondering why a film
 * they bid on shows no bid, the page names the boundary and offers the way
 * across it.
 *
 * ── A PANEL, NOT AN `Alert` ───────────────────────────────────────────────
 * The registry's `Alert` is the right shape and the wrong semantics: it hard-
 * codes `role="alert"`, an assertive live region, so a screen reader would
 * interrupt to announce this the moment the page loaded. Nothing here has
 * changed or gone wrong — it is standing explanatory copy, which is a panel.
 *
 * ── THE CONTROL CHANGES WITH THE COUNT, BECAUSE THE QUESTION DOES ────────
 * One league is not a choice, so it is a link straight there. Several is a
 * choice, so it is a menu. None means there is nowhere to go, and the sentence
 * stands on its own rather than beside a control that cannot do anything.
 */
export function CatalogNotice({
  leagues,
  tmdbId,
}: {
  leagues: CatalogLeague[];
  tmdbId: number;
}) {
  const href = (leagueId: string) => `/leagues/${leagueId}/films/${tmdbId}`;

  return (
    <Card
      variant="flat"
      className="flex-row flex-wrap items-center justify-between gap-6 border-dashed"
    >
      <div className="flex flex-col gap-1">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          You are looking at the catalog
        </span>
        <p className="type-body text-ui text-muted-foreground">
          {leagues.length === 0
            ? "Bids, owners and scores are league-local. Join a league to see how a film played there."
            : "Bids, owners and scores are league-local. Pick a league to see how this film played there."}
        </p>
      </div>

      {leagues.length === 1 && (
        // `nativeButton={false}` because this renders an `<a>`: Base UI warns
        // when a component that acts as a button is not a native <button>.
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={href(leagues[0].id)} />}
        >
          {leagues[0].name}
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      )}

      {leagues.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>
            Pick a league
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {leagues.map((l) => (
              <DropdownMenuItem
                key={l.id}
                render={<Link href={href(l.id)} />}
              >
                {l.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Card>
  );
}
