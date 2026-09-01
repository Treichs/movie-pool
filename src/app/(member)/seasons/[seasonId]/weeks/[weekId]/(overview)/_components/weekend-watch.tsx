import Image from "next/image";
import Link from "next/link";
import { FilmIcon } from "lucide-react";

import { Figure } from "@/components/figure";
import { Tomatometer } from "@/components/tomatometer";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { formatDateFull, relativeDay } from "@/lib/format";
import type { WeekendWatch as Watch } from "@/lib/weekend";
import { posterUrl } from "@/lib/tmdb-urls";
import { cn } from "@/lib/utils";

/**
 * WHAT YOU OWN, AND WHAT IT IS WORTH PER $10M — the weekend band.
 *
 * The three or four days between the reveal and Monday's capture are the state
 * `week-status.ts` calls "the most interesting state in the game", and the
 * page spent them showing a dash where a score would go.
 *
 * ── IT PROMISES NOTHING ABOUT THE WEEKEND ────────────────────────────────
 * There is no box office to show before Monday and this does not invent one.
 * The rate is the rulebook's own formula run forwards — at 90%, $10M of
 * opening is 9.00 points — so it is arithmetic about a number nobody has yet,
 * never a guess at what that number will be. `weekend.ts` carries the
 * reasoning; the copy here has to keep the same promise, which is why every
 * line reads "would be" and none reads "will".
 *
 * ── A SHARED FILM IS THE THING WORTH KNOWING ─────────────────────────────
 * Ownership is never divided: every owner earns the full score. So a film you
 * share with the player you are chasing cannot move you past them however well
 * it opens, and a film only you own is the only kind that can. That is the
 * sharpest fact available all weekend and it is stated on the film itself.
 */
export function WeekendWatch({ watch }: { watch: Watch }) {
  return (
    <section aria-label="This weekend" className="flex flex-col gap-4">
      <Card
        variant="flat"
        className="flex-row flex-wrap items-end gap-x-10 gap-y-5 border-l-4 border-l-foreground"
      >
        <Figure
          label={watch.films.length === 1 ? "Film you own" : "Films you own"}
          value={String(watch.films.length)}
          size="hero"
        />
        <Figure label="Paid" value={`$${watch.spent}`} size="lg" />
        <div className="flex flex-col gap-1 sm:ms-auto sm:items-end">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Results land
          </span>
          <span className="type-numeral text-h2">
            {formatDateFull(watch.resultsOn)}
          </span>
          {/* `relativeDay` is the app's own wording for a date near today, so
              "in 3 days" here reads the same as it does everywhere else. */}
          <span className="type-body text-micro text-muted-foreground">
            {relativeDay(`${watch.resultsOn}T12:00:00Z`)}
          </span>
        </div>
      </Card>

      {watch.rival && <RivalLine rival={watch.rival} />}

      <ul className="flex flex-col gap-3">
        {watch.films.map((film) => {
          const poster = posterUrl(film.posterPath);
          return (
            <li key={film.filmId}>
              <Card variant="flat" className="flex-row gap-5 overflow-hidden p-0">
                <div className="w-20 shrink-0 sm:w-24">
                  <AspectRatio ratio={2 / 3} className="overflow-hidden bg-muted">
                    {poster ? (
                      <Image
                        src={poster}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 6rem, 5rem"
                        className="object-cover object-center"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <FilmIcon
                          className="size-5 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                    )}
                  </AspectRatio>
                </div>

                <div className="flex grow flex-col gap-2 py-4 pe-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
                    <h3 className="min-w-0">
                      {film.tmdbId !== null ? (
                        <Link
                          href={`/films/${film.tmdbId}`}
                          className="hover:underline"
                        >
                          {film.title}
                        </Link>
                      ) : (
                        film.title
                      )}
                    </h3>
                    <Tomatometer
                      value={film.tomatometer}
                      live
                      size="sm"
                      className="shrink-0"
                    />
                  </div>

                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="type-body text-micro text-muted-foreground">
                      You paid{" "}
                      <span className="type-numeral text-foreground">
                        ${film.paid}
                      </span>
                    </span>
                    {film.ratePer10M !== null ? (
                      <span className="type-body text-micro text-muted-foreground">
                        Every{" "}
                        <span className="type-numeral text-foreground">$10M</span>{" "}
                        it opens would be{" "}
                        <span className="type-numeral text-foreground">
                          {film.ratePer10M.toFixed(2)}
                        </span>{" "}
                        points
                      </span>
                    ) : (
                      <span className="type-body text-micro text-muted-foreground">
                        No rating yet, so there is no rate to quote.
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "type-body text-micro",
                      film.sharedWith.length === 0
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {film.sharedWith.length === 0
                      ? "Yours alone."
                      : `Shared with ${film.sharedWith.join(", ")} — every owner earns the full score.`}
                  </span>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * WHAT THE PLAYER YOU ARE CHASING HOLDS THIS WEEKEND.
 *
 * Four cases, because the interesting one is not the average one. A rival who
 * owns nothing is the best news the band can carry; a rival whose every film
 * you also own is the worst, because ownership is never divided and a shared
 * film moves you both the same distance. Folding those into one sentence with
 * a conditional clause produced "owns 2 films, all including Crime 101".
 *
 * "They" throughout: a display name says nothing about how a player is
 * addressed.
 */
function RivalLine({ rival }: { rival: NonNullable<Watch["rival"]> }) {
  const ahead = rival.gap > 0;
  const position = (
    <>
      <span className="type-h3 text-foreground">{rival.name}</span> is{" "}
      <span className="type-numeral text-foreground">
        {Math.abs(rival.gap).toFixed(2)}
      </span>{" "}
      points {ahead ? "ahead of you" : "behind you"}
    </>
  );

  if (rival.filmsOwned === 0) {
    return (
      <p className="type-dek max-w-measure-default text-ui text-muted-foreground">
        {position}, and owns{" "}
        <span className="text-foreground">nothing this weekend</span>.
      </p>
    );
  }

  const films = rival.filmsOwned === 1 ? "film" : "films";
  const allShared = rival.shared.length === rival.filmsOwned;

  return (
    <p className="type-dek max-w-measure-default text-ui text-muted-foreground">
      {position} and owns{" "}
      <span className="type-numeral text-foreground">{rival.filmsOwned}</span>{" "}
      {films} this weekend
      {rival.shared.length === 0 ? (
        <>, none of them yours.</>
      ) : allShared ? (
        <>
          , and you own{" "}
          {rival.filmsOwned === 1
            ? "it"
            : rival.filmsOwned === 2
              ? "both of them"
              : "all of them"}{" "}
          too — neither of you gains a point on the other this weekend.
        </>
      ) : (
        <>
          , including{" "}
          <span className="text-foreground">{rival.shared.join(" and ")}</span>,
          which you both own — neither of you gains a point on the other there.
        </>
      )}
    </p>
  );
}
