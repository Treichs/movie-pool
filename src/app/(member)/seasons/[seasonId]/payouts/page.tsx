import { notFound } from "next/navigation";
import Link from "next/link";
import { InfoIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireSeasonMember } from "@/lib/auth";
import { getPayouts } from "@/lib/payouts";

import { CommissionerControls } from "./_components/commissioner-controls";
import { PayoutAwards } from "./_components/payout-awards";
import { PayoutLedger } from "./_components/payout-ledger";
import { YourResult } from "./_components/your-result";

export const metadata = { title: "Payouts" };

/**
 * `/seasons/[seasonId]/payouts` — boards 5.1a and 5.1b, ONE route.
 *
 * ── THE MERGE, AND HOW IT RESOLVES ─────────────────────────────────────
 * The commissioner's affordances split by KIND, and that split is the whole
 * answer. **Status goes to the top** as one line, because it qualifies the
 * meaning of everything below it — a draft nobody else can see is a different
 * page from a published one. **Controls go to the foot**, in a bounded
 * ink-headed block. In between, both roles read the identical page, opening
 * with their own result, because a commissioner is a player too.
 *
 * ── A PLAYER NEVER SEES A DRAFT ────────────────────────────────────────
 * `settlements` is RLS-gated: the commissioner sees drafts, every member sees
 * a settlement once final. So a player on an unsettled season gets the empty
 * state and not a hidden page — the database decides that, not this file.
 *
 * ── THE ADDRESS IS LOAD-BEARING ────────────────────────────────────────
 * The season-settled statement links here. It does not change.
 */
export default async function PayoutsPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const ctx = await requireSeasonMember(seasonId);
  const payouts = await getPayouts(ctx, seasonId);
  if (!payouts) notFound();

  const {
    season,
    league,
    isCommissioner,
    settlement,
    isFinal,
    mine,
    awards,
    ledger,
    finalizeBlocker,
  } = payouts;

  return (
    <main className="mx-auto flex w-full max-w-measure-page flex-col gap-6 p-6 md:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          {league && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/leagues/${league.id}`} />}>
                  {league.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/seasons/${season.id}`} />}>
              {season.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Payouts</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1>{season.name} payouts</h1>
          <p className="type-dek text-ui text-muted-foreground">
            {settlement === null
              ? "Nothing has been worked out yet."
              : isFinal
                ? `Final · $${settlement.payout_snapshot.pot} in the pot from ${settlement.payout_snapshot.member_count} players`
                : "Draft · generated from the standings as they stand today"}
          </p>
        </div>
        {isCommissioner && <Badge variant="ink">You commission</Badge>}
      </div>

      {/* STATUS, NOT A TOOLBAR. One line at the top because it qualifies
          everything below it; the controls are at the foot. */}
      {isCommissioner && settlement !== null && !isFinal && (
        <div className="flex items-start gap-3 rounded border-2 border-foreground px-4 py-3">
          <InfoIcon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          <p className="type-body text-ui">
            <span className="font-semibold">Draft — only you can see this.</span>{" "}
            {season.status === "completed" || season.status === "archived"
              ? "The season is over, so these numbers are settled. Finalizing publishes them."
              : "The season is still running, so these numbers move every Monday."}{" "}
            Regenerate as often as you like; finalizing is once.
          </p>
        </div>
      )}

      {settlement === null ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No payouts yet</EmptyTitle>
            <EmptyDescription>
              {isCommissioner
                ? "Generate a draft below to see what everyone would win or owe on today's standings. Nobody else can see a draft."
                : "Your commissioner works these out at the end of the season. Nothing appears here until they publish it."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {mine && <YourResult mine={mine} isFinal={isFinal} />}
          <PayoutAwards awards={awards} />
          <PayoutLedger ledger={ledger} />
        </>
      )}

      {isCommissioner && (
        <CommissionerControls
          seasonId={season.id}
          leagueId={league?.id ?? null}
          settlementId={settlement?.id ?? null}
          hasDraft={settlement !== null && !isFinal}
          isFinal={isFinal}
          finalizeBlocker={finalizeBlocker}
        />
      )}
    </main>
  );
}
