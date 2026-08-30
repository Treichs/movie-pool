import { notFound } from "next/navigation";
import Link from "next/link";

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
import { requireUser } from "@/lib/auth";
import { numberWord } from "@/lib/format";
import { getLeagueRecordsPage } from "@/lib/league";

import { CareerTable } from "./_components/career-table";
import { RecordCard } from "./_components/record-card";

export const metadata = { title: "Record book" };

/**
 * `/leagues/[leagueId]/records` — the record book. Board 4.3.
 *
 * ── THE SHELF'S LENGTH IS THE LEAGUE'S, NOT THE BOARD'S ─────────────────
 * The board draws six cards with three heavy. `getLeagueRecordBook` produces
 * up to SEVEN and marks four of them marquee, because the shelf grew a second
 * row after the board was drawn (record-book-redesign, 2026-08-16) — and every
 * record self-suppresses when the league has no data for it, so a young league
 * shows fewer. Rendering the composer's own list and its own `marquee` flag is
 * what keeps this page true for a league on its first weekend and for one on
 * its thirty-third season.
 *
 * ── NOTHING HERE IS STORED ──────────────────────────────────────────────
 * The whole book is derived on every render, so it cannot drift from the rows
 * it describes and there is no cache for a week close to invalidate. That is
 * `league-records.ts`'s decision, and this page inherits it by doing nothing.
 */
export default async function LeagueRecordsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase, user } = await requireUser();
  const page = await getLeagueRecordsPage({ supabase, user }, leagueId);
  if (!page) notFound();

  const { league, book } = page;

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
            <BreadcrumbPage>Record book</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <h1>Record book</h1>
        {/* The board's dek is flavour written for a 33-season pool. This one
            counts, because a league on its first weekend has to read honestly
            too — and the two numbers ARE the book's scope: how many seasons it
            drew from, and how many films have actually been scored. */}
        <p className="type-dek text-ui text-muted-foreground">
          {book === null
            ? "Nothing to record yet."
            : `${numberWord(book.seasonsCounted)} season${book.seasonsCounted === 1 ? "" : "s"}, ${numberWord(book.aggregates.filmsScored)} film${book.aggregates.filmsScored === 1 ? "" : "s"} scored.`}
        </p>
      </div>

      {book === null || book.records.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No records yet</EmptyTitle>
            <EmptyDescription>
              Records appear as soon as a week is scored — the book is built
              from the films this league has actually played, so it fills in on
              its own.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <section className="flex flex-col gap-3">
          <h2>All-time records</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {book.records.map((r) => (
              <RecordCard
                key={r.label}
                label={r.label}
                entry={r.entry}
                marquee={r.marquee}
                leagueId={league.id}
              />
            ))}
          </div>
        </section>
      )}

      {book !== null && book.career.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2>Careers</h2>
          <CareerTable career={book.career} />
        </section>
      )}
    </main>
  );
}
