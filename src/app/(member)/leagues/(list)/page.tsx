import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getHome } from "@/lib/home";

import { Greeting } from "./_components/greeting";
import { InviteCard } from "./_components/invite-card";
import { LeagueRows } from "./_components/league-rows";
import { NoLeagues } from "./_components/no-leagues";
import { SidePanels } from "./_components/side-panels";

export const metadata = { title: "Your leagues" };

/**
 * `/leagues` — THE SIGNED-IN FRONT DOOR, and a doorway rather than a room.
 *
 * ── WHAT THIS PAGE IS FOR ─────────────────────────────────────────────────
 * It is the only screen in the app about the viewer's RELATIONSHIP to leagues
 * rather than about a league. Three jobs, and nothing else belongs here:
 *
 *   1. The zero-league state. For that person this page is the whole product.
 *   2. Where membership changes — accept an invitation, start a league. The
 *      only two actions in the app that are not about a particular league.
 *   3. "What am I part of, and what needs me" — the roster, ordered by urgency.
 *
 * ── WHAT IT DELIBERATELY IS NOT ───────────────────────────────────────────
 * Not a cross-league dashboard. `src/lib/home.ts` carries the reason in full:
 * this replaced a Dashboard on 2026-08-03 because each league has its own
 * bankroll and its own rules, so a combined figure means nothing. Fantasy
 * platforms do aggregate — Yahoo's Home tab is a card per league — and it works
 * for them because their players are in many leagues at once bidding on the
 * same players. Real usage here is one main league and occasionally a second
 * (ADR-094), and at one league an aggregate is a page with one number on it.
 *
 * ── MOST MEMBERS WILL RARELY SEE THIS, ON PURPOSE ─────────────────────────
 * `chooseLandingPath` routes a signed-in player PAST here to their live season
 * (IA map §5.3: "the season is the front door"). That is not a reason to build
 * it thinly — it is the reason to build it for the two people who do arrive:
 * the newcomer with nothing, and the invitee. Whether the landing rule should
 * change is an open question, deliberately left open on 2026-08-29.
 *
 * ── THE GATE ──────────────────────────────────────────────────────────────
 * `requireUser` before the read, as every composer requires. The group layout
 * gates too, and neither is the reason this is safe: a layout does not re-run
 * on client navigation, so the page's own gate is the one that counts.
 */
export default async function LeaguesPage() {
  const { supabase, user } = await requireUser();
  const home = await getHome({ supabase, user });

  return (
    <main className="mx-auto flex max-w-measure-page flex-col gap-6 px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Greeting name={home.displayName} />
        {/* Hidden in the empty state, which offers the same action with room to
            explain it. Two "Start a league" buttons on one screen is one too
            many, and the emptier screen is the one that should carry it. */}
        {home.leagues.length > 0 && (
          <Button
            render={<Link href="/leagues/new" />}
            nativeButton={false}
            variant="ink"
          >
            Start a league
          </Button>
        )}
      </div>

      {/* ABOVE THE LEAGUES, ALWAYS. An invitation is the only thing here that
          expires, and burying it under a list of leagues you already have is
          how it gets missed. */}
      {home.invites.map((invite) => (
        <InviteCard key={invite.id} invite={invite} />
      ))}

      {home.leagues.length === 0 ? (
        <NoLeagues invitePending={home.invites.length > 0} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="flex flex-col gap-3">
            <h2>Your leagues</h2>
            <LeagueRows leagues={home.leagues} />
          </section>
          <SidePanels email={home.email} />
        </div>
      )}

      {/* The panels follow the empty state rather than sitting beside it: with
          no leagues there is no left column for them to sit next to. */}
      {home.leagues.length === 0 && (
        <div className="max-w-100">
          <SidePanels email={home.email} />
        </div>
      )}
    </main>
  );
}
