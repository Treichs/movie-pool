import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getProfile, requireUser } from "@/lib/auth";
import { getLeagueAnnouncementPage } from "@/lib/league";

import { AnnouncementForm } from "../../_components/announcement-form";

export const metadata = { title: "Edit announcement" };

/**
 * `/leagues/[leagueId]/announcements/[announcementId]/edit` — THE 26th ROUTE.
 *
 * ── IT IS A VERB LEAF, WHICH IS THE ONLY SHAPE §7.5 ALLOWS ──────────────
 * The IA map's rules put the carrier in the path rather than a query string,
 * stop nesting at two levels below a collection, and require every truncation
 * to land on a real page. `…/[announcementId]/edit` satisfies all three — chop
 * `/edit` and you get the post, chop the post and you get the list — and it is
 * the same shape `/bid` and `/new` already take. `?edit=1` on the post would
 * have been a mode hidden in a query string, which is exactly what ADR-408's
 * `?league=` was moved out of.
 *
 * **This takes the route count to 26.** The map says 25, and it says no
 * further IA change without a redirect; nothing is public yet, so there is
 * nothing to redirect, but the count is now wrong in two documents and is
 * corrected in the plan.
 *
 * ── EDITING IS ANY COMMISSIONER, NOT THE AUTHOR ─────────────────────────
 * `update_league_announcement` gates on `is_league_commissioner`, matching
 * delete, because ADR-060 says a league's commissioners are equals. A page
 * that allowed less than the RPC does would be a second, quieter rule.
 */
export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ leagueId: string; announcementId: string }>;
}) {
  const { leagueId, announcementId } = await params;
  const { supabase, user } = await requireUser();

  const [page, profile] = await Promise.all([
    getLeagueAnnouncementPage({ supabase, user }, leagueId, announcementId),
    getProfile(supabase, user.id),
  ]);
  if (!page) notFound();

  const { league, announcement, isCommissioner } = page;
  const postHref = `/leagues/${league.id}/announcements/${announcement.id}`;
  // A player may read it; only a commissioner may change it. Send them to the
  // thing they can have rather than refusing the whole address.
  if (!isCommissioner) redirect(postHref);

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
            <BreadcrumbLink render={<Link href={postHref} />}>
              {announcement.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <h1>Edit announcement</h1>
        {/* The post keeps its place in the list and its date — the edit is not
            a repost. Saying so is what stops a commissioner deleting and
            rewriting to fix a typo, which is what they had to do before. */}
        <p className="type-dek text-ui text-muted-foreground">
          It keeps its place in the list and the date it was posted.
        </p>
      </div>

      <AnnouncementForm
        leagueId={league.id}
        authorName={profile?.display_name ?? "you"}
        announcement={{
          id: announcement.id,
          title: announcement.title,
          body: announcement.body,
        }}
      />
    </main>
  );
}
