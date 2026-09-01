import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ordinal } from "@/lib/format";
import type { Rival } from "@/lib/season-story";
import { cn } from "@/lib/utils";

/**
 * HEAD TO HEAD — your record against every other player, week by week.
 *
 * ── TWO SHAPES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS ───────────────────
 * The sentence names your NEAREST rival on points, which is the one comparison
 * that fits a phone and the one that decides places. The table below is the
 * whole field, which is the thing worth digging through on a laptop — the
 * split the product's own rule describes: bidding is a phone job, analysing a
 * season is a desktop job. Both ship; neither is a breakpoint variant of the
 * other.
 *
 * ── A WEEK WON IS A HAUL COMPARED, NOT A PLACE ────────────────────────────
 * `season-story.ts` counts the weeks in which your points for that week beat
 * theirs. Two players can both climb in the same week; only one of them
 * outscored the other, and that is what a record is.
 *
 * ── PRONOUNS ARE NOT ASSUMED ──────────────────────────────────────────────
 * A display name says nothing about how a player is addressed, so the sentence
 * uses "they" throughout. This is the app's rule everywhere a player is
 * described in prose.
 */
export function HeadToHead({
  rivals,
  nearest,
}: {
  rivals: Rival[];
  nearest: Rival | null;
}) {
  if (rivals.length === 0) return null;

  const byRank = [...rivals].sort((a, b) => a.rank - b.rank);

  return (
    <section className="flex flex-col gap-3">
      <h2>Head to head</h2>

      {nearest && <NearestLine rival={nearest} />}

      <div className="overflow-x-auto rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="w-20 text-right">Place</TableHead>
              <TableHead className="w-28 text-right">Weeks won</TableHead>
              <TableHead className="w-24 text-right">Drawn</TableHead>
              <TableHead className="w-28 text-right">Gap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byRank.map((r) => (
              <TableRow key={r.seasonMemberId}>
                <TableCell>
                  <Link
                    href={`/players/${r.profileId}`}
                    className="type-ui text-ui hover:underline"
                  >
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell className="type-numeral text-right text-ui text-muted-foreground">
                  {ordinal(r.rank)}
                </TableCell>
                <TableCell className="type-numeral text-right text-ui">
                  {r.wins}
                  <span className="text-muted-foreground">
                    {" "}
                    of {r.wins + r.losses + r.draws}
                  </span>
                </TableCell>
                <TableCell className="type-numeral text-right text-ui text-muted-foreground">
                  {r.draws}
                </TableCell>
                <TableCell
                  className={cn(
                    "type-numeral text-right text-ui",
                    r.gap > 0 && "text-destructive",
                    r.gap < 0 && "text-success",
                  )}
                >
                  {/* Their total minus yours, so the sign reads from your side:
                      a player ahead of you shows what you are down by. */}
                  {r.gap > 0 ? "+" : ""}
                  {r.gap.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function NearestLine({ rival }: { rival: Rival }) {
  const played = rival.wins + rival.losses + rival.draws;
  const ahead = rival.gap > 0;
  const level = rival.gap === 0;

  // A DEAD HEAT IS NOT A LOSS. Two players who owned the same films score the
  // same week, and "outscored them in 0 of 3" reports that as a whitewash.
  const allDrawn = rival.draws === played && played > 0;

  if (allDrawn) {
    return (
      <p className="type-dek max-w-measure-default text-ui text-muted-foreground">
        Your closest rival is{" "}
        <span className="type-h3 text-foreground">{rival.name}</span>. You have
        scored the same as them in{" "}
        {played === 1 ? (
          "the one scored week so far"
        ) : (
          <>
            all <span className="type-numeral text-foreground">{played}</span>{" "}
            scored weeks
          </>
        )}
        , and you are level on points.
      </p>
    );
  }

  return (
    <p className="type-dek max-w-measure-default text-ui text-muted-foreground">
      Your closest rival is{" "}
      <span className="type-h3 text-foreground">{rival.name}</span>. You have
      outscored them in{" "}
      <span className="type-numeral text-foreground">{rival.wins}</span> of{" "}
      <span className="type-numeral text-foreground">{played}</span> scored{" "}
      {played === 1 ? "week" : "weeks"}
      {level ? (
        <>, and you are level on points.</>
      ) : (
        <>
          , and they are{" "}
          <span className="type-numeral text-foreground">
            {Math.abs(rival.gap).toFixed(2)}
          </span>{" "}
          {ahead ? "points ahead of you" : "points behind you"}.
        </>
      )}
    </p>
  );
}
