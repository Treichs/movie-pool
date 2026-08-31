import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { TextLink } from "@/components/text-link";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth";
import { formatDateFull } from "@/lib/format";
import { getLeagueAnnouncementPage } from "@/lib/league";

import { AnnouncementBody } from "./_components/announcement-body";
import { DeleteAnnouncement } from "./_components/delete-announcement";

export const metadata = { title: "Announcement" };

/**
 * `/leagues/[leagueId]/announcements/[announcementId]` — board 4.7.
 *
 * ── A READING SURFACE, SO IT IS SET ON A MEASURE ────────────────────────
 * The board holds the whole column to 680px rather than the page's 1152. This
 * is the only screen in the app whose job is to be read start to finish.
 *
 * ── TWO THINGS THE BOARD DRAWS THAT DO NOT EXIST ────────────────────────
 * **"emailed to nine members"** — nothing emails an announcement.
 * `post_league_announcement` writes a row and an audit entry and stops, and
 * the notify cron's four kinds do not include one. Printing a delivery count
 * would be inventing a fact about people's inboxes.
 *
 * **Edit** was one of them until 2026-08-30. It is now real:
 * `update_league_announcement` was added and `…/[announcementId]/edit` is the
 * 26th route. Both controls are commissioner-only, and it is ANY commissioner
 * — the RPCs gate on `is_league_commissioner`, not on authorship, because
 * ADR-060 says a league's commissioners are equals.
 *
 * ── THE TIME OF DAY IS NOT SHOWN, AND THAT IS A DELIBERATE LOSS ─────────
 * The board reads "Tuesday 18 Nov, 9:14 AM". Rendering a wall-clock time on
 * the server means choosing a timezone, and this row has none to choose from —
 * an announcement is not season-scoped, so there is no `bids_due_tz` to borrow.
 * The alternative is a client component that reformats on mount, which is what
 * `format.ts`'s header calls `DeadlineText` and which this rebuild has not
 * ported. The date is the part anyone needs; the minute is not worth a
 * hydration seam.
 */
export default async function AnnouncementPage({
  params,
}: {
  params: Promise<{ leagueId: string; announcementId: string }>;
}) {
  const { leagueId, announcementId } = await params;
  const { supabase, user } = await requireUser();
  const page = await getLeagueAnnouncementPage(
    { supabase, user },
    leagueId,
    announcementId
  );
  if (!page) notFound();

  const { league, announcement, isCommissioner, authorIsCommissioner } = page;
  const author = announcement.authorName ?? "A commissioner";
  const listHref = `/leagues/${league.id}/announcements`;

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
            <BreadcrumbLink render={<Link href={listHref} />}>
              Announcements
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{announcement.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <article className="flex max-w-measure-wide flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1>{announcement.title}</h1>
          <div className="flex items-center gap-2.5">
            <PlayerAvatar
              id={announcement.authorId}
              name={author}
              className="size-7.5"
            />
            <div className="flex flex-col">
              <span className="type-ui text-ui font-semibold">{author}</span>
              <span className="type-body text-micro text-muted-foreground">
                {/* The role is the author's TODAY. Only a commissioner can
                    post, so it holds on the day; it stops holding when the role
                    is handed on, and the label goes rather than asserting
                    something that has stopped being true. */}
                {authorIsCommissioner && "Commissioner · "}
                {formatDateFull(announcement.at.slice(0, 10))}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {announcement.body ? (
          <AnnouncementBody body={announcement.body} />
        ) : (
          // ADR-084: a short single line becomes the TITLE and the body is
          // nulled, so there is genuinely nothing more to show — not a post
          // that failed to save its text.
          <p className="type-body max-w-measure-default text-ui text-muted-foreground">
            The title said everything there was to say.
          </p>
        )}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <TextLink href={listHref} size="ui" className="flex items-center gap-1.5">
            <ArrowLeftIcon className="size-3.5" aria-hidden />
            All announcements
          </TextLink>

          {isCommissioner && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    href={`/leagues/${league.id}/announcements/${announcement.id}/edit`}
                  />
                }
              >
                Edit
              </Button>
              <DeleteAnnouncement
                leagueId={league.id}
                announcementId={announcement.id}
                title={announcement.title}
              />
            </div>
          )}
        </div>
      </article>
    </main>
  );
}
