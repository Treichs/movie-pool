import Link from "next/link";

import { DeadlineCountdown } from "@/components/deadline-countdown";
import { Figure } from "@/components/figure";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { HubRank } from "@/lib/season-hub";
import type { Week } from "@/lib/commish";

/**
 * WHAT YOU HAVE LEFT, AND WHAT YOU HAVE TO DO — the strip above the tabs.
 *
 * ── IT USED TO SAY WHERE YOU STAND, AND NO LONGER DOES ────────────────────
 * This carried your rank and your season points until 2026-08-31, when the
 * Leaderboard tab grew a position block that says the same thing with the
 * movement, the rivals and the money attached. Two readouts of one rank in one
 * viewport is the duplication the redesign existed to remove, and the strip is
 * the one that gives it up: it sits above all three tabs, so its job is the
 * part that is true whichever tab you are on.
 *
 * What is left is the ACTION register — the bankroll that governs what you can
 * bid, what you already hold, the deadline, and the way in. Position belongs to
 * the screen that analyses it.
 *
 * `me` is still the source for films owned, and is null before a season has any
 * standing at all.
 */
export function StandingStrip({
  me,
  bankrollLeft,
  openWeek,
  seasonId,
}: {
  me: HubRank | null;
  bankrollLeft: number | null;
  openWeek: Week | null;
  seasonId: string;
}) {
  const deadline = openWeek?.bid_deadline_override ?? openWeek?.bid_deadline;

  return (
    <Card
      variant="flat"
      role="region"
      aria-label="Your bankroll and the open week"
      className="flex-row flex-wrap items-end justify-between gap-6"
    >
      <div className="flex flex-wrap items-end gap-8">
        <Figure
          label="Bankroll left"
          value={bankrollLeft === null ? "—" : `$${bankrollLeft}`}
          size="lg"
        />
        <Figure label="Films owned" value={me ? String(me.filmsOwned) : "—"} />
      </div>

      {openWeek && deadline && (
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end gap-0.5">
            <span className="type-eyebrow text-eyebrow text-muted-foreground">
              Week {String(openWeek.number).padStart(2, "0")} closes in
            </span>
            <DeadlineCountdown target={deadline} size="inline" />
          </div>
          <Button
            render={
              <Link href={`/seasons/${seasonId}/weeks/${openWeek.id}/bid`} />
            }
            nativeButton={false}
            variant="ink"
          >
            Place your bids
          </Button>
        </div>
      )}
    </Card>
  );
}
