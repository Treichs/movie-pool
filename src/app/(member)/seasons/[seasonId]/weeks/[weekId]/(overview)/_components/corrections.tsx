import { ShieldAlertIcon } from "lucide-react";

import { formatDateFull } from "@/lib/format";
import type { WeekOverride } from "@/lib/week-board";

/**
 * WHAT THE COMMISSIONER CHANGED AFTER THE FACT — ADR-060, board 3.2's foot.
 *
 * ── CORRECTIONS CARRY INK, NOT RED ───────────────────────────────────────
 * `--destructive` is for a destructive ACTION — something the reader is about
 * to do and might regret. A correction is a record: it already happened, it is
 * usually right, and it is nobody's mistake to fear. And red beside this app's
 * red reads as one thing, which is the Global Constraint the accent is capped
 * by. So the panel is bordered in ink and shouts by weight instead of hue.
 *
 * ── IT IS ALWAYS RENDERED WHEN THERE IS ANYTHING TO SAY ─────────────────
 * A changed score with no note is how a week quietly stops matching the
 * standings beside it. `get_week_overrides` returns a trimmed payload (the
 * audit log itself is deny-all, ADR-054), so everything here is already meant
 * to be read by a player.
 */

function describe(o: WeekOverride): string {
  const title = o.title ?? "A film";
  switch (o.action) {
    case "remove_film":
      return `${title} was removed after bidding closed. It scores for nobody and every bid on it was refunded in full.`;
    case "override_film_score":
      return `${title}'s captured result was corrected.`;
    case "override_bid_amount":
      return `A bid on ${title} was corrected.`;
  }
}

export function Corrections({ overrides }: { overrides: WeekOverride[] }) {
  if (overrides.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <h2>Corrections</h2>
      <div className="flex gap-3 rounded border-2 border-foreground p-4">
        <ShieldAlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <ul className="flex flex-col gap-3">
          {overrides.map((o) => (
            <li key={o.id} className="flex flex-col gap-0.5">
              <span className="type-ui text-ui">{describe(o)}</span>
              {o.reason && (
                <span className="type-body text-ui text-muted-foreground">
                  “{o.reason}”
                </span>
              )}
              <span className="type-body text-micro text-muted-foreground">
                {o.actorName ?? "The commissioner"} ·{" "}
                {formatDateFull(o.at.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
