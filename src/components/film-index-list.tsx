import Link from "next/link";
import Image from "next/image";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { FilmIndexEntry } from "@/lib/film-index";
import { formatDate } from "@/lib/format";
import { posterUrl } from "@/lib/tmdb-urls";

/**
 * The list both film indexes render. Shared from the start because two routes
 * need it — `/films` and `/leagues/[leagueId]/films` — which is rule 1's own
 * condition for a component living in `src/components/`.
 *
 * ── EACH ROW LINKS TO THE LEAGUE'S RECORD, NOT THE CATALOGUE PAGE ─────────
 * A row IS a playing: this league, this week, this score. The league-scoped
 * film page is the one that can say all three, and the catalogue page is
 * reachable from it. Linking the other way round would answer a narrower
 * question than the row just asked.
 *
 * ── `showLeague` RATHER THAN TWO COMPONENTS ──────────────────────────────
 * On a league's own page the league name is the H1 and repeating it on every
 * row is noise; across leagues it is the only thing telling two rows of the
 * same film apart.
 */
export function FilmIndexList({
  films,
  showLeague,
}: {
  films: FilmIndexEntry[];
  showLeague: boolean;
}) {
  return (
    <ItemGroup className="gap-2.5">
      {films.map((film) => {
        const poster = posterUrl(film.posterPath);
        const where = showLeague
          ? `${film.leagueName} · ${film.seasonName}`
          : film.seasonName;

        return (
          <Item
            key={film.filmId}
            variant="outline"
            className="hover:bg-muted"
            render={
              <Link href={`/leagues/${film.leagueId}/films/${film.tmdbId}`} />
            }
          >
            <ItemMedia>
              <div className="w-10 overflow-hidden rounded-xs bg-muted">
                <AspectRatio ratio={2 / 3}>
                  {poster && (
                    <Image
                      src={poster}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  )}
                </AspectRatio>
              </div>
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="type-h3 text-h3">
                {film.title}
                {/* A pulled film stays in the record — dropping it would make
                    the list disagree with the week it belongs to. */}
                {film.status === "removed" && (
                  <span className="type-micro pl-2 text-micro text-muted-foreground">
                    pulled
                  </span>
                )}
              </ItemTitle>
              <ItemDescription>
                {where} · Week {String(film.weekNumber).padStart(2, "0")} ·{" "}
                {formatDate(film.weekOf)}
              </ItemDescription>
            </ItemContent>
            {/* A dash is "not scored yet", which is a different fact from a
                score of zero — the same distinction the weeks tab draws. */}
            <span className="type-numeral w-16 shrink-0 text-right text-ui">
              {film.score === null ? "—" : film.score.toFixed(2)}
            </span>
          </Item>
        );
      })}
    </ItemGroup>
  );
}
