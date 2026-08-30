import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { Figure } from "@/components/figure";
import { Card } from "@/components/ui/card";
import { ordinal } from "@/lib/format";
import type { MyWeek } from "@/lib/week-board-view";

/**
 * YOUR RESULT OPENS THE PAGE — board 3.2's first panel, and its first rule.
 *
 * The reveal below is about everyone; this is about the reader, and it comes
 * first because "how did I do" is the question that brought them here. Same
 * ink spine as the film record on board 2.3, for the same reason: this is the
 * page's own conclusion rather than one of its sections.
 *
 * ── "2 OF 3" COUNTS FILMS YOU BID ON, NOT FILMS ON THE SLATE ────────────
 * A slate of six that you looked at once is not a week you went 1-for-6 in.
 * The denominator is what you actually reached for.
 *
 * ── A SMALLER RANK IS A BETTER ONE ──────────────────────────────────────
 * `rankDelta` is already inverted by the composer so a positive number means
 * the reader moved UP; the arrow follows the sign and the words say which way
 * out loud, because an arrow alone is ambiguous when the number below it went
 * from 3rd to 2nd.
 */

const two = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function Move({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="type-body text-micro text-muted-foreground">
        held position
      </span>
    );
  }
  const up = delta > 0;
  const places = Math.abs(delta);
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span className="type-body flex items-center gap-1 text-micro text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {up ? "up" : "down"} {places === 1 ? "one" : places}
    </span>
  );
}

export function YourWeek({ mine, scored }: { mine: MyWeek; scored: boolean }) {
  return (
    <Card
      variant="flat"
      className="flex-row flex-wrap items-center gap-x-10 gap-y-6 border-l-4 border-l-foreground"
    >
      <Figure
        label="Your week"
        value={scored ? two(mine.score) : "—"}
        size="hero"
      />
      <Figure label="Spent" value={`$${mine.spent}`} size="lg" />
      <Figure
        label="Films won"
        value={`${mine.filmsWon} of ${mine.filmsBid}`}
        size="lg"
      />
      <Figure
        label="Points per dollar"
        value={
          scored && mine.efficiency !== null ? two(mine.efficiency) : "—"
        }
        size="lg"
      />

      {mine.rank !== null && (
        <div className="flex flex-col items-end gap-1 sm:ms-auto">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Moved you to
          </span>
          <div className="flex items-baseline gap-2">
            <span className="type-numeral text-h2">{ordinal(mine.rank)}</span>
            {mine.rankDelta !== null && <Move delta={mine.rankDelta} />}
          </div>
        </div>
      )}
    </Card>
  );
}
