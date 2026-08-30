import { PerforationEdge } from "@/components/perforation-edge";
import { ScoreFormula } from "@/components/score-formula";

/** Five a side. The band is shorter than the landing hero's, and the rhythm is
 *  spaced rather than counted — six would crowd it. */
const PERFORATIONS = 5;

/**
 * THE TOP OF `/how-it-works` — and the one place in the app where the scoring
 * rule is the headline rather than a supporting line.
 *
 * The landing page states the rule under its pitch; here it IS the pitch,
 * because someone reading this page has already decided they want to know how
 * it works. `ScoreFormula` is shared between the two so the rule has one
 * definition, and it takes `ground="ink"` because `--primary` would be 3.80:1
 * on this band. The board draws the glyphs vermilion, which is `--nav-primary`
 * — the same choice, made by the component from the ground rather than by hand.
 */
export function HowItWorksHero() {
  return (
    <section className="relative overflow-hidden bg-nav py-18 text-nav-foreground">
      <PerforationEdge edge="left" count={PERFORATIONS} />
      <PerforationEdge edge="right" count={PERFORATIONS} />

      <div className="relative mx-auto flex max-w-measure-page flex-col items-start gap-6 px-8">
        <span className="type-eyebrow text-eyebrow text-nav-muted-foreground">
          How the Movie Pool works
        </span>
        <h1 className="max-w-[18ch] text-nav-foreground">
          Bet on the weekend. Blind.
        </h1>
        <p className="type-dek max-w-measure-default text-dek text-nav-muted-foreground">
          A season-long game with fake money, real box office, and no
          spreadsheet.
        </p>
        <ScoreFormula ground="ink" className="mt-2" />
      </div>
    </section>
  );
}
