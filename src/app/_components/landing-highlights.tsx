/**
 * WHY IT IS FUN, told in the game's own vocabulary rather than feature bullets.
 * Two real outcomes from a real league — the best thing that can happen and the
 * worst — because "blind bidding" means nothing until you have seen what a
 * cheap bid and an expensive one actually pay.
 *
 * ── THE PAIRING IS INK AND PAPER, NOT TWO CARDS ───────────────────────────
 * The steal sits on `--nav`, where vermilion is 5.57:1 and can carry the
 * number; the whiff sits on `--card`, where the same number would be 3.42:1 and
 * is set in `--foreground` instead. The contrast between the two panels IS the
 * contrast between the two outcomes, which is why they are not both cards.
 */
export function LandingHighlights() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="flex flex-col justify-between gap-3.5 bg-nav p-8 text-nav-foreground">
        <h2 className="type-eyebrow text-eyebrow text-nav-muted-foreground">
          Steal of the century
        </h2>
        <div className="flex flex-col gap-2">
          <span className="type-numeral text-display text-primary">188.40</span>
          <span className="type-h3 text-h3">points, for a $2 bid</span>
        </div>
        <p className="type-body text-ui text-nav-muted-foreground">
          Somebody in a real league did this with Top Gun: Maverick, and has not
          shut up about it since.
        </p>
      </div>

      <div className="flex flex-col justify-between gap-3.5 border bg-card p-8">
        <h2 className="type-eyebrow text-eyebrow">Priciest whiff</h2>
        <div className="flex flex-col gap-2">
          <span className="type-numeral text-display">$24</span>
          <span className="type-h3 text-h3">on a film that scored 1.98</span>
        </div>
        <p className="type-body text-ui text-muted-foreground">
          There is a prize for this. It is not a nice prize.
        </p>
      </div>
    </div>
  );
}
