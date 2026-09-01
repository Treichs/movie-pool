import Image from "next/image";

import { Tomatometer } from "@/components/tomatometer";
import type { RailFilm } from "@/lib/leaderboard";
import { posterUrl } from "@/lib/tmdb-urls";
import { cn } from "@/lib/utils";

const SHOWN = 8;

/**
 * THE SEASON'S BIGGEST FILMS, and who owns them.
 *
 * ── THIS DATA WAS ALREADY BEING FETCHED AND THROWN AWAY ───────────────────
 * `getLeaderboard` has always returned `rail` — every film of every non-draft
 * week with its owners, what each of them paid, its box office and its
 * Tomatometer — and this tab rendered a six-column table of player totals
 * instead. Nothing here costs a query.
 *
 * ── SORTED BY SCORE, NOT BY WEEK ──────────────────────────────────────────
 * The composer orders the rail chronologically because a rail watching a
 * season fill in wants that order. This is a different question — what were
 * the big films — so it re-sorts and takes the head. Unscored films are
 * excluded rather than shown with dashes: a film that has not been captured
 * has no claim on a list of the biggest.
 *
 * ── OWNERSHIP IS THE POINT ────────────────────────────────────────────────
 * A score with no name attached is a fact about a film. A score with "Grace
 * $12" attached is a fact about Grace. Every owner is listed with what they
 * paid, because owners pay their own bids and the spread between two owners of
 * the same film is the whole argument.
 *
 * Owners only exist on revealed weeks — RLS withholds bids until a week closes
 * — so a film from an open week correctly lists none.
 */
export function TopFilms({ films }: { films: RailFilm[] }) {
  const top = films
    .filter((f) => f.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, SHOWN);

  if (top.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2>Biggest films</h2>
        <span className="type-micro text-micro text-muted-foreground">
          Score · owners and what they paid
        </span>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded border bg-card">
        {top.map((film) => {
          const poster = posterUrl(film.posterPath, "w342");
          return (
          <li
            key={film.id}
            className="flex items-center gap-4 p-3 sm:gap-5 sm:p-4"
          >
            <div className="relative h-[66px] w-11 shrink-0 overflow-hidden rounded-sm bg-muted">
              {poster && (
                <Image
                  src={poster}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className={cn(
                  "type-h3 truncate text-ui",
                  film.iOwn && "text-primary",
                )}
              >
                {film.title}
              </span>
              <span className="type-body text-micro text-muted-foreground">
                Week {String(film.weekNumber).padStart(2, "0")}
                {film.boxOfficeM !== null && (
                  <>
                    {" · "}
                    <span className="type-numeral">${film.boxOfficeM}M</span>{" "}
                    opening
                  </>
                )}
              </span>
              <span className="type-body text-micro text-muted-foreground">
                {film.owners.length === 0
                  ? "Unowned"
                  : film.owners.map((o, i) => (
                      <span key={o.seasonMemberId}>
                        {i > 0 && " · "}
                        <span className={cn(o.isMe && "text-primary")}>
                          {o.isMe ? "You" : o.name}
                        </span>{" "}
                        <span className="type-numeral">${o.bid}</span>
                      </span>
                    ))}
              </span>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="type-numeral text-h3">
                {film.score?.toFixed(2)}
              </span>
              <Tomatometer value={film.tomatometer} size="sm" />
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
