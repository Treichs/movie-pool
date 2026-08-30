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
import { getLeagueAnnouncementsPage } from "@/lib/league";

import { AnnouncementForm } from "../_components/announcement-form";

export const metadata = { title: "Write an announcement" };

/**
 * `/leagues/[leagueId]/announcements/new` — board 4.6.
 *
 * ── A PLAYER IS REDIRECTED, NOT 404'd ───────────────────────────────────
 * The league and its announcements are theirs to read; only writing is not.
 * Sending them to the list is the true answer — the thing they came for is one
 * segment up. `post_league_announcement` refuses them regardless, so this is
 * courtesy rather than the gate.
 *
 * ── THE DEK DOES NOT PROMISE AN EMAIL ───────────────────────────────────
 * The board's says "Every member gets this by email as well as on the board".
 * Nothing emails an announcement, so it says where a post actually goes.
 */
export default async function NewAnnouncementPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase, user } = await requireUser();

  const [page, profile] = await Promise.all([
    getLeagueAnnouncementsPage({ supabase, user }, leagueId),
    getProfile(supabase, user.id),
  ]);
  if (!page) notFound();
  if (!page.isCommissioner) {
    redirect(`/leagues/${leagueId}/announcements`);
  }

  const { league } = page;
  const listHref = `/leagues/${league.id}/announcements`;

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
            <BreadcrumbLink render={<Link href={listHref} />}>
              Announcements
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <h1>Write an announcement</h1>
        <p className="type-dek text-ui text-muted-foreground">
          It appears on the league&rsquo;s announcements page for every member.
        </p>
      </div>

      <AnnouncementForm
        leagueId={league.id}
        authorName={profile?.display_name ?? "you"}
      />
    </main>
  );
}
