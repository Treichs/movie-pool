import type { NearMiss, RevealBrief } from "@/lib/reveal";
import { cn } from "@/lib/utils";

/**
 * WHO BID WELL, AND WHO BID POORLY — the half of a reveal that is about
 * everybody else.
 *
 * The same brief strip the season leaderboard uses for its week, deliberately:
 * a player who has learned to read four labelled figures on one screen should
 * not have to learn a second grammar for the same idea on another. What
 * changes is the subject — these are about bids, and they land the moment a
 * week closes rather than waiting for Monday's scores.
 *
 * ── THE NEAR MISS IS SET APART, BECAUSE IT IS ABOUT THE READER ──────────
 * "You were outbid on Kraven by $1" is the sentence a sealed auction exists to
 * deliver, and burying it as a fifth equal tile would be the page refusing to
 * say the one thing it knows the reader came for. It sits above the strip, in
 * the accent — the one place on this page where *live and yours* means a
 * result rather than a state.
 */
export function RevealBriefStrip({
  briefs,
  nearMiss,
}: {
  briefs: RevealBrief[];
  nearMiss: NearMiss | null;
}) {
  if (briefs.length === 0 && nearMiss === null) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2>How it went</h2>

      {nearMiss && (
        <p className="type-dek max-w-measure-default text-ui text-muted-foreground">
          You were outbid on{" "}
          <span className="type-h3 text-foreground">{nearMiss.title}</span> by{" "}
          <span className="type-numeral text-primary">${nearMiss.short}</span> —
          you bid{" "}
          <span className="type-numeral text-foreground">${nearMiss.mine}</span>{" "}
          and the cut was{" "}
          <span className="type-numeral text-foreground">${nearMiss.cut}</span>.
        </p>
      )}

      {briefs.length > 0 && (
        <div className="grid grid-cols-1 rounded border bg-card lg:grid-cols-2 xl:grid-cols-3">
          {briefs.map((b) => (
            <div
              key={b.kind}
              className={cn(
                "flex flex-col gap-1.5 p-5",
                "border-b border-border last:border-b-0",
                "lg:border-b lg:border-l lg:nth-[2n+1]:border-l-0",
                "xl:border-l xl:nth-[3n+1]:border-l-0",
              )}
            >
              <span className="type-eyebrow text-eyebrow text-muted-foreground">
                {b.label}
              </span>
              {b.names.length > 0 && (
                <span className="type-h3 text-h3">
                  {b.names.map((n, i) => (
                    <span key={n.name}>
                      {i > 0 && ", "}
                      <span className={cn(n.isMine && "text-primary")}>
                        {n.name}
                      </span>
                    </span>
                  ))}
                </span>
              )}
              <span className="type-numeral text-h2 leading-none">
                {b.figure}
              </span>
              <span className="type-body text-micro text-muted-foreground">
                {b.film}
                {b.film && b.detail ? " — " : ""}
                {b.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
