import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * THE SIGNED-OUT HEADER. Sits OUTSIDE `<main>` — it is a banner, not content,
 * and `page.tsx` owns the one `<main>` this route renders.
 *
 * ── THE THREE DESTINATIONS ARE THE WHOLE PITCH, IN ORDER OF COMMITMENT ────
 * Read about it, come back to an account you have, start one you don't. The
 * board gives the third the only filled control on the bar, and it is the same
 * action the hero and the close both repeat.
 *
 * ── VERMILION BUDGET ON THIS SURFACE: THE WORDMARK AND THE PILL ───────────
 * `--nav` is a permanently-ink surface in both modes, where `#EB4B37` is
 * 5.57:1 rather than the 3.42:1 it measures on paper — so the red is legal as
 * text here and only here. The bar spends it twice because the pill is a
 * BACKGROUND (its label is `--primary-foreground`, near-black), which is what
 * the token is for everywhere else in the app.
 */
export function LandingNav() {
  return (
    <header className="flex h-14 items-center justify-between bg-nav px-4 text-nav-foreground md:px-8">
      {/* DECORATIVE, with the full name beside it in the accessibility tree.
          A screen reader announcing "T M P" is the brand spelled out letter by
          letter, which is noise; the sr-only span is what it should say. Same
          pairing the auth ink pane makes. */}
      <span className="type-eyebrow text-ui text-primary">
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
        <Link href="/login" className="type-ui text-ui hover:underline">
          Sign in
        </Link>
        {/* A LINK WEARING THE BUTTON'S CLOTHES. `render` swaps the element,
            and `nativeButton={false}` is what tells Base UI that is deliberate
            — without it the button warns at runtime that its native semantics
            were removed. It navigates, so it must stay an `<a>`: a real
            `<button>` here would lose middle-click, open-in-new-tab and the
            status-bar preview. Every landing CTA is written this way. */}
        <Button
          render={<Link href="/signup" />}
          nativeButton={false}
          size="sm"
          className="type-ui text-ui"
        >
          Create account
        </Button>
      </nav>
    </header>
  );
}
