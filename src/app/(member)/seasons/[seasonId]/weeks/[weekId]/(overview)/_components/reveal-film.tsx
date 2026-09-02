import Image from "next/image";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, FilmIcon } from "lucide-react";

import { Figure } from "@/components/figure";
import { Card } from "@/components/ui/card";
import { numberWord } from "@/lib/format";
import { posterUrl } from "@/lib/tmdb-urls";
import type { RevealFilm } from "@/lib/reveal";
import { cn } from "@/lib/utils";

/**
 * ONE FILM, REVEALED — board 3.2's row.
 *
 * ── TWO REGISTERS, DIVIDED BY THE INK RULE ──────────────────────────────
 * Poster, title and the three figures sit above a 2px ink rule; the bid
 * ladder runs the full width of the sheet below it. That is Season Home's
 * hero shape borrowed deliberately: what the film IS and what it EARNED is
 * one reading, and who bid what against it is another.
 *
 * The row used to nest the ladder inside the column beside the poster, which
 * cost every bar 96px of width and pushed the three figures into a
 * right-aligned cluster that had to wrap on a phone. Stacking the figures
 * under the title and handing the ladder the whole sheet spends that width on
 * the two things the reveal is for.
 *
 * The figures are `Figure`, the same unit the hero sets its money in, rather
 * than a fourth local re-spelling of label-over-numeral.
 *
 * ── THE OWNERS LINE STATES THE TIE, BECAUSE THE TIE IS THE MISREAD RULE ──
 * "Three winning tiers" means three distinct AMOUNTS, not three people: a tie
 * at the cut lets four players in, and all four earn the full score. The board
 * spells that out beside the chips rather than leaving a reader to count the
 * names and conclude the rule is broken.
 *
 * ── THE BOARD DIMS THE WHOLE ROW. THIS DIMS ONLY THE ARTWORK ────────────
 * Board 3.2 fades an unowned row to 72%, which reads well and costs too much:
 * `--muted-foreground` at 72% over card white lands near 2.7:1, under the 4.5
 * this app holds every string to. The intent — yours stands out — is kept by
 * inverting it. The owned row takes an INK border (the same "weight without
 * colour" the ink button variant exists for, and the accent is already spent
 * elsewhere on this page), and only the POSTER of an unowned row fades. No
 * text loses contrast anywhere.
 *
 * Losing a tier is also said in words, with the amount, because "you bid $2"
 * is the sentence a player actually wants and no amount of fading carries it.
 *
 * ── IT NOW REVEALS THE BIDS, WHICH IT DID NOT ──────────────────────────
 * Until 2026-09-01 this row drew a chip per WINNER and dropped the rest of
 * `film.rows` on the floor — so a reveal showed who won and never showed who
 * bid. Every losing amount, the cut they fell under and the spread above it
 * were computed by `reveal.ts`, carried across the wire, and thrown away. The
 * ladder below is what the sheet was always for.
 *
 * ── THE BARS SCALE TO THE WEEK, NOT TO THE FILM (ADR-096) ───────────────
 * A $2 film must LOOK smaller than a $20 one. Scaling each film to its own top
 * bid would draw every film the same size and delete the comparison that makes
 * the sheet worth scrolling.
 *
 * ── THE POSTER LEADS TO THE LEAGUE'S RECORD, NOT THE CATALOG ────────────
 * Same destination the bid page's card takes: `/leagues/[id]/films/[tmdbId]`
 * carries the play, and the catalog page explicitly does not (ADR-408).
 */

const two = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * The sentence under the chips. Null when there is nothing worth saying.
 *
 * It counts the DISTINCT AMOUNTS THAT ACTUALLY WON, not the season's tier
 * setting: on a film only two people bid on, "three winning tiers" is the rule
 * and "two distinct amounts" is what happened, and the reader is looking at
 * what happened.
 */
function ownersNote(film: RevealFilm): string | null {
  // A removed film has no tiers to explain — `is_winning` is still set on its
  // bids (removal refunds the money without rewriting the close), so the tie
  // arithmetic below would happily describe an outcome that was undone.
  if (film.removed) return null;

  const winners = film.rows.filter((r) => r.isWinning);
  const distinct = new Set(winners.map((r) => r.amount));

  // BOTH SENTENCES, WHEN BOTH ARE TRUE — and until 2026-08-31 they were an
  // if/else, so the tie won and the reader's own losing bid was never
  // mentioned. That is precisely backwards on the film it matters most: a tie
  // AT THE CUT is what pushed somebody out, and the somebody is often the
  // person reading. "Four owners" without "and you bid $3" answers a question
  // they did not ask instead of the one they did.
  const parts: string[] = [];

  if (winners.length > distinct.size) {
    // Which amount was shared. The lowest one, when more than one tie exists —
    // that is the tie at the cut, and it is the one that changed the outcome.
    const tied = [...distinct]
      .filter((a) => winners.filter((r) => r.amount === a).length > 1)
      .sort((a, b) => a - b)[0];
    parts.push(
      `${numberWord(distinct.size)} distinct amount${distinct.size === 1 ? "" : "s"} — a tie at $${tied} gives ${numberWord(winners.length)} owners.`,
    );
  }

  const mine = film.rows.find((r) => r.isMe);
  if (mine && !mine.isWinning) {
    parts.push(
      `You bid $${mine.amount} and lost the tier — ${numberWord(distinct.size)} distinct amount${distinct.size === 1 ? "" : "s"} above yours.`,
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

/**
 * THE ARITHMETIC, SPELLED OUT — `$24.6M × 62% = 15.25`.
 *
 * The three stats above already carry every number in this sentence, and the
 * multiplication between them was left for the reader to perform. Printing it
 * is the single best-evidenced change available on this page: Grimmelikhuijsen
 * (Public Administration Review, 2023; two experiments, n = 897) found that
 * EXPLAINING a computed outcome moves trust substantially more than making the
 * rules accessible does — and that the gain transfers to the human whose
 * decision it was. A linked rulebook is accessibility. This is explainability,
 * and the trust it buys lands on the commissioner as well as the app.
 *
 * Null until both inputs are captured; a half-scored film explains nothing.
 */
function scoreWorking(film: RevealFilm): string | null {
  if (
    film.score === null ||
    film.boxOfficeM === null ||
    film.tomatometer === null
  ) {
    return null;
  }
  return `$${film.boxOfficeM}M × ${film.tomatometer}% = ${two(film.score)}`;
}

/**
 * A bid's share of the week's biggest one, floored so a $1 bid beside a $20 one
 * is still a mark rather than a hairline nobody can see.
 */
function share(amount: number, weekTop: number): number {
  if (weekTop <= 0) return 0;
  return Math.max(4, Math.round((amount / weekTop) * 100));
}

/**
 * THE CASCADE'S STAGGER, in two axes: the sheet opens film after film, and
 * within a film bid after bid, so the reveal reads DOWN the page the way a
 * sealed envelope is opened rather than every bar arriving at once.
 *
 * Both are capped. A slate of nine films with eleven bidders each would
 * otherwise make the last bar wait out an arithmetic sequence, and a ceremony
 * that outlasts its audience is a loading screen.
 */
function delayOf(filmIndex: number, rowIndex: number): number {
  return Math.min(filmIndex * 110, 660) + Math.min(rowIndex * 55, 550);
}

/**
 * HOW FAR THIS FILM MOVED when the sheet re-ranked — the whole point of the
 * re-rank, said in a number so it survives the animation being missed.
 *
 * Direction is carried by the word as well as the arrow and the colour: an
 * arrow alone is ambiguous about whether "up" means a better place or a bigger
 * number, and colour alone reaches nobody using a screen reader.
 */
function Moved({ places }: { places: number }) {
  if (places === 0) {
    return (
      <span className="type-micro text-micro text-muted-foreground">
        held its place
      </span>
    );
  }
  const up = places > 0;
  const Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span
      className={cn(
        "type-micro inline-flex items-center gap-1 text-micro",
        up ? "text-success" : "text-destructive",
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {up ? "up" : "down"} {Math.abs(places)}
      {Math.abs(places) === 1 ? " place" : " places"}
    </span>
  );
}

export function RevealFilmRow({
  film,
  weekTop,
  index = 0,
  move = null,
  leagueId,
}: {
  film: RevealFilm;
  /** The biggest bid ANYWHERE in the week — the bars' shared scale. */
  weekTop: number;
  /** Position on the sheet, which is this film's place in the cascade. */
  index?: number;
  /** Places gained against the bid order. Null outside the re-ranked view. */
  move?: number | null;
  leagueId: string | null;
}) {
  const poster = posterUrl(film.posterPath);
  const note = ownersNote(film);
  const working = scoreWorking(film);
  const href =
    leagueId && film.tmdbId
      ? `/leagues/${leagueId}/films/${film.tmdbId}`
      : null;

  // The captured Tomatometer if there is one, otherwise the cached live figure
  // — which exists ONLY before capture (ADR-062) and is labelled as such.
  const tomato = film.tomatometer ?? film.liveTomatometer;

  return (
    <Card
      variant="flat"
      className={cn(
        "grid grid-cols-[6rem_1fr] overflow-hidden p-0 lg:grid-cols-[11rem_16rem_1fr]",
        film.iOwn && "border-foreground",
      )}
    >
      {/* THE LADDER GOES BESIDE THE FILM, NOT UNDER IT.
          Stacked, this card wasted its width twice over: an $18 bar was drawn
          630px long when 400 says the same thing, while the film's own numbers
          huddled in 400px and the poster column padded the remaining height out
          in grey. The tall element (the ladder — one row per bidder) and the
          tall element (the poster) now share a row, so the card is as tall as
          its content in BOTH columns instead of the sum of them.

          ONE TREE, TWO STRUCTURES, which is what the grid buys. Below `lg` it
          is two columns and two rows — poster beside the title, ink rule across
          the whole sheet, ladder under it. At `lg` it is three columns in one
          row and the rule turns vertical. That is a change of STRUCTURE rather
          than a reflow, the same move the nav makes at `md`. A flex row cannot
          express both without rendering the ladder twice, and two copies would
          be two sets of nodes for the sheet's FLIP re-rank to fight over.

          THE COLUMN STRETCHES; THE ARTWORK DOES NOT. Letting the poster cover
          its whole cell was tried and is a defect: a card is as tall as its bid
          ladder, so a film the whole league bid on made a 554px column that
          cropped `OBSESSION` down to `BSESSIO`. A poster is a fixed 2:3 object
          and the one thing it may not lose is its title. So the artwork holds
          its ratio at the top of the column and the wash carries on beneath it
          — a poster mounted in a slot, which is also why the slot is `--muted`
          rather than the sheet white it would otherwise disappear into. */}
      <div className={cn("bg-muted", !film.iOwn && "opacity-60")}>
        <div className="relative aspect-2/3 w-full">
          {poster ? (
            <Image
              src={poster}
              alt=""
              fill
              sizes="(min-width: 1024px) 11rem, 6rem"
              className="object-cover object-center"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <FilmIcon className="size-6 text-muted-foreground" aria-hidden />
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 py-4 pe-4 ps-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="min-w-0">
            {href ? (
              <Link href={href} className="hover:underline">
                {film.title}
              </Link>
            ) : (
              film.title
            )}
          </h3>
          {move !== null && <Moved places={move} />}
        </div>

        {/* THE INPUTS ON ONE LINE, THE RESULT ON THE NEXT — at every width.
              Three abreast is what a phone could not fit, and the wrap it was
              forced into turned out to be the better reading everywhere: the
              two figures the rulebook multiplies sit together, and the score
              they produce is set apart and larger beneath them. Left as a wrap
              it would have been an accident of available width, and a desktop
              card would have drawn the same three facts in a different shape
              from the phone one. `items-end` matters when the live-Tomatometer
              label runs to two lines: the numerals stay on one baseline. */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Figure
            label="Opening"
            value={film.boxOfficeM === null ? "—" : `$${film.boxOfficeM}M`}
          />
          <Figure
            label={
              film.tomatometer === null && tomato !== null
                ? "Tomatometer (live)"
                : "Tomatometer"
            }
            value={tomato === null ? "—" : `${tomato}%`}
          />
        </div>

        <Figure
          label="Score"
          value={film.score === null ? "—" : two(film.score)}
          size="lg"
        />

        {working && (
          <p className="type-numeral text-micro tabular-nums text-muted-foreground">
            {working}
          </p>
        )}
      </div>

      {/* THE INK RULE, TURNED. The 2px weight is the hero's, not a panel's
          hairline: it divides the film from the argument the league had about
          it, and it is the same rule the cut is drawn in a few lines down.
          Stacked, that division is horizontal; in three columns it is the
          vertical rule between two columns of a page, which is the more
          literal trade-paper gesture of the two. */}
      <div className="col-span-2 flex flex-col gap-1.5 border-t-2 border-foreground p-4 lg:col-span-1 lg:border-t-0 lg:border-s-2">
        {/* NOT "Owners" on a removed film. `remove_film` refunds the
            winning bids and leaves `is_winning` where it was, so these are
            the people who got their money back — calling them owners would
            name them as holding something the commissioner took away. */}
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          {film.removed ? "Refunded" : "The bids"}
        </span>

        {film.rows.length === 0 ? (
          <span className="type-body text-micro text-muted-foreground">
            Nobody bid on it.
          </span>
        ) : (
          <ul className="flex flex-col gap-1">
            {film.rows.map((r, i) => (
              <li key={r.seasonMemberId} className="flex flex-col gap-1">
                <div
                  className="reveal-rise flex items-center gap-2 sm:gap-3"
                  style={{ animationDelay: `${delayOf(index, i)}ms` }}
                >
                  <span
                    className={cn(
                      "w-24 shrink-0 truncate text-ui sm:w-32",
                      r.isMe ? "type-h3" : "type-ui",
                      r.isWinning ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {r.isMe ? "You" : r.name}
                  </span>

                  {/* The track is the WEEK's top bid; the fill is this bid's
                      share of it. `aria-hidden` because the amount beside it
                      already says the number — a bar is a second rendering
                      of one fact, not a fact of its own. */}
                  <span
                    aria-hidden
                    className="h-2.5 min-w-6 grow rounded-sm bg-muted"
                  >
                    <span
                      className={cn(
                        "reveal-bar block h-full rounded-sm",
                        r.isWinning
                          ? "bg-foreground"
                          : "bg-muted-foreground/40",
                      )}
                      style={{
                        width: `${share(r.amount, weekTop)}%`,
                        animationDelay: `${delayOf(index, i)}ms`,
                      }}
                    />
                  </span>

                  <span
                    className={cn(
                      "type-numeral w-10 shrink-0 text-right text-ui sm:w-12",
                      r.isWinning ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    ${r.amount}
                  </span>
                </div>

                {/* THE CUT, drawn under the last bid that got in. It is the
                    one line on the page that decided anything, so it is the
                    2px ink rule rather than the panel hairline. Suppressed on
                    a removed film: those bids were refunded and no cut
                    survived the removal. */}
                {!film.removed &&
                  film.cut !== null &&
                  r.isWinning &&
                  film.rows[i + 1] !== undefined &&
                  !film.rows[i + 1].isWinning && (
                    <div
                      className="reveal-rise flex items-center gap-2 pt-0.5 sm:gap-3"
                      style={{ animationDelay: `${delayOf(index, i + 1)}ms` }}
                    >
                      <span className="type-micro w-24 shrink-0 text-right text-micro text-muted-foreground sm:w-32">
                        The cut
                      </span>
                      <span className="h-0.5 grow bg-foreground" />
                      <span className="type-numeral w-10 shrink-0 text-right text-micro sm:w-12">
                        ${film.cut}
                      </span>
                    </div>
                  )}
              </li>
            ))}
          </ul>
        )}

        {film.everyoneElse > 0 && (
          <span className="type-body text-micro text-muted-foreground">
            {numberWord(film.everyoneElse)}{" "}
            {film.everyoneElse === 1 ? "other player" : "other players"} passed
            or bid nothing.
          </span>
        )}

        {note && (
          <span className="type-body text-micro text-muted-foreground">
            {note}
          </span>
        )}
      </div>
    </Card>
  );
}
