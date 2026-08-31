import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SkipLink } from "@/components/skip-link";

/**
 * THE SIGNED-OUT HEADER, shared by every public page. Sits OUTSIDE `<main>` —
 * it is a banner, not content, and each page owns the one `<main>` it renders.
 *
 * It was `landing-nav` in the landing route's own `_components/` until
 * `/how-it-works` needed the identical bar (board 2.1). Rule 1: a component
 * moves here the first time a SECOND route needs it, and is renamed for what it
 * is rather than for where it was born.
 *
 * The "How it works" link is a self-link on that page, deliberately: a header
 * that loses an item depending on where you are is a header people stop
 * trusting to be in the same place.
 *
 * ── ONE BOOLEAN, BECAUSE A PUBLIC PAGE HAS TWO KINDS OF VISITOR ───────────
 * `/how-it-works` is public and members follow it from their own league. Two
 * things are wrong for them: being sold an account they already have, and
 * being shown a sign-in link when they are signed in. So the right-hand slot
 * becomes a single way back into the app. A stranger is never shown `/leagues`,
 * which they cannot open. The page below the header is identical either way —
 * this is chrome, not a gate.
 *
 * ── THE THREE DESTINATIONS ARE THE WHOLE PITCH, IN ORDER OF COMMITMENT ────
 * Read about it, come back to an account you have, start one you don't. The
 * board gives the third the only filled control on the bar, and it is the same
 * action the hero and the close both repeat.
 *
 * ── VERMILION BUDGET ON THIS SURFACE: THE WORDMARK AND THE PILL ───────────
 * The bar spends the accent twice, and on two different tokens, because the
 * two uses sit on different grounds. The wordmark is TEXT on `--nav`, so it
 * takes `--nav-primary` (#EB4B37, 5.59:1 on ink; the paper-side red would be
 * 3.80:1 here). The pill is a BACKGROUND, so it takes `--primary` (#C52F1B),
 * whose label is `--primary-foreground` — paper, at 5.04:1 — and whose own
 * edge against the band is 3.79:1.
 */
export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    // `relative` IS FOR THE SKIP LINK, which positions against this bar when it
    // is focused. The signed-in header gets the same anchoring free from being
    // `sticky`; a static header would fling the chip to the viewport corner.
    <header className="relative flex h-14 items-center justify-between bg-nav px-4 text-nav-foreground md:px-8">
      <SkipLink />

      {/* DECORATIVE, with the full name beside it in the accessibility tree.
          A screen reader announcing "T M P" is the brand spelled out letter by
          letter, which is noise; the sr-only span is what it should say. Same
          pairing the auth ink pane makes. */}
      <span className="type-eyebrow text-ui text-nav-primary">
        <span aria-hidden>TMP</span>
        <span className="sr-only">The Movie Pool</span>
      </span>

      <nav aria-label="Main" className="flex items-center gap-4 md:gap-5.5">
        <Link
          href="/how-it-works"
          className="type-ui text-ui text-nav-muted-foreground hover:text-nav-foreground"
        >
          How it works
        </Link>
        {/* A LINK WEARING THE BUTTON'S CLOTHES. `render` swaps the element,
            and `nativeButton={false}` is what tells Base UI that is deliberate
            — without it the button warns at runtime that its native semantics
            were removed. It navigates, so it must stay an `<a>`: a real
            `<button>` here would lose middle-click, open-in-new-tab and the
            status-bar preview. Every public CTA is written this way. */}
        {signedIn ? (
          <Button
            render={<Link href="/leagues" />}
            nativeButton={false}
            size="sm"
            className="type-ui text-ui"
          >
            Your leagues
          </Button>
        ) : (
          <>
            <Link href="/login" className="type-ui text-ui hover:underline">
              Sign in
            </Link>
            <Button
              render={<Link href="/signup" />}
              nativeButton={false}
              size="sm"
              className="type-ui text-ui"
            >
              Create account
            </Button>
          </>
        )}
      </nav>
    </header>
  );
}
