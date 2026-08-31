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
import { requireSeasonMember } from "@/lib/auth";
import { getSeasonHome } from "@/lib/season-home";

import { LeaderboardTab } from "./_components/leaderboard-tab";
import { QueueStrip } from "./_components/queue-strip";
import { SeasonPicker } from "./_components/season-picker";
import { SeasonTabs } from "./_components/season-tabs";
import { StandingStrip } from "./_components/standing-strip";
import { WeeksTab } from "./_components/weeks-tab";
import { YouTab } from "./_components/you-tab";

export const metadata = { title: "Season" };

/**
 * `/seasons/[seasonId]` — SEASON HOME, board 3.1 and its two sticky notes.
 *
 * The largest read screen in the app, and the destination `chooseLandingPath`
 * prefers above every other: a member with a live season lands here, not on
 * their league.
 *
 * ── THE TWO STICKY NOTES ──────────────────────────────────────────────────
 * 1. The season picker is a HEADER CONTROL, not a quarter-width left rail.
 * 2. The commissioner Queue is a STRIP on this page, not a route — the whole
 *    of what the retired commissioner tree becomes.
 *
 * ── `?tab=` IS HONOURED; SWITCHING WRITES NOTHING BACK ────────────────────
 * The Monday-scores email links `?tab=leaderboard` (`api/cron/notify`), so
 * arriving at an address that names a tab must land on it. Switching afterwards
 * is a view change, not a navigation, and pushing history for it would turn
 * Back into a tab cycler.
 *
 * ── THE GATE IS `requireSeasonMember`, AND IT CARRIES THE ROLE ────────────
 * One `maybeSingle()` on `season_members` answers membership and role together;
 * RLS refuses the row to a non-member, so a stranger gets `notFound()`. The role
 * then decides whether the queue is READ at all — hiding it in the component
 * would still have shipped the rows to the browser.
 */
export default async function SeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ seasonId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { seasonId } = await params;
  const { tab } = await searchParams;
  const ctx = await requireSeasonMember(seasonId);
  const home = await getSeasonHome(ctx);

  const openWeek = home.hub.openWeek;

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-measure-page flex-col gap-6 p-6 md:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          {home.league && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<Link href={`/leagues/${home.league.id}`} />}
                >
                  {home.league.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{home.season.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* STICKY NOTE 1: the picker is the header control, and it is the H1's
            neighbour rather than a rail beside the page. */}
        <div className="flex flex-wrap items-center gap-3">
          <h1>{home.season.name}</h1>
          <SeasonPicker current={home.season.id} options={home.seasonOptions} />
        </div>
        {openWeek && (
          <Badge variant="secondary">
            Week {String(openWeek.number).padStart(2, "0")} of{" "}
            {home.hub.weeks.length}
          </Badge>
        )}
      </div>

      <StandingStrip
        me={home.hub.me}
        bankrollLeft={home.hub.remaining}
        openWeek={openWeek}
        seasonId={seasonId}
      />

      {/* STICKY NOTE 2. Only fetched for a commissioner, so a player's browser
          never receives it. */}
      {home.isCommissioner && (
        <QueueStrip seasonId={seasonId} weeks={home.overdue} />
      )}

      <SeasonTabs
        initial={tab ?? "weeks"}
        weeks={
          <WeeksTab
            seasonId={seasonId}
            weeks={home.hub.weeks}
            myFilms={home.hub.myFilms}
            unbidWeekIds={home.hub.unbidWeekIds}
          />
        }
        leaderboard={<LeaderboardTab data={home.leaderboard} />}
        you={<YouTab films={home.hub.myFilms} deltas={home.hub.myDeltas} />}
      />
    </main>
  );
}
