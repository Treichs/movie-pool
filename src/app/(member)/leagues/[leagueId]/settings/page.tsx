import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { requireUser } from "@/lib/auth";
import { getLeagueSettingsPage } from "@/lib/league-settings";

import { HouseRulesSection } from "./_components/house-rules-section";
import { IdentitySection } from "./_components/identity-section";
import { InvitesSection } from "./_components/invites-section";
import { MembersSection } from "./_components/members-section";

export const metadata = { title: "League settings" };

/**
 * `/leagues/[leagueId]/settings` — board 4.11.
 *
 * ── CONFIGURATION CENTRALIZES, OPERATIONS DISTRIBUTE (IA map §7.2) ──────
 * Four sections and no fifth. Closing a week, capturing results, generating
 * payouts and starting a season all stay next to the object they act on, which
 * is why none of them is here even though a settings page is where a reader
 * might look for them.
 *
 * ── A PLAYER GETS `notFound()`, NEVER A REDIRECT ───────────────────────
 * Sending them to `/leagues` would tell them the page is real and merely not
 * theirs. The composer returns null for a non-commissioner and this 404s on
 * it — the same reasoning `requireSeasonMember` already follows.
 *
 * ── THE LEFT RAIL IS NOT BUILT ─────────────────────────────────────────
 * The board draws a four-item rail beside the sections and, in its own words,
 * "draws all four stacked" anyway — the rail is a jump list for a page that is
 * already one screen of four headings. Anchors down a page this length are the
 * thing browsers already do; a second navigation for it is furniture.
 */
export default async function LeagueSettingsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase, user } = await requireUser();
  const page = await getLeagueSettingsPage({ supabase, user }, leagueId);
  if (!page) notFound();

  const {
    league,
    members,
    commissionerCount,
    myMemberId,
    rules,
    rulesRow,
    invites,
  } = page;

  return (
    <main className="mx-auto flex w-full max-w-measure-page flex-col gap-6 p-6 md:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/leagues/${league.id}`} />}>
              {league.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1>League settings</h1>
          <p className="type-dek text-ui text-muted-foreground">
            Configuration, in one place. Everything operational stays on the
            screen it acts on.
          </p>
        </div>
        <Badge variant="ink">Commissioners only</Badge>
      </div>

      <div className="flex max-w-measure-wide flex-col gap-10">
        <IdentitySection leagueId={league.id} name={league.name} />

        {rules && rulesRow ? (
          <HouseRulesSection
            leagueId={league.id}
            rules={rules}
            rulesRow={rulesRow}
          />
        ) : (
          <section className="flex flex-col gap-3">
            <h2>House rules</h2>
            {/* `create_league` always writes a settings row, so a league
                without one predates that. Writing defaults here would put
                numbers in the commissioner's name that they never chose. */}
            <p className="type-body max-w-measure-default text-ui text-muted-foreground">
              This league has no settings row, which means it predates them.
              Starting a season will write one from the rulebook&rsquo;s
              defaults, and it becomes editable here after that.
            </p>
          </section>
        )}

        <MembersSection
          leagueId={league.id}
          members={members}
          commissionerCount={commissionerCount}
          myMemberId={myMemberId}
        />

        <InvitesSection leagueId={league.id} invites={invites} />
      </div>
    </main>
  );
}
