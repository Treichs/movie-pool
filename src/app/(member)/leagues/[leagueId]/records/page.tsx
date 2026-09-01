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
import { numberWord, sentenceCase } from "@/lib/format";
import { getLeagueRecordsPage } from "@/lib/league";

import { RecordCard } from "@/components/record-card";

import { CareerTable } from "./_components/career-table";

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
  // Null rather than zero when there is no book at all — an empty league has
  // no records to hold none of.
  const total = book?.records.length ?? 0;
  const mine =
    book === null || total === 0
      ? null
      : book.records.filter((r) => r.entry.isMe).length;

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-measure-page flex-col gap-6 p-6 md:p-8">
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
            : `${sentenceCase(numberWord(book.seasonsCounted))} season${book.seasonsCounted === 1 ? "" : "s"}, ${numberWord(book.aggregates.filmsScored)} film${book.aggregates.filmsScored === 1 ? "" : "s"} scored.`}
          {/* YOUR OWN STAKE IN IT. A record book is a page about other people
              until it says which of them are yours, and the count is the
              cheapest way to say it — a third hero block, after the season
              leaderboard's and League Home's, would be a template rather than
              a design. Said honestly at zero: "none of them yet" is a standing
              a league can improve on, and it is the true one for most members
              of most leagues. */}
          {mine !== null && (
            <>
              {" "}
              You hold{" "}
              <span className="text-foreground">
                {mine === 0
                  ? "none of them yet"
                  : `${numberWord(mine)} of ${numberWord(total)}`}
              </span>
              .
            </>
          )}
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
