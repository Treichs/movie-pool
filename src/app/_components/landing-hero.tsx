import Link from "next/link";

import { PerforationEdge } from "@/components/perforation-edge";
import { ScoreFormula } from "@/components/score-formula";
import { Button } from "@/components/ui/button";

/** How many perforations the hero's edges carry. Fewer than the auth shell's
 *  nine because this pane is shorter and the rhythm is spaced, not counted. */
const PERFORATIONS = 6;

/**
 * THE TOP OF THE LANDING PAGE — one promise, one action, and the rule that
 * makes the promise true.
 *
 * ── TWO SECTIONS, ONE FILE, AND THAT IS DELIBERATE ────────────────────────
 * The scoring formula is the hero's payoff line, not a feature of its own: it
 * is what the headline is claiming, set on paper directly beneath the ink so
 * the claim and its proof read as one movement. It never appears without the
 * hero and would be meaningless above it, so it does not get a file it could
 * be reordered away from.
 *
 * ── THE HEADLINE IS THE LARGEST TYPE IN THE APP ───────────────────────────
 * `text-display lg:text-display-lg` — 64px, stepping to the board's 96px once
 * there is room. `--text-display-lg` is a SIZE STEP of the display role, added
 * to `globals.css` with this screen; it shares `--fvs-display`, so nothing new
 * was invented about how the app sets type.
 *
 * ── VERMILION BUDGET ON THIS SURFACE ──────────────────────────────────────
 * The ink half spends it twice, and both are legal because `--nav` makes the
 * red 5.57:1: one word of the headline, and the primary call to action as a
 * BACKGROUND. The paper strip below spends it on two operator glyphs at 30px —
 * WCAG large text, where the bar is 3:1 and vermilion's 3.42:1 on paper clears
 * it. That is the only place in this app where the red is set on paper, and it
 * survives review because of the size. Do not copy it into body copy.
 */
export function LandingHero() {
  return (
    <>
      <section className="relative overflow-hidden bg-nav pt-24 pb-22 text-nav-foreground">
        <PerforationEdge edge="left" count={PERFORATIONS} />
        <PerforationEdge edge="right" count={PERFORATIONS} />

        <div className="relative mx-auto flex max-w-measure-page flex-col items-start gap-7 px-8">
          <span className="type-eyebrow text-eyebrow text-nav-muted-foreground">
            A season-long game about opening weekends
          </span>

          <h1 className="type-display max-w-[15ch] text-display tracking-tight lg:text-display-lg">
            Bet on the weekend. <span className="text-nav-primary">Blind.</span>
          </h1>

          <p className="type-dek max-w-measure-tight text-dek text-nav-muted-foreground">
            You get $100 of fake money and twenty-odd Fridays. Everything else is
            box office and reviews.
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-3.5">
            <Button
              render={<Link href="/signup" />}
              nativeButton={false}
              className="type-button h-13 px-7 text-ui"
            >
              Create an account
            </Button>
            {/* THE INVITE PATH, and it goes to sign-in rather than sign-up on
                purpose: an invitation is accepted from inside an account, and
                someone who has one should not be asked to make a second. */}
            <Button
              render={<Link href="/login" />}
              nativeButton={false}
              variant="ghost"
              className="type-button h-13 border-nav-muted-foreground px-7 text-ui text-nav-foreground hover:bg-nav-foreground/10 hover:text-nav-foreground"
            >
              I have an invite
            </Button>
          </div>
        </div>
      </section>

      {/* THE WHOLE GAME IN ONE LINE, on paper so it stands apart from the
          pitch above it. It is stated, not explained — `/how-it-works` is
          where the worked example lives, and duplicating it here would create
          two places to maintain the rules. The line itself now IS shared with
          that page, which is why it is a component: the rule is what this app
          is about, and two copies of it are two places to get it wrong. */}
      <section className="border-b">
        <ScoreFormula
          ground="paper"
          className="mx-auto max-w-measure-page justify-center px-8 py-10"
        />
      </section>
    </>
  );
}
