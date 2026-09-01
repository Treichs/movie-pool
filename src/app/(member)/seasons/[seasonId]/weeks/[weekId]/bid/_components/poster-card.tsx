import Image from "next/image";
import Link from "next/link";

import { Tomatometer } from "@/components/tomatometer";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * THE POSTER CARD, in the product-card idiom (approved 2026-08-26).
 *
 * A film maps onto a product almost exactly — the poster is the product image,
 * the Tomatometer is the rating, the bid is the price, and the add-to-cart slot
 * is where the bid input goes. That mapping is why this is a bordered card with
 * the artwork INSIDE it rather than the previous idiom, where the artwork WAS
 * the card and everything rode on top of it.
 *
 * That single change deletes three problems rather than solving them: titles,
 * meta and values now sit on `--card` instead of on whatever the studio
 * shipped, so there is no corner scrim to draw, no badge that vanishes on a
 * daylight poster, and no type over artwork.
 *
 * THE STRETCHED LINK is the one technique taken from the blocks. `href` renders
 * an absolutely-positioned anchor over the whole card at `z-10`; the footer
 * raises itself to `z-20` so the control inside it stays usable. The previous
 * card could not do this — its own note recorded that "an input inside the
 * trigger would open the slide-out every time the player went to type", so it
 * kept poster and input as siblings and gave up on the card being one target.
 *
 * `href` IS OPTIONAL. On the bid page it points at
 * `/leagues/[leagueId]/films/[tmdbId]`, which landed at build order 15; it was
 * unset until then, because a card that lifts on hover but leads to a 404 is
 * worse than one that does not lift. It stays unset for a manually-added film,
 * which has no TMDB id and so has no page to lead to.
 */
export function PosterCard({
  title,
  posterPath,
  meta,
  tomatometer,
  badge,
  value,
  action,
  href,
  selected = false,
  disabled = false,
  className,
}: {
  title: string;
  posterPath: string | null;
  /** Left of the meta row — a release date, a week number. */
  meta?: React.ReactNode;
  /** Right of the meta row. Null is the honest answer for a film nobody has
   *  reviewed; a zero there reads as "critics hated it" (ADR-062). */
  tomatometer?: number | null;
  /** Top-left of the artwork — Yours, Won, Not eligible. */
  badge?: React.ReactNode;
  /** Pushed to the foot of the body, so a row of cards aligns its numbers
   *  regardless of how long the titles are. */
  value?: React.ReactNode;
  /** Full-width footer slot. The bid field lives here. */
  action?: React.ReactNode;
  href?: string;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Card
      data-selected={selected || undefined}
      className={cn(
        "relative flex h-full flex-col gap-0 overflow-hidden rounded-2xl border p-0 shadow-none transition-[border-color,box-shadow] duration-200",
        selected ? "border-primary shadow-[inset_0_0_0_1px_var(--primary)]" : "border-border",
        href && !disabled && "hover:border-primary/55 hover:shadow-md",
        disabled && "opacity-60",
        className
      )}
    >
      {href && !disabled && (
        <Link href={href} aria-label={title} className="absolute inset-0 z-10 block" />
      )}

      <div className="relative">
        {badge && <div className="absolute start-2 top-2 z-20">{badge}</div>}
        <AspectRatio ratio={2 / 3} className="overflow-hidden bg-muted">
          {posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w342${posterPath}`}
              alt=""
              fill
              // Matched to the real grids this card sits in. Getting `sizes`
              // wrong is what once made production fetch a 640px re-encode for
              // a 64px thumbnail.
              sizes="(min-width: 1280px) 12rem, (min-width: 640px) 22vw, 45vw"
              className="object-cover object-center"
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <FilmStripIcon />
            </div>
          )}
        </AspectRatio>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {(meta || tomatometer != null) && (
          <div className="flex items-center justify-between gap-2">
            <span className="type-micro text-micro min-w-0 truncate text-muted-foreground">
              {meta}
            </span>
            {tomatometer != null && (
              <Tomatometer value={tomatometer} size="sm" className="shrink-0" />
            )}
          </div>
        )}
        <p className="line-clamp-2 text-sm font-semibold">{title}</p>
        {value && <div className="mt-auto pt-1">{value}</div>}
      </div>

      {action && <div className="relative z-20 px-3 pb-3">{action}</div>}
    </Card>
  );
}

/** Drawn, not an emoji — the empty state when TMDB has no poster for a film. */
function FilmStripIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-8 text-muted-foreground"
    >
      <rect x="2" y="2" width="20" height="20" rx="2.18" />
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
    </svg>
  );
}
