import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { HouseRules } from "@/components/house-rules-fields";
import { requireCommissionerOfLeague } from "@/lib/auth";
import { getLeague } from "@/lib/league";
import { getNextSeasonDefaults } from "@/lib/season-settings";

import { NewSeasonForm } from "./_components/new-season-form";

export const metadata = { title: "Start a season" };

/**
 * `/leagues/[leagueId]/seasons/new` — board 5.2.
 *
 * ── ONE PAGE, NOT A WIZARD, AND THE BOARD IS RIGHT ────────────────────────
 * `/leagues/new` is four steps because it collects four unrelated things from
 * somebody new. This asks a returning commissioner for two dates and five
 * numbers they have chosen before. A stepper would put a Next button between
 * them and the thing they came to do. The two FIELDSETS are shared with the
 * wizard; the chrome is not, because the chrome is where the two screens
 * genuinely differ.
 *
 * ── THE GATE IS THE COMMISSIONER CHECK, AND IT IS NOT THE ONLY ONE ────────
 * `requireCommissionerOfLeague` redirects a player to `/leagues` — the right
 * answer to a navigation. `create_season` refuses them again on the write,
 * which is the check that actually protects the row.
 *
 * ── THE DEFAULTS ARE INHERITED, NOT INVENTED ──────────────────────────────
 * `getNextSeasonDefaults` (ADR-078) opens the form on the previous season's
 * settings, or the rulebook's for a league's first. It was already written and
 * unused; this screen is what it was written for.
 */
export default async function NewSeasonPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase } = await requireCommissionerOfLeague(leagueId);

  const [league, { defaults }] = await Promise.all([
    getLeague(supabase, leagueId),
    getNextSeasonDefaults(supabase, leagueId),
  ]);

  // The settings row speaks in numbers and the fields speak in strings, because
  // an `<input type="number">` holds a string and a half-typed one is not a
  // number at all.
  const houseRules: HouseRules = {
    bankroll: String(defaults.fake_bankroll),
    tiers: String(defaults.top_n_distinct),
    minBid: String(defaults.min_bid),
    dow: String(defaults.bids_due_dow),
    time: defaults.bids_due_time.slice(0, 5),
  };

  return (
    <main className="mx-auto flex max-w-measure-page flex-col gap-6 px-8 py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/leagues/${leagueId}`} />}>
              {league?.name ?? "League"}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Start a season</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <h1>Start a season</h1>
        <p className="text-muted-foreground">
          A season is a run of weekends with its own bankroll and its own rules.
          Its numbers are frozen the moment it starts.
        </p>
      </div>

      <NewSeasonForm leagueId={leagueId} defaults={houseRules} />
    </main>
  );
}
