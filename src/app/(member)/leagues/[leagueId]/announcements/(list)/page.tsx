import { notFound } from "next/navigation";
import Link from "next/link";
import { PenLineIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { getLeagueAnnouncementsPage } from "@/lib/league";

import { AnnouncementRow } from "./_components/announcement-row";

export const metadata = { title: "Announcements" };

/**
 * `/leagues/[leagueId]/announcements` — board 4.5.
 *
 * ── IT KEPT ITS OWN ROUTE, AND ALL THREE OF THEM ────────────────────────
 * IA map §5.4: announcements is a small CRUD surface, and an individual post
 * is a thing you send someone a link to. That is why it is three addresses
 * rather than a tab on League Home.
 *
 * ── "WRITE ONE" IS ABSENT FOR A PLAYER, NOT DISABLED ────────────────────
 * A disabled control advertises a permission the reader does not have and
 * cannot get, on a page they have every right to read. The composer answers
 * one boolean and this page renders the button or does not.
 */
export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase, user } = await requireUser();
  const page = await getLeagueAnnouncementsPage({ supabase, user }, leagueId);
  if (!page) notFound();

  const { league, isCommissioner, announcements } = page;
  const count = announcements.length;

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
            <BreadcrumbPage>Announcements</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1>Announcements</h1>
          {/* THE BOARD'S DEK SAYS "everyone gets an email". NOTHING EMAILS AN
              ANNOUNCEMENT. `post_league_announcement` writes a row and an audit
              entry and stops; the notify cron's kinds are bids_revealed and
              results_up, and there is no template for a third. Shipped with the
              board's wording on
              2026-08-29 and corrected the next day — a commissioner deciding
              whether to post would have been told their message goes to
              everyone's inbox, and it does not. */}
          <p className="type-dek text-ui text-muted-foreground">
            {count === 0
              ? "Commissioners write them; everyone in the league reads them here."
              : `${sentenceCase(numberWord(count))} post${count === 1 ? "" : "s"}. Commissioners write them; everyone in the league reads them here.`}
          </p>
        </div>

        {isCommissioner && (
          <Button
            variant="ink"
            // `nativeButton={false}` because this renders an `<a>`: Base UI
            // warns when a component acting as a button is not a native
            // <button>, and the repo sets it on every button-shaped link.
            nativeButton={false}
            render={<Link href={`/leagues/${league.id}/announcements/new`} />}
          >
            <PenLineIcon data-icon="inline-start" />
            Write one
          </Button>
        )}
      </div>

      {count === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nothing posted yet</EmptyTitle>
            <EmptyDescription>
              {isCommissioner
                ? "Announcements are how you tell the league something the game cannot — a slate going up early, a change to the dues. They appear here, and nowhere else: nothing is emailed."
                : "When a commissioner posts something, it appears here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // The board holds the list to 800px. Prose does not want the full
        // 1152, and these posts are read rather than scanned.
        <div className="flex max-w-measure-wide flex-col gap-3">
          {announcements.map((a) => (
            <AnnouncementRow
              key={a.id}
              announcement={a}
              leagueId={league.id}
            />
          ))}
        </div>
      )}
    </main>
  );
}
