import Image from "next/image";
import { FilmIcon } from "lucide-react";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { backdropUrl, posterUrl } from "@/lib/tmdb-urls";
import { cn } from "@/lib/utils";

/**
 * A FILM'S BACKDROP, WITH ITS POSTER RIDING UP INTO IT.
 *
 * Shared the moment a second route needed it: boards 2.2 and 2.3 draw the same
 * masthead at two sizes and then put different things beside the poster. So the
 * artwork, the scrim and the overlap live here, and each page composes its own
 * text column as `children`.
 *
 * ── THE SCRIM IS A TOKEN, NOT A THEME COLOUR ──────────────────────────────
 * `--scrim` is black in both modes on purpose: it darkens a PHOTOGRAPH so the
 * page's own ground can read against it, and a photograph does not invert when
 * the theme does. Using `--foreground` here would turn the gradient white in
 * dark mode and wash the backdrop out.
 *
 * ── ONLY THE POSTER OVERLAPS ──────────────────────────────────────────────
 * Both boards put the heading just BELOW the backdrop and only the poster
 * inside it. Giving the negative margin to the poster alone — rather than to
 * the row — is what keeps every word on the paper ground, where it is ordinary
 * foreground text needing no contrast exception.
 *
 * ── TWO SIZES, BOTH DRAWN ─────────────────────────────────────────────────
 * `compact` is board 2.3's: the league record is what that page leads with, so
 * its masthead gives up height to get the score panel above the fold. The
 * numbers are the boards' own (300/200 and 220/156).
 */
export function FilmMasthead({
  backdropPath,
  posterPath,
  size = "default",
  children,
}: {
  backdropPath: string | null;
  posterPath: string | null;
  size?: "default" | "compact";
  /** The text column: trail, heading, whatever sits beside the poster. */
  children: React.ReactNode;
}) {
  const backdrop = backdropUrl(backdropPath);
  const poster = posterUrl(posterPath, "w500");
  const compact = size === "compact";

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "relative overflow-hidden bg-muted",
          compact ? "h-44 sm:h-55" : "h-56 sm:h-75"
        )}
      >
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-scrim via-scrim/35 to-scrim/10"
        />
      </div>

      <div className="mx-auto flex w-full max-w-measure-page gap-7 px-8">
        <div
          className={cn(
            "shrink-0",
            compact ? "-mt-21 w-28 sm:w-39" : "-mt-28 w-36 sm:w-50"
          )}
        >
          <AspectRatio
            ratio={2 / 3}
            className="overflow-hidden rounded border bg-muted"
          >
            {poster ? (
              <Image
                src={poster}
                alt=""
                fill
                priority
                sizes={
                  compact
                    ? "(min-width: 640px) 9.75rem, 7rem"
                    : "(min-width: 640px) 12.5rem, 9rem"
                }
                className="object-cover object-center"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <FilmIcon className="size-8 text-muted-foreground" aria-hidden />
              </div>
            )}
          </AspectRatio>
        </div>

        <div className="flex grow flex-wrap items-end justify-between gap-x-7 gap-y-4 pt-2">
          {children}
        </div>
      </div>
    </div>
  );
}
