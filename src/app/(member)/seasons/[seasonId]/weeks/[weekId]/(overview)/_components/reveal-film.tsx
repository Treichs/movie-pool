import Image from "next/image";
import Link from "next/link";
import { FilmIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

  if (winners.length > distinct.size) {
    // Which amount was shared. The lowest one, when more than one tie exists —
    // that is the tie at the cut, and it is the one that changed the outcome.
    const tied = [...distinct]
      .filter((a) => winners.filter((r) => r.amount === a).length > 1)
      .sort((a, b) => a - b)[0];
    return `${numberWord(distinct.size)} distinct amounts — a tie at $${tied} gives ${numberWord(winners.length)} owners.`;
  }

  const mine = film.rows.find((r) => r.isMe);
  if (mine && !mine.isWinning) {
    return `You bid $${mine.amount} and lost the tier — ${numberWord(distinct.size)} distinct amounts above yours.`;
  }

  return null;
}

export function RevealFilmRow({
  film,
  leagueId,
}: {
  film: RevealFilm;
  leagueId: string | null;
}) {
  const poster = posterUrl(film.posterPath);
  const owners = film.rows.filter((r) => r.isWinning);
  const note = ownersNote(film);
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
          <h3 className="min-w-0">
            {href ? (
              <Link href={href} className="hover:underline">
                {film.title}
              </Link>
            ) : (
              film.title
            )}
          </h3>

          <div className="flex items-start gap-7">
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

        <div className="flex flex-wrap items-center gap-2">
          {/* NOT "Owners" on a removed film. `remove_film` refunds the
              winning bids and leaves `is_winning` where it was, so these are
              the people who got their money back — calling them owners would
              name them as holding something the commissioner took away. */}
          <span className="type-eyebrow me-1 text-eyebrow text-muted-foreground">
            {film.removed ? "Refunded" : "Owners"}
          </span>
          {owners.length === 0 ? (
            <span className="type-body text-micro text-muted-foreground">
              Nobody bid on it.
            </span>
          ) : (
            owners.map((o) => (
              <Badge key={o.seasonMemberId} variant={o.isMe ? "ink" : "outline"}>
                {o.isMe ? "You" : o.name} · ${o.amount}
              </Badge>
            ))
          )}
          {note && (
            <span className="type-body ms-1 text-micro text-muted-foreground">
              {note}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
