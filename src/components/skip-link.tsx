import { cn } from "@/lib/utils";

/**
 * THE FIRST TAB STOP ON ANY SCREEN WITH A HEADER, and the only reason it
 * exists is that it is first. Behind it in the signed-in frame sit the drawer
 * trigger, the wordmark, search, the bell, the account menu, three nav groups
 * and the league switcher — nine controls a keyboard user would otherwise
 * cross on every one of the 26 screens before reaching a word of the page.
 * WCAG 2.4.1 Bypass Blocks, and it is Level A.
 *
 * IT PAIRS WITH `<main id="main" tabIndex={-1}>`. The `tabindex` is what makes
 * the jump land in every browser rather than most of them, and `globals.css`
 * suppresses the focus ring it would otherwise draw around the whole page —
 * both are explained where that rule lives.
 *
 * VISIBLE ONLY WHEN FOCUSED, which is the whole design: `sr-only` is already
 * `position: absolute`, so the link costs its header no layout while hidden,
 * and `focus:not-sr-only` hands it back its box. Appearing from nothing is a
 * stronger focus indicator than any ring, so it wears none.
 *
 * IT IS A PAPER CHIP ON THE INK BAND. Both headers are `--nav` in both themes
 * and `--background` is the only ground that reads as "the page" against it,
 * so the link looks like the content it is offering to jump to. `type-button`
 * is the app's control voice — the same uppercase 11px the wordmark beside it
 * sets.
 *
 * A PLAIN `<a>`, NOT `next/link`. The destination is a fragment on the page
 * already rendered; routing it through the client router would be a navigation
 * where a scroll was wanted.
 *
 * THE HEADER IT SITS IN MUST BE POSITIONED — `sticky` counts, `relative`
 * counts, static does not, or the chip escapes to the viewport corner.
 *
 * THE PADDING IS BEHIND `focus:` FOR A REASON, and it is not symmetry. BOTH
 * `sr-only` and `not-sr-only` declare `padding: 0`, so an unprefixed `px-4
 * py-2.5` loses to the variant that reveals the chip and the thing that
 * appears is a 110x11 strip of paper with the words crushed against its edges.
 * Prefixing the padding puts it in the same variant layer as the reveal.
 */
export function SkipLink({ className }: { className?: string }) {
  return (
    <a
      href="#main"
      className={cn(
        "type-button text-button sr-only rounded-4xl bg-background text-foreground focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:px-4 focus:py-2.5",
        className,
      )}
    >
      Skip to content
    </a>
  );
}
