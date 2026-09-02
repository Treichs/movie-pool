import Image from "next/image";

import { Tomatometer } from "@/components/tomatometer";
import type { ProvisionalAwards, RailFilm } from "@/lib/leaderboard";
import { posterUrl } from "@/lib/tmdb-urls";
import { cn } from "@/lib/utils";

/** Five, not the eight the retired rail showed. This is a bento cell five
 *  columns of twelve wide, and the list is the tallest thing in the grid: every
 *  extra poster is 74px of empty page beside the cell it sits next to. */
const SHOWN = 5;

/**
 * THE SEASON'S PICKS — the two provisional awards and the films that earned
 * them, in one cell.
 *
 * ── TWO SECTIONS BECAME ONE, AND THE MERGE IS THE POINT ───────────────────
 * "Season awards so far" and "Biggest films" were separate blocks on the
 * retired Leaderboard tab, and they are two views of one subject: which picks
 * won this season. The awards name the best and worst RETURN — points per
 * dollar on a single film — and the list below names the biggest SCORES with
 * every owner and what they paid. Read together they say what the two apart
 * could not: the biggest film is rarely the best pick, because someone paid
 * for it.
 *
 * ── THE AWARD IS ABOUT ONE FILM, NOT ONE PLAYER ───────────────────────────
 * `leaderboard.ts` carries the warning in its own types: a row's `efficiency`
 * is a PLAYER's season points ÷ dollars, while `bestEfficiency` is the best
 * single PICK of the season. A player can lead the standings and not hold the
 * pick, which is why these sit here rather than in the standings table.
 *
 * ── NOTHING HERE COSTS A QUERY ────────────────────────────────────────────
 * `getLeaderboard` has always returned both `awards` and `rail` — every film
 * of every non-draft week with its owners, what each of them paid, its box
 * office and its Tomatometer. The tab this replaces fetched all of it and
 * rendered a six-column table of player totals instead.
 *
 * ── SORTED BY SCORE, AND UNSCORED FILMS ARE ABSENT ────────────────────────
 * The composer orders the rail chronologically, because a rail watching a
 * season fill in wants that order. This asks a different question — what were
 * the big films — so it re-sorts and takes the head. A film that has not been
 * captured has no claim on a list of the biggest, so it is excluded rather
 * than shown with dashes.
 *
 * Owners only exist on revealed weeks — RLS withholds bids until a week closes
 * — so a film from an open week correctly lists none.
 */
export function SeasonPicks({
  awards,
  films,
}: {
  awards: ProvisionalAwards;
  films: RailFilm[];
}) {
  const top = films
    .filter((f) => f.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, SHOWN);

  const hasAwards = Boolean(awards.bestEfficiency || awards.dessert);
  if (!hasAwards && top.length === 0) return null;

  return (
    <div className="flex flex-col">
      {hasAwards && (
        <dl className="flex flex-col gap-3 pb-4">
          {awards.bestEfficiency && (
            <Award
              label="Best pick of the season"
              names={awards.bestEfficiency.winners.map((w) => w.name)}
              mine={awards.bestEfficiency.winners.some((w) => w.isMe)}
              films={awards.bestEfficiency.films}
              ratio={awards.bestEfficiency.ratio}
            />
          )}
          {awards.dessert && (
            <Award
              label="Dessert of the season"
              names={awards.dessert.winners.map((w) => w.name)}
              mine={awards.dessert.winners.some((w) => w.isMe)}
              films={awards.dessert.films}
              ratio={awards.dessert.ratio}
            />
          )}
        </dl>
      )}

      {top.length > 0 && (
        <>
          <h3 className="type-eyebrow border-t pt-4 text-eyebrow text-muted-foreground">
            Biggest films — score, and what each owner paid
          </h3>
          <ul className="-mx-(--card-spacing) divide-y divide-border">
            {top.map((film) => {
              const poster = posterUrl(film.posterPath, "w342");
              return (
                <li
                  key={film.id}
                  className="flex items-center gap-4 px-(--card-spacing) py-3"
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
                          <span className="type-numeral">
                            ${film.boxOfficeM}M
                          </span>{" "}
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
        </>
      )}
    </div>
  );
}

/**
 * One award, set as a definition rather than as a card.
 *
 * A CARD PER AWARD IS WHAT THIS REPLACED, and two bordered tiles inside a
 * bordered cell is the nested-card failure. The label is the term, the winner
 * is the definition, and the rule above the list below is the only division
 * the block needs.
 *
 * VERMILION MARKS THE NAME ONLY WHEN IT IS YOURS. The accent means *live and
 * yours*, and a tie contains names that are not.
 */
function Award({
  label,
  names,
  mine,
  films,
  ratio,
}: {
  label: string;
  names: string[];
  mine: boolean;
  films: string[];
  ratio: number;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </dt>
      <dd className="flex flex-col gap-0.5">
        <span className={cn("type-h3 text-h3", mine && "text-primary")}>
          {names.join(", ")}
        </span>
        <span className="type-body text-micro text-muted-foreground">
          {films.join(", ")} ·{" "}
          <span className="type-numeral">{ratio.toFixed(2)}</span> points per
          dollar
        </span>
      </dd>
    </div>
  );
}
