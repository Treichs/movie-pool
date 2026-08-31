import { PublicHeader } from "@/components/public-header";
import { createClient } from "@/lib/supabase/server";

import { HowItWorksClose } from "./_components/how-it-works-close";
import { HowItWorksHero } from "./_components/how-it-works-hero";
import { RulesWorthKnowing } from "./_components/rules-worth-knowing";
import { WeekBeats } from "./_components/week-beats";
import { WorkedExample } from "./_components/worked-example";

export const metadata = {
  title: "How it works",
  description:
    "The Movie Pool in full: sealed bids on the weekend's wide releases, scored on opening box office times the Tomatometer.",
};

/**
 * `/how-it-works` — THE RULEBOOK'S PUBLIC FACE.
 *
 * ── PUBLIC ON PURPOSE, AND THE PROXY SAYS WHY ─────────────────────────────
 * The most useful moment for "how does this work" is BEFORE someone accepts an
 * invitation, and a page that needs an account to read cannot answer that. So
 * there is no gate here, and no composer: the copy is fixed and nothing is
 * fetched. Rule 2 says a page imports its read from `src/lib/`; this page has
 * no read to import.
 *
 * ── IT DOES READ THE SESSION, FOR THE CHROME ONLY ─────────────────────────
 * One `getUser` call, and it decides nothing about the content. A member
 * arriving from their league's "how does this work" link should not be sold an
 * account they already have, and a stranger should not be offered a link to
 * `/leagues` they cannot open. Both headers are the same component with one
 * boolean; the page below it is identical either way.
 *
 * ── THE RULEBOOK OUTRANKS THE BOARD, AND DID SO TWICE ─────────────────────
 * Board 2.1 draws a limited-release opt-in that the rulebook says does not
 * exist, and states the three-tier count as a rule rather than a default. Both
 * are corrected in the components, each with the reason written beside it.
 * A third correction is presentational: the board paints the beat numerals
 * vermilion on paper, where that red is 3.42:1.
 */
export default async function HowItWorksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <PublicHeader signedIn={Boolean(user)} />
      <main id="main" tabIndex={-1}>
        <HowItWorksHero />
        <div className="mx-auto flex max-w-measure-page flex-col gap-12 px-8 pt-12 pb-16">
          <WeekBeats />
          {/* The rules and the example are one thought: the rule that surprises
              people, and the arithmetic that settles it. Side by side above
              `lg`, stacked below — the example's chips and stat row need the
              width more than the rules do. */}
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <RulesWorthKnowing />
            <WorkedExample />
          </div>
          <HowItWorksClose signedIn={Boolean(user)} />
        </div>
      </main>
    </>
  );
}
