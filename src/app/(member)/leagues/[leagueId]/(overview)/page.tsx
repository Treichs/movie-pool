import { notFound } from "next/navigation";
import Link from "next/link";
import { SettingsIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatMonthYear } from "@/lib/format";
import { getLeagueHome } from "@/lib/league";

import { AnnouncementsPanel } from "./_components/announcements-panel";
import { MemberRoster } from "./_components/member-roster";
import { RecordBookPanel } from "./_components/record-book-panel";
import { SeasonThread } from "./_components/season-thread";
import { SeasonsTable } from "./_components/seasons-table";

export const metadata = { title: "League" };

/**
 * `/leagues/[leagueId]` — LEAGUE HOME, board 4.2.
 *
 * ── WHAT THE PAGE IS FOR ──────────────────────────────────────────────────
 * Everything on it belongs to one of two registers, and the board interleaved
 * them. STANDING is what is true now — the running season, its open week, the
 * roster. RECORD is what already happened — finished seasons, careers, the
 * record book. Separating them is the design, settled with the developer on
 * 2026-08-29 from the League Home prototype.
 *
 * So the live season leads in a band of its own and the archive below holds
 * still. `chooseLandingPath` sends a member here when their league has no live
 * season, which means this page's busiest moment is the one where least is
 * happening — and it is also two clicks from every live season all season long.
 * One band answers both arrivals.
 *
 * ── THE H1 IS A TITLE, NOT A SWITCHER ─────────────────────────────────────
 * Board 4.2 puts a caret in the heading and makes it a league switcher. The app
 * shell already carries one in the paper band a few inches above. One switcher
 * per screen; the H1 goes back to naming the thing you are looking at.
 *
 * ── DUES IS NOT HERE, AND CANNOT BE ───────────────────────────────────────
 * The board draws a dues panel and the plan carries a screen for it (Task 21),
 * but there is **no dues table, no payments table and no composer** — checked
 * across all 116 migrations. It is an unmodelled domain, not an unwritten read.
 * A balance cannot be shown until somebody designs one. Raised, not stubbed.
 *
 * ── THE GATE ──────────────────────────────────────────────────────────────
 * `requireUser` before the read, and the read itself is the authorization:
 * `leagues` gates SELECT on `is_league_member`, so a league the viewer does not
 * belong to comes back null and this 404s — the same answer a league that does
 * not exist gives, which is the right one to hand a stranger holding an id.
 */
export default async function LeaguePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const { supabase, user } = await requireUser();
  const home = await getLeagueHome({ supabase, user }, leagueId);
  if (!home) notFound();

  const seasonCount = home.seasons.length;
  const memberCount = home.career.length;
  // NAMED ONLY WHEN THERE IS ONE NAME TO GIVE. Sorting by titles and taking
  // the head picks an arbitrary winner out of a tie — `dev-player` and
  // `dev-grace` both hold one in the seeded league, and the first draft of this
  // page announced whichever the sort happened to land on. Ties are honoured
  // everywhere else in this game; they are honoured here by saying nothing.
  const mostTitles = Math.max(0, ...home.career.map((c) => c.titles));
  const titleHolders = home.career.filter(
    (c) => c.titles === mostTitles && mostTitles > 0
  );
  const champion = titleHolders.length === 1 ? titleHolders[0] : null;

  const meta = [
    `${memberCount} member${memberCount === 1 ? "" : "s"}`,
    `${seasonCount} season${seasonCount === 1 ? "" : "s"}`,
    home.runningSince ? `since ${formatMonthYear(home.runningSince.slice(0, 10))}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto flex max-w-measure-page flex-col gap-6 px-8 py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{home.league.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1>{home.league.name}</h1>
          <p className="text-muted-foreground">{meta}</p>
        </div>
        {/* NO "START A SEASON" HERE, though the board puts one in the head. The
            thread below offers it in exactly the states where it is possible,
            and two identical primary buttons in one viewport is the duplication
            this layout exists to remove. The head keeps what the thread never
            carries. */}
        <div className="flex shrink-0 items-center gap-2">
          {home.isCommissioner && <Badge variant="ink">You commission</Badge>}
          {home.isCommissioner && (
            <Button
              render={<Link href={`/leagues/${leagueId}/settings`} />}
              nativeButton={false}
              variant="outline"
            >
              <SettingsIcon />
              League settings
            </Button>
          )}
        </div>
      </div>

      <SeasonThread
        leagueId={leagueId}
        seasonId={home.current.season?.id ?? null}
        seasonName={home.current.season?.name ?? null}
        openWeek={home.openWeek}
        playerCount={home.current.players.length}
        isCommissioner={home.isCommissioner}
        lastChampion={champion?.name ?? null}
        finishedSeasons={
          home.seasons.filter(
            (s) => s.status === "completed" || s.status === "archived"
          ).length
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            {/* "Past seasons", because that is all this table ever holds —
                `SeasonsTable` filters to completed and archived. Headed
                "Seasons" it sat directly under the running season's own card
                and then said "No finished seasons yet", which reads as the
                page contradicting itself rather than as two different things. */}
            <h2>Past seasons</h2>
            <SeasonsTable
              seasons={home.seasons}
              liveSeasonId={home.current.season?.id ?? null}
            />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2>Members</h2>
              <span className="type-micro text-micro text-muted-foreground">
                Seasons · titles · career points
              </span>
            </div>
            <MemberRoster members={home.career} leagueId={leagueId} />
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <RecordBookPanel aggregates={home.aggregates} leagueId={leagueId} />
          <AnnouncementsPanel
            announcements={home.announcements}
            leagueId={leagueId}
          />
        </div>
      </div>
    </main>
  );
}
