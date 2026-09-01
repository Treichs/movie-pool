import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";

import { Figure } from "@/components/figure";
import { ordinal } from "@/lib/format";
import type { MyPosition } from "@/lib/season-story";
import { cn } from "@/lib/utils";

/**
 * YOUR POSITION — the first thing the leaderboard says, and the one number the
 * screen is about.
 *
 * ── IT IS NOT A CARD, ON PURPOSE ──────────────────────────────────────────
 * Everything else on this tab is a bordered sheet. This sits directly on the
 * page under a 2px ink rule, which is the only place in the app that rule
 * appears outside a navigation band — a masthead's weight rather than a
 * panel's. A tile of the same numbers would read as the first of several
 * equals; it is not, and the rule is what says so.
 *
 * ── THE MONEY IS SHOWN IN DOLLARS, DECIDED 2026-08-31 ─────────────────────
 * "3rd pays $20 back" is what makes a standing mean something in a league that
 * has a buy-in. It is a PROJECTION and nothing is owed until the commissioner
 * finalises — the wording says *pays*, never *won* — and a practice league
 * gets `money: null` and no dollars at all rather than a ladder of zeros.
 *
 * A place two players are tied on is marked SHARED and the figure is left as
 * the place's own value. How a tied place divides is a rulebook question, and
 * printing the full prize against each of two tied players would be this
 * screen answering it wrongly.
 *
 * ── WHY THE PLACE ABOVE CAN APPEAR ONCE OR TWICE ──────────────────────────
 * The nearest player above and the next paying place are often the same
 * person, and printing both would be the same gap twice under two labels. When
 * they coincide the money version wins: it carries the gap AND what closing it
 * is worth.
 */
export function PositionBlock({ position }: { position: MyPosition }) {
  const { money, chasing, pursuedBy, delta, form } = position;

  // The place above is already spoken for when it is also the next place that
  // pays. See the header.
  const showChasing =
    chasing !== null &&
    !(money?.next != null && money.next.place.place === chasing.rank);

  return (
    <section aria-label="Your position" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
        <div className="flex flex-col gap-1">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Your position
          </span>
          <span className="flex items-baseline gap-2">
            <span className="type-numeral text-numeral-xl leading-none">
              {ordinal(position.rank)}
            </span>
            <span className="type-body text-ui text-muted-foreground">
              of {position.playerCount}
            </span>
          </span>
          {position.sharedWith > 0 && (
            <span className="type-body text-micro text-muted-foreground">
              Tied with {position.sharedWith}{" "}
              {position.sharedWith === 1 ? "other player" : "other players"}
            </span>
          )}
        </div>

        {delta && <PlacesMoved places={delta.places} sinceWeek={delta.sinceWeek} />}

        <Figure
          label="Season points"
          value={position.points.toFixed(2)}
          size="lg"
        />

        {form && (
          <Figure
            label={form.weeks === 1 ? "Last week" : `Last ${form.weeks} weeks`}
            value={form.points.toFixed(2)}
            size="lg"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-5 border-t-2 border-foreground pt-4">
        {money?.holding && (
          <Figure
            label={
              money.holding.kind === "third"
                ? `${ordinal(money.holding.place)} — buy-in back`
                : `${ordinal(money.holding.place)} currently pays`
            }
            value={
              <>
                ${money.holding.amount}
                {money.holding.heldBy > 1 && (
                  <span className="type-micro ml-2 text-micro text-muted-foreground">
                    Shared
                  </span>
                )}
              </>
            }
          />
        )}

        {money?.next && (
          <Figure
            label={`To ${ordinal(money.next.place.place)} · $${money.next.place.amount}`}
            value={`${money.next.gap.toFixed(2)} pts`}
          />
        )}

        {money !== null && !money.holding && !money.next && (
          <Figure label="Prize money" value="Top place held" />
        )}

        {showChasing && chasing && (
          <Figure
            label={`${chasing.name} ahead`}
            value={`${chasing.gap.toFixed(2)} pts`}
          />
        )}

        {pursuedBy && (
          <Figure
            label={`${pursuedBy.name} behind`}
            value={`${pursuedBy.gap.toFixed(2)} pts`}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Places gained or lost since the previous scored week.
 *
 * Direction is carried three ways — the word, the arrow and the colour —
 * because colour alone is not a signal a screen reader or a colour-blind
 * player receives. The arrow is drawn from the icon set rather than typed as
 * an arrow character, and is hidden from assistive technology because the word
 * beside it already says which way.
 */
function PlacesMoved({ places, sinceWeek }: { places: number; sinceWeek: number }) {
  const held = places === 0;
  const gained = places > 0;
  const count = Math.abs(places);

  return (
    <div className="flex flex-col gap-1">
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        Since week {String(sinceWeek).padStart(2, "0")}
      </span>
      <span
        className={cn(
          "type-numeral inline-flex items-center gap-1.5 text-h2",
          gained && "text-success",
          !gained && !held && "text-destructive",
        )}
      >
        {!held &&
          (gained ? (
            <ArrowUpRightIcon aria-hidden className="size-6 shrink-0" />
          ) : (
            <ArrowDownRightIcon aria-hidden className="size-6 shrink-0" />
          ))}
        {held ? "Held" : `${gained ? "Up" : "Down"} ${count}`}
        {!held && (
          <span className="type-body text-ui">
            {count === 1 ? "place" : "places"}
          </span>
        )}
      </span>
    </div>
  );
}
