import type { Headline } from "@/lib/season-story";
import { cn } from "@/lib/utils";

/**
 * WHAT THE LAST SCORED WEEK IS REMEMBERED FOR — biggest haul, biggest climb,
 * best value, worst value.
 *
 * ── NOT THE SAME THING AS THE SEASON AWARDS BELOW ─────────────────────────
 * The provisional awards further down this tab are the season's best and worst
 * picks OVERALL, and they stop moving once a season is a few weeks old. These
 * are about the week that just landed — the one people are still arguing
 * about. The two are labelled apart for the same reason `leaderboard.ts`
 * labels a player's efficiency apart from the best single pick.
 *
 * ── VERMILION MARKS ONE NAME, NOT THE WHOLE LINE ──────────────────────────
 * The accent means *live and yours*. A headline that names you is the literal
 * case — but a three-way tie contains two names that are not yours, and
 * painting the whole list red claims their achievement as well as saying it is
 * yours. Each name carries its own flag and is coloured on its own.
 *
 * ── A TIE IS A SHARED HEADLINE ────────────────────────────────────────────
 * Every name that achieved the figure is listed. Sorting and taking the head
 * would pick an arbitrary winner out of a tie, which this game does not do
 * anywhere else.
 */
/**
 * The column count follows the number of briefs.
 *
 * IT USED TO RUN TO FOUR ACROSS, then stopped at two when this became a bento
 * cell seven columns of twelve wide — four briefs across 628px gives each one
 * about 160px, and a name, a figure and a film list all wrap. The cell went
 * back to the full twelve on 2026-09-02, so four across is 272px each and the
 * measure that killed it no longer applies. Two across survives everywhere
 * narrower. The class has to be a literal for Tailwind to emit it at all.
 */
const COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2",
  4: "sm:grid-cols-2 xl:grid-cols-4",
};

export function WeekStory({ headlines }: { headlines: Headline[] }) {
  if (headlines.length === 0) return null;

  return (
    <div
      className={cn(
        // The cell already draws the panel. What is left is the division
        // BETWEEN briefs, which bleeds to the panel edge so the rules read as
        // a page's columns rather than as a box inside a box.
        "-mx-(--card-spacing) -mb-(--card-spacing) grid grid-cols-1 border-t",
        COLUMNS[headlines.length] ?? "sm:grid-cols-2",
      )}
    >
      {headlines.map((h) => (
        <div
          key={h.kind}
          className={cn(
            "flex flex-col gap-1.5 p-(--card-spacing)",
            "border-b border-border last:border-b-0",
            "sm:border-b sm:[&:nth-last-child(-n+2)]:border-b-0",
            "sm:border-l sm:[&:nth-child(odd)]:border-l-0",
            // FOUR ACROSS IS ONE ROW, so every bottom rule goes and every
            // brief but the first takes a left one — including the third,
            // which the two-column rule above cleared as the start of a row it
            // is no longer the start of.
            "xl:border-b-0 xl:border-l xl:first:border-l-0",
          )}
        >
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            {h.label}
          </span>
          <span className="type-h3 text-h3 text-foreground">
            {h.names.map((n, i) => (
              <span key={n.name}>
                {i > 0 && ", "}
                <span className={cn(n.isMine && "text-primary")}>{n.name}</span>
              </span>
            ))}
          </span>
          <span className="type-numeral text-h2 leading-none">{h.figure}</span>
          <span className="type-body text-micro text-muted-foreground">
            {h.films.length > 0 ? `${h.films.join(", ")} — ` : ""}
            {h.detail}
          </span>
        </div>
      ))}
    </div>
  );
}
