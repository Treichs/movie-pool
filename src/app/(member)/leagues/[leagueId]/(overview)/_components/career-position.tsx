import { Figure } from "@/components/figure";
import { ordinal } from "@/lib/format";
import type { CareerPosition, CareerRival } from "@/lib/league-story";

/**
 * YOUR CAREER IN THIS LEAGUE — the league-scoped twin of the season
 * leaderboard's position block, and deliberately the same shape: a hero rank,
 * the figures that qualify it, a 2px ink rule, then the gap to the person
 * either side of you.
 *
 * A league page and a season page that answered "where do I stand" in two
 * different visual languages would be two products. This is the same one,
 * asked over every season instead of over one.
 *
 * ── TITLES SIT BESIDE THE RANK, NOT IN ITS PLACE ─────────────────────────
 * Titles are what a league argues about, and most members of most leagues have
 * none — a hero numeral reading "0" is a worse greeting than an honest
 * position. `league-story.ts` records the reasoning; this renders it.
 *
 * ── THE RIVALRY IS A SENTENCE, NOT A FIGURE ──────────────────────────────
 * "Four of seven shared seasons" needs its span stated to mean anything, and a
 * span does not fit a label-and-numeral pair. It also uses "they" throughout:
 * a display name says nothing about how a player is addressed.
 *
 * A DEAD HEAT IS NOT A LOSS. Ties are honoured everywhere in this game, so two
 * members can genuinely finish a season level — and "above them in 0 of 1"
 * reports that as a defeat. The three cases are branched rather than papered
 * over with one count.
 */
export function CareerPositionBlock({
  position,
  nearest,
}: {
  position: CareerPosition;
  nearest: CareerRival | null;
}) {
  return (
    <section aria-label="Your career in this league" className="flex flex-col gap-4">
      {/* A COLUMN GRID BELOW `sm`, THE SAME BASELINE ROW ABOVE IT. Left to
          wrap, four figures at a 40px gutter packed 3 + 1 on a phone and the
          orphan landed under whichever figure happened to be widest — a
          ranking's own numbers reading as ragged noise. `sm:contents` dissolves
          the phone grid at the first breakpoint, so the desktop row is
          unchanged. */}
      <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-10">
        <div className="flex flex-col gap-1">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            All-time
          </span>
          <span className="flex items-baseline gap-2">
            <span className="type-numeral text-numeral-xl leading-none">
              {ordinal(position.rank)}
            </span>
            <span className="type-body text-ui text-muted-foreground">
              of {position.memberCount}
            </span>
          </span>
          {position.sharedWith > 0 && (
            <span className="type-body text-micro text-muted-foreground">
              Tied with {position.sharedWith}{" "}
              {position.sharedWith === 1 ? "other member" : "other members"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-x-4 sm:contents">
          <Figure label="Titles" value={String(position.titles)} size="lg" />
          <Figure
            label={position.seasons === 1 ? "Season played" : "Seasons played"}
            value={String(position.seasons)}
            size="lg"
          />
          <Figure label="Career points" value={position.points.toFixed(2)} size="lg" />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t-2 border-foreground pt-4">
        {/* Two fixed columns on a phone rather than a ragged wrap: these labels
            carry member names, so their widths are whatever the league happens
            to have called its people. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:flex-wrap sm:gap-x-10">
          <Figure
            label="Best finish"
            value={
              position.bestFinish === null ? "—" : ordinal(position.bestFinish)
            }
          />
          {position.chasing && (
            <Figure
              label={`${position.chasing.name} ahead`}
              value={`${position.chasing.gap.toFixed(2)} pts`}
            />
          )}
          {position.pursuedBy && (
            <Figure
              label={`${position.pursuedBy.name} behind`}
              value={`${position.pursuedBy.gap.toFixed(2)} pts`}
            />
          )}
        </div>

        {nearest && <RivalryLine rival={nearest} />}
      </div>
    </section>
  );
}

function RivalryLine({ rival }: { rival: CareerRival }) {
  const seasons = rival.shared === 1 ? "season" : "seasons";

  if (rival.level === rival.shared) {
    return (
      <p className="type-dek max-w-measure-default text-ui text-muted-foreground">
        Your closest rival is{" "}
        <span className="type-h3 text-foreground">{rival.name}</span>. You have
        finished level with them in{" "}
        {rival.shared === 1 ? (
          "your one shared season"
        ) : (
          <>
            all{" "}
            <span className="type-numeral text-foreground">{rival.shared}</span>{" "}
            shared seasons
          </>
        )}
        .
      </p>
    );
  }

  return (
    <p className="type-dek max-w-measure-default text-ui text-muted-foreground">
      Your closest rival is{" "}
      <span className="type-h3 text-foreground">{rival.name}</span>. You have
      finished above them in{" "}
      <span className="type-numeral text-foreground">{rival.above}</span> of{" "}
      <span className="type-numeral text-foreground">{rival.shared}</span> shared{" "}
      {seasons}
      {rival.level > 0 ? (
        <>
          , and level in{" "}
          <span className="type-numeral text-foreground">{rival.level}</span>.
        </>
      ) : (
        "."
      )}
    </p>
  );
}
