import Link from "next/link";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";

import { DeadlineCountdown } from "@/components/deadline-countdown";
import { Figure } from "@/components/figure";
import { Button } from "@/components/ui/button";
import { ordinal } from "@/lib/format";
import type { MyPosition } from "@/lib/season-story";
import type { Week } from "@/lib/commish";
import { cn } from "@/lib/utils";

/**
 * THE HERO — where you stand, what it is worth, and the one thing still asking
 * for something from you. It is the whole top of Season Home.
 *
 * ── IT IS TWO COMPONENTS THAT USED TO SIT APART ───────────────────────────
 * `PositionBlock` opened the Leaderboard tab and `StandingStrip` sat above all
 * three tabs, and between them they printed the viewer's season twice under
 * two headings. With the tabs gone there is one surface and no reason for two:
 * position, the money, the field, the bankroll and the deadline are one
 * reading, and the page is about the number at the top of it.
 *
 * ── IT IS NOT A CARD, AND THAT IS THE POINT ───────────────────────────────
 * Everything below it is a bordered sheet in a grid. This sits directly on the
 * paper, divided by two rules — a 2px ink rule under the position, a 1px rule
 * above the action. That ink rule is the only place in the app it appears
 * outside a navigation band: a masthead's weight rather than a panel's. Put
 * this in a card and it becomes the first of nine equals, which is exactly what
 * it is not.
 *
 * ── THREE REGISTERS, AND EACH ANSWERS A DIFFERENT QUESTION ────────────────
 * Where am I · what is it worth and who is near me · what have I got and what
 * is due. The third register is the only one carrying the accent, because the
 * accent means *live and yours* and the open week is the only live thing on
 * the page.
 *
 * ── THE MONEY IS A PROJECTION AND THE WORDING SAYS SO ─────────────────────
 * "3rd pays $20 back" is what makes a standing mean something in a league with
 * a buy-in. Nothing is owed until the commissioner finalises — the word is
 * always *pays*, never *won* — and a practice league gets `money: null` and no
 * dollars at all rather than a ladder of zeros. A place two players are tied on
 * is marked SHARED and the figure left at the place's own value: how a tie
 * divides is a rulebook question, and printing the full prize against both
 * would be this screen answering it wrongly.
 *
 * ── WHY THE PLACE ABOVE CAN APPEAR ONCE OR TWICE ──────────────────────────
 * The nearest player above and the next paying place are often the same person,
 * and printing both would be the same gap twice under two labels. When they
 * coincide the money version wins: it carries the gap AND what closing it is
 * worth.
 */
export function SeasonHero({
  position,
  bankrollLeft,
  filmsOwned,
  efficiency,
  openWeek,
  seasonId,
}: {
  /** Null until something has scored — every player would otherwise be 1st. */
  position: MyPosition | null;
  bankrollLeft: number | null;
  filmsOwned: number | null;
  /** Season points per dollar. Null until the viewer has spent a dollar. */
  efficiency: number | null;
  openWeek: Week | null;
  seasonId: string;
}) {
  const deadline = openWeek?.bid_deadline_override ?? openWeek?.bid_deadline;
  const money = position?.money ?? null;
  const chasing = position?.chasing ?? null;

  // The place above is already spoken for when it is also the next place that
  // pays. See the header.
  const showChasing =
    chasing !== null &&
    !(money?.next != null && money.next.place.place === chasing.rank);

  return (
    <section aria-label="Your season" className="flex flex-col gap-4">
      {position ? (
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

          {position.delta && (
            <PlacesMoved
              places={position.delta.places}
              sinceWeek={position.delta.sinceWeek}
            />
          )}

          <Figure
            label="Season points"
            value={position.points.toFixed(2)}
            size="lg"
          />

          {position.form && (
            <Figure
              label={
                position.form.weeks === 1
                  ? "Last week"
                  : `Last ${position.form.weeks} weeks`
              }
              value={position.form.points.toFixed(2)}
              size="lg"
            />
          )}
        </div>
      ) : (
        // NO RANK IS INVENTED BEFORE A WEEK SCORES. Dense ranking would put the
        // whole league in 1st, and a hero reading "1st of 11" for everybody is
        // worse than a sentence saying the season has not started scoring.
        <div className="flex flex-col gap-1">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Your position
          </span>
          <p className="type-dek max-w-measure-tight text-ui text-muted-foreground">
            Nothing has scored yet. Your place appears the first Monday a week
            is captured.
          </p>
        </div>
      )}

      {(money?.holding || money?.next || showChasing || position?.pursuedBy) && (
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

          {position?.pursuedBy && (
            <Figure
              label={`${position.pursuedBy.name} behind`}
              value={`${position.pursuedBy.gap.toFixed(2)} pts`}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-t pt-4">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <Figure
            label="Bankroll left"
            value={bankrollLeft === null ? "—" : `$${bankrollLeft}`}
          />
          <Figure
            label="Films owned"
            value={filmsOwned === null ? "—" : String(filmsOwned)}
          />
          {/* Points per dollar was the You tab's third delta. It is the stat
              that separates good bidding from a big bankroll, and it belongs
              beside the bankroll it is a ratio of. A player who has not spent
              has no ratio — a dash, never a zero. */}
          <Figure
            label="Points per dollar"
            value={efficiency === null ? "—" : efficiency.toFixed(2)}
          />
        </div>

        {openWeek && deadline && (
          // FULL WIDTH ON A PHONE. Wrapped into the figure row it landed
          // half-indented under "Points per dollar", which reads as a fourth
          // figure rather than as the thing the page is asking you to do.
          <div className="flex w-full flex-wrap items-center justify-between gap-4 sm:w-auto sm:justify-start">
            <div className="flex flex-col gap-0.5">
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
      </div>
    </section>
  );
}

/**
 * Places gained or lost since the previous scored week.
 *
 * Direction is carried three ways — the word, the arrow and the colour —
 * because colour alone is not a signal a screen reader or a colour-blind player
 * receives. The arrow is drawn from the icon set rather than typed as an arrow
 * character, and is hidden from assistive technology because the word beside it
 * already says which way.
 */
function PlacesMoved({
  places,
  sinceWeek,
}: {
  places: number;
  sinceWeek: number;
}) {
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
