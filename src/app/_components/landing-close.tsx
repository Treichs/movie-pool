import Link from "next/link";

import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";

/**
 * THE CLOSE — the same action a third time, plus the handoff to the real
 * explainer.
 *
 * Repeating "Create an account" is not an oversight: the header offers it to
 * someone who arrived decided, the hero to someone the promise convinced, and
 * this to someone who read the whole page. `/how-it-works` sits beside it as a
 * cobalt link rather than a second button, because a page with two equal
 * buttons has no primary action at all.
 *
 * A 2px ink rule rather than a filled panel, per the board: the landing page
 * has one ink block already, and a second would compete with the hero.
 */
export function LandingClose() {
  return (
    <div className="flex flex-col items-start justify-between gap-8 border-2 border-foreground px-9 py-8 md:flex-row md:items-center">
      <div className="flex flex-col gap-1.5">
        <h2>Thirty-three seasons of this</h2>
        <p className="type-body text-ui text-muted-foreground">
          It ran on a spreadsheet until now. Start a league, or take the full
          rules first.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <TextLink href="/how-it-works" size="ui">
          Read the rules
        </TextLink>
        <Button
          render={<Link href="/signup" />}
          nativeButton={false}
          variant="ink"
          className="type-button h-11 px-5.5 text-ui"
        >
          Create an account
        </Button>
      </div>
    </div>
  );
}
