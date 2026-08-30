import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * THE CLOSE — an ink band, which is the board's call and the opposite of the
 * landing page's bordered one. The landing has a single ink block and a second
 * would compete with its hero; this page is long enough that the band reads as
 * an ending rather than a rival.
 *
 * ── THE CTA IS `--primary` AS A BACKGROUND, ON INK ────────────────────────
 * Exactly the pill in `PublicHeader`, for the reason recorded there: a
 * background is judged by its label, and `--primary-foreground` on `--primary`
 * is 5.04:1, while the pill's own edge against the band is 3.79:1. The board
 * draws it vermilion with black text; that is the ink-side accent used as a
 * ground, which is not a pairing this palette sweeps.
 *
 * ── WHAT THE SEASON ACTUALLY AWARDS ───────────────────────────────────────
 * The board's close says "Best points-per-dollar takes the efficiency prize".
 * The rulebook is finer: season points-per-dollar is a RANKING beside the
 * standings, not an award, and the two money awards are single-FILM
 * points-per-dollar — best and worst. Rather than explain three things in a
 * closing line, this says the true simple part and leaves the awards to the
 * rulebook.
 *
 * ── IT TAKES THE SAME BOOLEAN THE HEADER DOES ─────────────────────────────
 * A member follows this page from their own league. Fixing the header's "create
 * an account" and leaving the closing one is worse than fixing neither: it
 * looks deliberate on one and forgotten on the other. Both slots turn into the
 * same way back into the app.
 */
export function HowItWorksClose({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section className="flex flex-col items-start justify-between gap-7 bg-nav px-9 py-8 text-nav-foreground md:flex-row md:items-center">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-nav-foreground">That is the whole game</h2>
        <p className="type-body text-ui text-nav-muted-foreground">
          Highest points at the end of the season wins. Points per dollar is
          ranked alongside it.
        </p>
      </div>
      <Button
        render={<Link href={signedIn ? "/leagues" : "/signup"} />}
        nativeButton={false}
        className="type-button h-11 shrink-0 px-5.5 text-ui"
      >
        {signedIn ? "Back to your leagues" : "Create an account"}
      </Button>
    </section>
  );
}
