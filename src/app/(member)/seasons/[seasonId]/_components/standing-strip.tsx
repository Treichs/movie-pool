import Link from "next/link";

import { DeadlineCountdown } from "@/components/deadline-countdown";
import { Button } from "@/components/ui/button";
import { ordinal } from "@/lib/format";
import type { HubRank } from "@/lib/season-hub";
import type { Week } from "@/lib/commish";



/** One figure and its label. Tabular, so the four line up on their digits. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </span>
      <span className="type-numeral text-h3">{value}</span>
    </div>
  );
}

/**
 * YOUR STANDING — the viewer's own four numbers, and the deadline beside them.
 *
 * The four are `HubRank`'s, which the hub has already computed. `pointsRank` is
 * null before anything scores — every rank would otherwise read "1st" on an
 * empty season — and renders as a dash rather than as a position nobody holds.
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
    <section
      aria-label="Your standing"
      className="flex flex-wrap items-end justify-between gap-6 rounded border bg-card p-5"
    >
      <div className="flex flex-wrap items-end gap-8">
        <div className="flex flex-col gap-0.5">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Your standing
          </span>
          <span className="type-numeral text-h1 leading-none">
            {me?.pointsRank ? ordinal(me.pointsRank) : "—"}
            {me && me.playerCount > 0 && (
              <span className="type-body ml-2 text-ui text-muted-foreground">
                of {me.playerCount}
              </span>
            )}
          </span>
        </div>
        <Figure label="Points" value={me ? me.points.toFixed(2) : "—"} />
        <Figure
          label="Bankroll left"
          value={bankrollLeft === null ? "—" : `$${bankrollLeft}`}
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
    </section>
  );
}
