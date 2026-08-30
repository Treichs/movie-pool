import Link from "next/link";

import { Figure } from "@/components/figure";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, initialsFrom } from "@/lib/format";
import type { LeaguePlaying } from "@/lib/film-league-record";

/**
 * ONE RUN OF THIS FILM IN THIS LEAGUE — board 2.3's two panels.
 *
 * ── THE FORMULA IS SPELLED OUT, NOT SUMMARISED ───────────────────────────
 * `Opening ($M) × Tomatometer = Score` is the rulebook's own arithmetic, and
 * showing both inputs beside the answer is what makes a commissioner's typo
 * visible. The Tomatometer is shown as the MULTIPLIER (0.72, not 72%) because
 * that is the number the multiplication actually uses.
 *
 * ── "EVERY OWNER EARNS THE FULL SCORE" IS THE RULE PEOPLE GET WRONG ──────
 * A film taken by three distinct bids pays all three owners the whole score;
 * it is not divided. The panel says so next to the numbers rather than in a
 * rulebook nobody has open.
 *
 * ── THE TIER COUNT COMES FROM THE SEASON, NOT FROM A CONSTANT ────────────
 * `top_n_distinct` is configurable per season. A heading reading "three
 * winning tiers" on a season set to two would be a lie the page tells with
 * total confidence.
 */

const TIER_WORDS = ["no", "one", "two", "three", "four", "five"];
const tierWord = (n: number) => TIER_WORDS[n] ?? String(n);

const two = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function ScorePanel({ playing }: { playing: LeaguePlaying }) {
  const { score, boxOfficeM, tomatometer, capturedAt } = playing;
  const scored = score !== null && boxOfficeM !== null && tomatometer !== null;

  return (
    <Card
      variant="flat"
      className="flex-row flex-wrap items-center gap-x-11 gap-y-6 border-l-4 border-l-foreground"
    >
      {scored ? (
        <>
          <Figure label="Scored" value={two(score)} size="hero" />

          {/* The two inputs, kept together and set apart from the answer — the
              board's own hairline. This is the arithmetic, not more figures. */}
          <div className="flex items-center gap-3.5 border-l pl-3.5">
            <Figure label="Opening ($M)" value={two(boxOfficeM)} />
            <span
              className="type-numeral text-h3 text-muted-foreground"
              aria-hidden
            >
              ×
            </span>
            <Figure label="Tomatometer" value={two(tomatometer / 100)} />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Not scored yet
          </span>
          <span className="type-body text-ui text-muted-foreground">
            The commissioner enters the opening box office and the Tomatometer
            after the weekend.
          </span>
        </div>
      )}

      <div className="flex flex-col items-end gap-1 sm:ms-auto">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          On
        </span>
        <span className="type-ui text-ui font-medium">
          {playing.seasonName} · Week{" "}
          {String(playing.weekNumber).padStart(2, "0")}
        </span>
        {capturedAt && (
          // The UTC calendar day, the same way every other date in this app is
          // read. "Roughly when" is the precision this line is for.
          <span className="type-body text-micro text-muted-foreground">
            Captured {formatDate(capturedAt.slice(0, 10))}
          </span>
        )}
      </div>
    </Card>
  );
}

function OwnerRow({
  rank,
  owner,
  score,
  isMe,
}: {
  rank: number;
  owner: { profileId: string; name: string; amount: number };
  score: number | null;
  isMe: boolean;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-4 border-b px-4 py-2.5 last:border-b-0 ${
        isMe ? "bg-muted" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="type-numeral w-5 text-ui text-muted-foreground">
          {rank}
        </span>
        <Avatar className="size-6 rounded">
          <AvatarFallback
            className={`type-micro rounded text-micro ${isMe ? "bg-foreground text-background" : "bg-muted"}`}
          >
            {initialsFrom(owner.name)}
          </AvatarFallback>
        </Avatar>
        <Link
          href={`/players/${owner.profileId}`}
          className="type-ui truncate text-ui hover:underline"
        >
          {owner.name}
        </Link>
        {/* The board writes "You" in place of the name; the app's own way of
            saying it is a badge beside the name, which keeps the row scannable
            and matches every other roster in the product. */}
        {isMe && <Badge variant="secondary">You</Badge>}
      </div>
      <div className="flex items-center gap-7">
        <span className="type-numeral text-ui">${owner.amount}</span>
        <span className="type-numeral w-16 text-right text-ui">
          {score === null ? "—" : two(score / owner.amount)}
        </span>
      </div>
    </li>
  );
}

function OwnersPanel({
  playing,
  viewerId,
}: {
  playing: LeaguePlaying;
  viewerId: string;
}) {
  const { owners, score, otherBidders, lowestWinningBid, weekStatus } = playing;
  const sealed = weekStatus === "open" || weekStatus === "draft";

  return (
    <Card variant="flat" className="gap-3 p-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pt-4">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          Who owned it{owners.length > 0 && ` — ${tierWord(playing.topNDistinct)} winning tiers`}
        </span>
        {owners.length > 0 && score !== null && (
          <span className="type-body text-micro text-muted-foreground">
            Every owner earns the full {two(score)}. Scores are not split.
          </span>
        )}
      </div>

      {owners.length === 0 ? (
        <p className="type-body px-4 pb-4 text-ui text-muted-foreground">
          {sealed
            ? "Bids are sealed until the week closes. Nobody owns this film yet — not even the commissioner can see who bid."
            : "Nobody bid on this film, so nobody owned it."}
        </p>
      ) : (
        <>
          <ul className="flex flex-col border-t border-b">
            {owners.map((o, i) => (
              <OwnerRow
                key={o.profileId}
                rank={i + 1}
                owner={o}
                score={score}
                isMe={o.profileId === viewerId}
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 pb-4">
            <span className="type-body text-micro text-muted-foreground">
              {otherBidders === 0
                ? "Nobody else bid on it."
                : `${otherBidders} other ${otherBidders === 1 ? "player" : "players"} bid and missed the tiers — the lowest winning bid was $${lowestWinningBid}.`}
            </span>
            <span className="type-eyebrow text-eyebrow text-muted-foreground">
              Right column: points per dollar
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

export function PlayingRecord({
  playing,
  viewerId,
}: {
  playing: LeaguePlaying;
  viewerId: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ScorePanel playing={playing} />
      <OwnersPanel playing={playing} viewerId={viewerId} />
    </div>
  );
}
