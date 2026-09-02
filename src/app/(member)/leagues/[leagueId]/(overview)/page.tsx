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
import { CareerPositionBlock } from "./_components/career-position";
import { MemberRoster } from "./_components/member-roster";
import { RecordBookPanel } from "./_components/record-book-panel";
import { RecordShelf } from "./_components/record-shelf";
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
 * ── IT IS ALWAYS REACHABLE, AND THAT IS A DECISION (ADR-443, amended) ────
 * ADR-443 first made this page redirect to the live season, so that opening a
 * league WAS opening its season. That shipped and was reverted the same day,
 * on evidence rather than taste: every breadcrumb's middle rung points here —
 * from /records, /announcements, /films, /dues, /settings and the season page
 * itself — so on the season page that rung bounced the reader back to the page
 * they were already on. The member roster and "Invite someone" live only here
 * too, and went with it.
 *
 * The outcome ADR-443 wanted survives without the redirect: the command centre's
 * league cards and the nav band's Season item link STRAIGHT to `/seasons/[live]`,
 * so every entry point that matters still lands on the game. This page is what
 * you get when you ask for the league itself — the roster, the archive, the
 * careers and, between seasons, the commissioner's "Start a season".
 *
 * The cost, accepted: pasting a bare `/leagues/[id]` lands here, not on the
 * season.
 *
 * ── THE H1 IS A TITLE, NOT A SWITCHER ─────────────────────────────────────
 * Board 4.2 puts a caret in the heading and makes it a league switcher. The app
 * shell already carries one in the paper band a few inches above. One switcher
 * per screen; the H1 goes back to naming the thing you are looking at.
 *
 * ── THE COMMAND CENTRE, IN THREE REGISTERS ────────────────────────────────
 * The STANDING/RECORD split above is still the spine; what changed on
 * 2026-09-01 is that RECORD stopped being a rail of averages. The page now
 * reads: what is live (the thread), where you stand all-time (the career
 * block), what this league is famous for (the marquee records), and only then
 * the archive. Bragging rights lead, because a league page nobody enjoys
 * opening is a directory.
 *
 * Both new bands are DERIVED FROM READS THIS PAGE ALREADY MADE. The record
 * book was being built here for its career table alone, and its marquee
 * records — flagged, by their own type, as the ones that "lead League Home" —
 * were thrown away every render.
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
    /* THREE INTERVALS, ASCENDING WITH STRUCTURE. A heading sits 12px from what
       it heads, a section 32px from its neighbour inside a column, and a band
       40px from the next band. Every one of those was 24px, which left a
       heading only twice as close to its own content as to the section above —
       too weak a ratio to read as ownership, and no interval left over to mark
       where "what is true now" ends and the record begins. The breadcrumb joins
       the title it names instead of floating a band's distance from it. */
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-measure-page flex-col gap-10 p-6 md:p-8">
      <div className="flex flex-col gap-4">
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
      </div>

      <SeasonThread
        leagueId={leagueId}
        seasonId={home.current.season?.id ?? null}
        seasonName={home.current.season?.name ?? null}
        bidTarget={home.bidTarget}
        playerCount={home.current.players.length}
        isCommissioner={home.isCommissioner}
        lastChampion={champion?.name ?? null}
        finishedSeasons={
          home.seasons.filter(
            (s) => s.status === "completed" || s.status === "archived"
          ).length
        }
      />

      {home.story.position && (
        <CareerPositionBlock
          position={home.story.position}
          nearest={home.story.nearest}
        />
      )}

      <RecordShelf records={home.records} leagueId={leagueId} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-8">
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
            {/* WRAPS RATHER THAN CRUSHES. At phone width the caption broke into
                two lines jammed against the heading; given its own line it
                still names the three columns it labels. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
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
