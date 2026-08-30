import { Figure } from "@/components/figure";
import { Card } from "@/components/ui/card";
import { ordinal } from "@/lib/format";
import { formatPoints, type MyPayout } from "@/lib/payouts";

/**
 * YOUR RESULT OPENS THE PAGE — boards 5.1a and 5.1b, IDENTICALLY.
 *
 * This is the half of the merge that has to survive. A commissioner is a
 * player too, and their own result is not demoted to make room for the
 * controls; the controls went to the foot instead. If this panel ever moves
 * down to accommodate something, the merge has failed and the IA map says to
 * raise it rather than ship it.
 *
 * ── THE SPINE IS THE ACCENT HERE, NOT INK ──────────────────────────────
 * Every other leading panel in this app takes an ink spine. This one is
 * `--primary`, exactly as both boards draw it: it is the reader's OWN money at
 * the end of a season, which is the one thing on any of these screens that
 * earns the accent. It is spent once — no other red appears on the page.
 *
 * ── TENSE FOLLOWS THE STATUS ───────────────────────────────────────────
 * A draft says "You would finish" and "You would receive", because the season
 * is still moving and every number here changes on Monday. A final one states
 * it flat. Saying "You receive $40" about a draft would be the page promising
 * money it cannot pay.
 */
export function YourResult({
  mine,
  isFinal,
}: {
  mine: MyPayout;
  isFinal: boolean;
}) {
  const owes = mine.net < 0;
  const amount = `$${Math.abs(mine.net)}`;

  return (
    <Card
      variant="flat"
      className="flex-row flex-wrap items-center gap-x-11 gap-y-6 border-l-4 border-l-primary p-7"
    >
      <Figure
        label={isFinal ? "You finished" : "You would finish"}
        value={ordinal(mine.place)}
        size="hero"
      />
      <Figure label="Points" value={formatPoints(mine.points)} size="lg" />
      <Figure label="Spent" value={`$${mine.spent}`} size="lg" />

      <div className="flex flex-col items-end gap-1 sm:ms-auto">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          {owes
            ? isFinal
              ? "You owe"
              : "You would owe"
            : isFinal
              ? "You receive"
              : "You would receive"}
        </span>
        <span className="type-numeral text-numeral-xl">{amount}</span>
        <span className="type-body text-micro text-muted-foreground">
          {isFinal
            ? owes
              ? "Settle it with your commissioner."
              : "Your commissioner is collecting and paying out."
            : "On today's standings — these numbers move every Monday."}
        </span>
      </div>
    </Card>
  );
}
