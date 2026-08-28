import Link from "next/link";

import { Perforation } from "@/components/perforation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How many perforations the hero's edges carry. Fewer than the auth shell's
 *  nine because this pane is shorter and the rhythm is spaced, not counted. */
const PERFORATIONS = 6;

/** One perforated edge of the film cell. Absolutely positioned so the hero's
 *  own content can sit on the page measure without allowing for them.
 *
 *  HIDDEN BELOW `xl`, and that is the one responsive decision a static board
 *  cannot draw. The columns occupy 28–54px from each edge; the content measure
 *  is `max-w-measure-page px-8`, so below roughly 1280px the text would reach
 *  them and paint over the edge rather than beside it. The auth shell makes the
 *  same call for the same reason — there by hiding the whole ink pane. */
function PerforationEdge({ edge }: { edge: "left" | "right" }) {
  return (
    <div
      // DECORATIVE, and not a list. Six identical shapes announced to a screen
      // reader would be six pieces of noise ahead of the promise.
      aria-hidden
      className={cn(
        "absolute inset-y-0 hidden flex-col justify-around py-3 xl:flex",
        edge === "left" ? "left-7" : "right-7"
      )}
    >
      {Array.from({ length: PERFORATIONS }, (_, i) => (
        <Perforation key={i} />
      ))}
    </div>
  );
}

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
        <PerforationEdge edge="left" />
        <PerforationEdge edge="right" />

        <div className="relative mx-auto flex max-w-measure-page flex-col items-start gap-7 px-8">
          <span className="type-eyebrow text-eyebrow text-nav-muted-foreground">
            A season-long game about opening weekends
          </span>

          <h1 className="type-display max-w-[15ch] text-display tracking-tight lg:text-display-lg">
            Bet on the weekend. <span className="text-primary">Blind.</span>
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
          two places to maintain the rules. */}
      <section className="border-b">
        <p className="type-numeral mx-auto flex max-w-measure-page flex-wrap items-center justify-center gap-4.5 px-8 py-10 text-h2">
          <span>Opening box office</span>
          {/* The glyphs are hidden and the words are spoken. A screen reader's
              default punctuation level skips `×` and `=` entirely, which would
              read the formula as three unconnected nouns. */}
          <span aria-hidden className="text-primary">
            &times;
          </span>
          <span className="sr-only">multiplied by</span>
          {/* A registered mark, and not ours to have auto-translate mangle. */}
          <span translate="no">Tomatometer</span>
          <span aria-hidden className="text-primary">
            =
          </span>
          <span className="sr-only">equals</span>
          <span>Your score</span>
        </p>
      </section>
    </>
  );
}
