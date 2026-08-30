import Image from "next/image";
import Link from "next/link";

import { PlayerAvatar } from "@/components/player-avatar";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RecordEntry } from "@/lib/league-records";
import { posterUrl } from "@/lib/tmdb-urls";
import { cn } from "@/lib/utils";

/**
 * ONE RECORD — board 4.3's shelf.
 *
 * ── MARQUEE IS THE COMPOSER'S FLAG, NOT A COUNT KEPT HERE ────────────────
 * `getLeagueRecordBook` decides which records lead, and the shelf renders in
 * the order it returns. Hard-coding "the first three are heavy" would go wrong
 * the day a record is suppressed for want of data — and every one of them
 * self-suppresses, so the shelf's length genuinely varies by league.
 *
 * ── A RECORD ABOUT A FILM SHOWS THE FILM ─────────────────────────────────
 * Three of them are about a film and three are about a season or a career, and
 * `RecordEntry.film` is null on the second kind DELIBERATELY — the composer
 * says so in its own words. So the poster is rendered when it is there and
 * nothing stands in for it when it is not.
 *
 * ── THE ACCENT IS SPENT ON THE CAREER TABLE, NOT HERE ───────────────────
 * `--primary` is capped at one meaning per surface, and on this page that
 * meaning is a championship — the titles chip beside a name in the career
 * table. So the "yours" mark here is ink. (Board 4.3 draws its chips in
 * `#EB4B37`, which is `--nav-primary`, the INK-side red; the theme says that
 * one appears nowhere but an ink surface, and these cards are paper.)
 */
export function RecordCard({
  label,
  entry,
  marquee,
  leagueId,
}: {
  label: string;
  entry: RecordEntry;
  marquee: boolean;
  leagueId: string;
}) {
  const poster = posterUrl(entry.film?.posterPath);
  const filmHref =
    entry.film?.tmdbId != null
      ? `/leagues/${leagueId}/films/${entry.film.tmdbId}`
      : null;

  return (
    <Card
      variant="flat"
      className={cn("gap-2.5", marquee && "border-2 border-foreground")}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          {label}
        </span>
        {/* INK, not the accent. `--primary` is capped at ONE meaning per
            surface and this page already spends it on the titles chip, which
            is what a record book's red is for. Ink is how this system says
            "and this one is yours" where the accent is committed. */}
        {entry.isMe && <Badge variant="ink">You</Badge>}
      </div>

      <div className="flex items-start justify-between gap-4">
        {/* The board sizes a marquee record at 44px and the rest at 30px —
            the shelf's hierarchy is in the numeral, not only in the border. */}
        <span className={cn("type-numeral", marquee ? "text-h1" : "text-h2")}>
          {entry.value}
        </span>
        {poster && (
          <div className="w-12 shrink-0">
            <AspectRatio ratio={2 / 3} className="overflow-hidden rounded bg-muted">
              {filmHref ? (
                <Link href={filmHref} aria-label={entry.film!.title}>
                  <Image
                    src={poster}
                    alt=""
                    fill
                    sizes="3rem"
                    className="object-cover object-center"
                  />
                </Link>
              ) : (
                <Image
                  src={poster}
                  alt=""
                  fill
                  sizes="3rem"
                  className="object-cover object-center"
                />
              )}
            </AspectRatio>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* A record holder is not always a linked account, so the seed
            falls back to the name — a colour, rather than every unlinked
            holder sharing one. */}
        <PlayerAvatar
          id={entry.holderProfileId ?? entry.holder}
          name={entry.holder}
          className="size-6"
        />
        {entry.holderProfileId ? (
          <Link
            href={`/players/${entry.holderProfileId}`}
            className="type-ui truncate text-ui font-medium hover:underline"
          >
            {entry.holder}
          </Link>
        ) : (
          <span className="type-ui truncate text-ui font-medium">
            {entry.holder}
          </span>
        )}
      </div>

      <span className="type-body text-micro text-muted-foreground">
        {entry.detail}
      </span>
    </Card>
  );
}
