import { redirect } from "next/navigation";

import { PublicHeader } from "@/components/public-header";
import { resolveLandingPath, safeNextPath } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";

import { LandingBeats } from "./_components/landing-beats";
import { LandingClose } from "./_components/landing-close";
import { LandingHero } from "./_components/landing-hero";
import { LandingHighlights } from "./_components/landing-highlights";

/**
 * `/` — THE LANDING PAGE (ADR-435, IA map §7.1).
 *
 * This address used to be a two-audience Mode: a sign-in form when signed out,
 * a `resolveLandingPath` redirect when signed in. Sign-in moved to `/login`,
 * which now has its own screen, and what is left here is the pitch.
 *
 * ── IT STILL HAS TWO AUDIENCES, AND ONLY ONE OF THEM SEES A PAGE ──────────
 * A member does not need to be sold the game they are already playing, so the
 * signed-in half is kept exactly as it was: an explicit, validated `?next=`
 * wins over the ordinary landing rule, because it means the visitor asked for a
 * specific page and was bounced on the way. Nothing in this repo sends `?next=`
 * HERE today — the proxy bounces to `/login` — but the parameter is honoured
 * rather than dropped so a hand-built or emailed link to `/?next=…` cannot
 * silently land someone in the wrong place.
 *
 * ── THE ROUTE PLACES; IT DOES NOT STYLE ───────────────────────────────────
 * Every piece of type and colour lives in a `_components/` file that can be
 * read on its own. What this file owns is the order of the beats, the page
 * measure, and the `<main>` — which has to come from here, because neither the
 * root layout nor `(member)/layout.tsx` renders one.
 *
 * `<PublicHeader />` sits OUTSIDE `<main>`: it is a banner landmark, and putting
 * it inside would leave the page with a header nested in its content.
 *
 * ── NO COMPOSER, AND THAT IS THE POINT ────────────────────────────────────
 * Rule 2 says a page imports its read from `src/lib/`. This page has no read:
 * the copy is fixed and the only query is "is anyone signed in", which is the
 * gate rather than the data. There is nothing for `src/lib/` to grow here.
 */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(safeNextPath(next) ?? (await resolveLandingPath(supabase, user.id)));
  }

  return (
    <>
      <PublicHeader />
      <main>
        <LandingHero />
        <div className="mx-auto flex max-w-measure-page flex-col gap-14 px-8 pt-14 pb-18">
          <LandingBeats />
          <LandingHighlights />
          <LandingClose />
        </div>
      </main>
    </>
  );
}
