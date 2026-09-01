import Image from "next/image";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, FilmIcon } from "lucide-react";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { numberWord } from "@/lib/format";
import { posterUrl } from "@/lib/tmdb-urls";
import type { RevealFilm } from "@/lib/reveal";
import { cn } from "@/lib/utils";

/**
 * ONE FILM, REVEALED — board 3.2's row.
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

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </span>
      <span className={cn("type-numeral", big ? "text-h3" : "text-ui")}>
        {value}
      </span>
    </div>
  );
}

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
      `${numberWord(distinct.size)} distinct amount${distinct.size === 1 ? "" : "s"} — a tie at $${tied} gives ${numberWord(winners.length)} owners.`
    );
  }

  const mine = film.rows.find((r) => r.isMe);
  if (mine && !mine.isWinning) {
    parts.push(
      `You bid $${mine.amount} and lost the tier — ${numberWord(distinct.size)} distinct amount${distinct.size === 1 ? "" : "s"} above yours.`
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
  if (film.score === null || film.boxOfficeM === null || film.tomatometer === null) {
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
        up ? "text-success" : "text-destructive"
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
        "flex-row gap-5 overflow-hidden p-0",
        film.iOwn && "border-foreground"
      )}
    >
      <div
        className={cn("w-24 shrink-0 sm:w-27", !film.iOwn && "opacity-60")}
      >
        <AspectRatio ratio={2 / 3} className="overflow-hidden bg-muted">
          {poster ? (
            <Image
              src={poster}
              alt=""
              fill
              sizes="(min-width: 640px) 6.75rem, 6rem"
              className="object-cover object-center"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <FilmIcon className="size-6 text-muted-foreground" aria-hidden />
            </div>
          )}
        </AspectRatio>
      </div>

      <div className="flex grow flex-col gap-2.5 py-4 pe-4">
        <div className="flex flex-wrap items-start justify-between gap-x-7 gap-y-3">
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

          {/* WRAPS, and did not: three stats at a fixed 28px gap beside a
              96px poster overflow a 375px card, and the Card clips rather than
              scrolls — so "Score" simply was not on the page at phone width.
              Pre-dates the ladder below; it just became obvious next to it. */}
          <div className="flex flex-wrap items-start justify-end gap-x-5 gap-y-2 sm:gap-x-7">
            <Stat
              label="Opening"
              value={film.boxOfficeM === null ? "—" : `$${film.boxOfficeM}M`}
            />
            <Stat
              label={film.tomatometer === null && tomato !== null ? "Tomatometer (live)" : "Tomatometer"}
              value={tomato === null ? "—" : `${tomato}%`}
            />
            <Stat
              label="Score"
              value={film.score === null ? "—" : two(film.score)}
              big
            />
          </div>
        </div>

        {working && (
          <p className="type-numeral text-micro tabular-nums text-muted-foreground">
            {working}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
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
                        "w-16 shrink-0 truncate text-ui sm:w-32",
                        r.isMe ? "type-h3" : "type-ui",
                        r.isWinning ? "text-foreground" : "text-muted-foreground"
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
                          r.isWinning ? "bg-foreground" : "bg-muted-foreground/40"
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
                        r.isWinning ? "text-foreground" : "text-muted-foreground"
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
                        <span className="type-micro w-16 shrink-0 text-right text-micro text-muted-foreground sm:w-32">
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
      </div>
    </Card>
  );
}
