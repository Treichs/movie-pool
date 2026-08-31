import Link from "next/link";

import { TextLink } from "@/components/text-link";

/**
 * THE PUBLIC FOOTER — the page ended at the closing CTA before this.
 *
 * It matters more here than on a signed-in screen for two reasons. This is the
 * page strangers see, and a product that moves real money between friends
 * ending abruptly with no account of itself reads as unfinished. And it is
 * where "read the rules" belongs for the person who is not ready to sign up:
 * the hero's own CTAs both ask for a commitment, and the rules are the one
 * thing a curious reader wants that costs them nothing.
 *
 * INK, because it closes an ink hero and the two grounds bracket the paper
 * between them. `--nav-primary` is the only red legal on this ground.
 */
export function PublicFooter() {
  return (
    <footer className="bg-nav text-nav-foreground">
      <div className="mx-auto flex max-w-measure-page flex-wrap items-center justify-between gap-x-10 gap-y-5 px-8 py-10">
        <div className="flex flex-col gap-1.5">
          <Link
            href="/"
            className="type-eyebrow text-ui w-fit text-nav-primary outline-none focus-visible:ring-3 focus-visible:ring-nav-foreground/30"
          >
            <span aria-hidden>TMP</span>
            <span className="sr-only">The Movie Pool — home</span>
          </Link>
          <p className="type-micro text-micro text-nav-muted-foreground">
            A season-long game about opening weekends. Fake money, real box
            office.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-7 gap-y-2.5">
          <TextLink href="/how-it-works" size="ui" className="text-nav-foreground">
            How it works
          </TextLink>
          <TextLink href="/how-it-works#faq" size="ui" className="text-nav-foreground">
            The rules
          </TextLink>
          <TextLink href="/login" size="ui" className="text-nav-foreground">
            Sign in
          </TextLink>
        </nav>
      </div>
    </footer>
  );
}
