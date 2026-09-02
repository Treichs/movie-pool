import Image from "next/image";
import Link from "next/link";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { HubFilm } from "@/lib/season-hub";
import { posterUrl } from "@/lib/tmdb-urls";
import { cn } from "@/lib/utils";

/**
 * FILMS YOU OWN — a rail of posters, best score first.
 *
 * ── WHY IT STOPPED BEING A LIST ───────────────────────────────────────────
 * It was a stacked list of titles and figures, and it was the panel whose
 * height was set by how well the viewer had been bidding: four films at week
 * four, nine by week ten. That is the growth the old grid had to hand-pair
 * against, and it is the reason a five-player fixture and a ten-player one
 * produced different layouts from the same code.
 *
 * A RAIL IS A FIXED HEIGHT WHATEVER THE HOLDING DOES. One poster tall, always.
 * The panel beside it can be laid out against a number that will not move.
 *
 * ── AND WHY A POSTER AND NOT A TIGHTER LIST ───────────────────────────────
 * These are films. The design system reserves lift and the large radius for
 * things that behave like physical objects — "a poster, a film cell, an
 * overlay" — and this is the one panel on the page whose subject is literally
 * that. Everything else here stays flat; the posters are allowed to be
 * objects, because they are the only artifacts on the screen.
 *
 * ── THE SCORE STAYS THE SUBJECT ───────────────────────────────────────────
 * A rail of artwork could easily become a shelf you look at rather than a
 * ranking you read, so the numeral sits under each poster at the same size the
 * list gave it, in the tabular role, and the order is still best-first. The
 * poster is the identifier; the number is still the point.
 *
 * ── THERE IS NO MOTION HERE, AND THE FIRST DRAFT WAS WRONG ────────────────
 * It shipped with the active slide at full opacity and the rest at 55%,
 * transitioned by `motion`. Rendered, five of the six visible posters were
 * dimmed at once, which reads as DISABLED rather than as focus.
 *
 * The mistake was conceptual, not a tuning problem. `dragFree` with
 * `align: "start"` is a SHELF being scanned, and a shelf has no active item —
 * every poster in view is equally in view. "Selected" is a slideshow idea, and
 * Embla's `selectedScrollSnap` reports one regardless of whether the carousel
 * behaves like one. Applying it here dimmed most of the panel to mark a state
 * the reader has no reason to care about.
 *
 * So the rail is still. `motion` stays installed for the places that earned it
 * — the standings-to-chart hover link, direction-aware paging — and this panel
 * is not one of them. A dependency being available is not a reason to spend it.
 */
export function YourFilms({ films }: { films: HubFilm[] }) {
  if (films.length === 0) {
    return (
      <Empty className="border-0 py-6">
        <EmptyHeader>
          <EmptyTitle>You do not own a film yet</EmptyTitle>
          <EmptyDescription>
            Films arrive here the moment a week resolves and your bid turns out
            to be one of the winning amounts.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Carousel
      // NAMED, BECAUSE THE REGISTRY LEAVES IT ANONYMOUS. `Carousel` ships
      // `role="region"` with `aria-roledescription="carousel"` and no
      // accessible name, so a screen reader announces an unidentified carousel
      // region. The panel's heading names the PANEL; this names the control
      // inside it.
      aria-label="Films you own"
      // `align: "start"` and a free drag: this is a shelf being scanned, not a
      // slideshow being advanced, so a partial poster at the right edge is the
      // point — it is the only honest way to say there are more.
      opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }}
      className="w-full"
    >
      {/* 44px ON TOUCH, 28px ON A POINTER. The rail is swipeable, so these are
          a convenience on a phone and the primary control on a laptop — but a
          convenience is still a hit target, and 28px fails the 44px minimum.
          They are not hidden below `sm`: Embla's track is not focusable, so
          hiding them would leave a keyboard user on a narrow window with no way
          to reach the films past the fold. */}
      <div className="mb-2 flex items-center justify-end gap-1.5">
        <CarouselPrevious className="static size-11 translate-y-0 sm:size-7" />
        <CarouselNext className="static size-11 translate-y-0 sm:size-7" />
      </div>

      <CarouselContent className="-ml-3">
        {films.map((film) => {
          const poster = posterUrl(film.detail.posterPath);
          const href =
            film.detail.tmdbId != null ? `/films/${film.detail.tmdbId}` : null;

          const card = (
            <>
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-4xl bg-muted shadow-md ring-1 ring-foreground/5">
                {poster ? (
                  <Image
                    src={poster}
                    alt=""
                    fill
                    sizes="124px"
                    className="object-cover"
                  />
                ) : (
                  // NO ARTWORK IS A REAL STATE, not a broken image: a film can
                  // be on a slate before the catalogue has a poster for it.
                  <span className="type-micro absolute inset-0 flex items-end p-2.5 text-micro text-muted-foreground">
                    No poster
                  </span>
                )}
              </div>
              {/* TWO LINES, RESERVED WHETHER OR NOT THEY ARE USED. A title
                  that wraps pushed its score 20px below its neighbours', and a
                  row of figures that does not share a baseline is not a
                  ranking, it is a sorted list of pictures. `min-h` on the two
                  lines the clamp allows keeps every numeral on one line. */}
              <span className="type-h3 mt-2 line-clamp-2 min-h-[2.5rem] text-ui">
                {film.title}
              </span>
              <span className="mt-1 flex items-baseline justify-between gap-2">
                <span className="type-numeral text-h3">
                  {film.score === null ? "—" : Number(film.score).toFixed(2)}
                </span>
                <span className="type-body text-micro text-muted-foreground">
                  {film.myBid !== null && (
                    <span className="type-numeral">${film.myBid}</span>
                  )}
                </span>
              </span>
              <span className="type-body text-micro text-muted-foreground">
                Week {String(film.weekNumber).padStart(2, "0")}
              </span>
            </>
          );

          return (
            <CarouselItem key={film.id} className="basis-[124px] pl-3">
              <div className="flex flex-col">
                {href ? (
                  <Link
                    href={href}
                    className={cn(
                      "flex flex-col rounded-4xl outline-none",
                      "focus-visible:ring-3 focus-visible:ring-ring/30"
                    )}
                  >
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </div>
            </CarouselItem>
          );
        })}
      </CarouselContent>
    </Carousel>
  );
}
