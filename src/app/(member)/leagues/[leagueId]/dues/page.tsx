import { notFound } from "next/navigation";
import Link from "next/link";

import { Figure } from "@/components/figure";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth";
import { getLeagueDues } from "@/lib/league-dues";

import { BalanceList } from "./_components/balance-list";
import { SettlementTable } from "./_components/settlement-table";

export const metadata = { title: "League dues" };

/**
 * `/leagues/[leagueId]/dues` — board 4.4.
 *
 * ── THE SIGN IS THE WHOLE DESIGN PROBLEM ────────────────────────────────
 * A positive balance means the LEAGUE OWES THEM, which is the opposite of how
 * "your balance" reads on every other screen anyone has used. So the words are
 * everywhere: a chip per row, a sentence under the list, and a line under the
 * viewer's own figure. That is deliberate repetition, not clutter.
 *
 * ── "RECORD A PAYMENT" IS NOT BUILT, AND IT IS NOT MISSING ──────────────
 * The board draws it at the top. It would open a picker to choose the member
 * and season, then do exactly what the row's own "Mark paid" does — the same
 * RPC against the same `season_member_id`, with two more steps to get there.
 * The plan's step 3 lists the row control and not the button, and the row is
 * where the number the payment is about already is.
 *
 * ── NOTHING HERE IS BUILT WITHOUT A FINALIZED SETTLEMENT ────────────────
 * `get_league_payments` returns finalized seasons only, and
 * `record_settlement_payment` refuses a draft — until the amounts stop being
 * regenerable there is nothing to owe. The empty state says which of the two
 * is true rather than reading as "nobody owes anything".
 */
export default async function LeagueDuesPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase, user } = await requireUser();
  const dues = await getLeagueDues({ supabase, user }, leagueId);
  if (!dues) notFound();

  const { league, isCommissioner, balances, season, mine, outstanding } = dues;

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
            <BreadcrumbPage>League dues</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <h1>League dues</h1>
        <p className="type-dek text-ui text-muted-foreground">
          Real money, tracked outside the game. The app records who paid whom,
          not how.
        </p>
      </div>

      {balances.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nothing to settle yet</EmptyTitle>
            <EmptyDescription>
              Dues appear once a season&rsquo;s settlement is finalized — until
              then the amounts can still be regenerated, so there is nothing to
              owe. This is not a league where everybody is square.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h2>All-time balances</h2>
              <BalanceList balances={balances} />
            </section>

            {season && (
              <SettlementTable
                leagueId={league.id}
                seasonName={season.name}
                rows={season.rows}
                isCommissioner={isCommissioner}
              />
            )}
          </div>

          <div className="flex flex-col gap-4">
            {mine && (
              <Card
                variant="flat"
                className="gap-1.5 border-l-4 border-l-foreground"
              >
                <Figure
                  label="Your balance"
                  value={
                    mine.balance === 0
                      ? "$0"
                      : `${mine.balance > 0 ? "+" : "−"}$${Math.abs(mine.balance)}`
                  }
                  size="hero"
                />
                <span className="type-body text-ui text-muted-foreground">
                  {mine.balance === 0
                    ? `Square${mine.throughSeason ? ` through ${mine.throughSeason}` : ""}.`
                    : mine.balance > 0
                      ? "The league owes you this."
                      : "You owe the league this."}
                </span>
              </Card>
            )}

            <Card variant="flat" size="sm" className="gap-2.5">
              <span className="type-eyebrow text-eyebrow text-muted-foreground">
                Outstanding
              </span>
              <div className="flex items-baseline justify-between gap-4">
                <span className="type-body text-ui text-muted-foreground">
                  Owed to the league
                </span>
                <span className="type-numeral text-h3">
                  ${outstanding.owedToLeague}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="type-body text-ui text-muted-foreground">
                  Owed by the league
                </span>
                <span className="type-numeral text-h3">
                  ${outstanding.owedByLeague}
                </span>
              </div>
              <Separator className="my-0.5" />
              <div className="flex items-baseline justify-between gap-4">
                <span className="type-body text-ui">Members not square</span>
                <span className="type-numeral text-h3">
                  {outstanding.notSquare} of {outstanding.members}
                </span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
