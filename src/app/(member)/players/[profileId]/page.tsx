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
import { getPlayerProfilePage } from "@/lib/player-profile";

import { CareerStats } from "./_components/career-stats";
import { IdentityCard } from "./_components/identity-card";
import { SeasonsTable } from "./_components/seasons-table";

export const metadata = { title: "Player" };

/**
 * `/players/[profileId]` — board 2.4.
 *
 * ── BUILT SECOND IN THE RE-ORDER, AND FOR THE SAME REASON AS `/account` ───
 * Three built screens linked here and all three 404'd: every name in a league
 * roster, every row of a season leaderboard, and the account menu.
 *
 * ── THE GATE IS THE RPC, NOT THIS PAGE ────────────────────────────────────
 * `get_player_profile` is `SECURITY DEFINER` and returns a row only for a
 * player the viewer shares a league with. It deliberately gives the same
 * answer — nothing — for a player who does not exist and for one the viewer
 * cannot see, so `notFound()` here leaks neither. A pool is a private group;
 * a page that confirmed an account existed would leak the roster.
 */
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const { supabase } = await requireUser();
  const page = await getPlayerProfilePage(supabase, profileId);
  if (!page) notFound();

  const { profile, seasons, spansLeagues } = page;

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-measure-page flex-col gap-6 p-6 md:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{profile.displayName}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <IdentityCard profile={profile} />
      <CareerStats profile={profile} />

      <section className="flex flex-col gap-3">
        <h2>Season by season</h2>
        {seasons.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No seasons together yet</EmptyTitle>
              <EmptyDescription>
                {profile.isMe
                  ? "Your seasons appear here once you have played one."
                  : `Seasons appear here once you and ${profile.displayName} have played one in the same league.`}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <SeasonsTable seasons={seasons} spansLeagues={spansLeagues} />
        )}
      </section>
    </main>
  );
}
