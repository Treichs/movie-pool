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

import {
  Dashboard,
  DashboardGrid,
  DashboardPanel,
} from "@/components/dashboard";
import { TextLink } from "@/components/text-link";

import { AnnouncementsPanel } from "./_components/announcements-panel";
import { CareerPositionBlock } from "./_components/career-position";
import { MemberRoster } from "./_components/member-roster";
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
 * ── THE SPINE, IN ORDER (settled 2026-09-17) ──────────────────────────────
 * Outside the frame, what is true now: the live thread, then the league's
 * news. Inside it, three rows that never change shape: where you stand
 * all-time, the people (the ranked roster beside the archive of seasons they
 * played), and the record — the marquee records over the league's averages.
 *
 * The 2026-09-01 layout put the record shelf second, on the argument that
 * bragging rights lead. That argument still holds and the order still honours
 * it: the roster IS a ranked career table with a titles column, so "the
 * people" is bragging rights too, and it is the direct continuation of the
 * career band — the rival that band names is in the list. What that layout
 * cost was the spine itself: STANDING and RECORD interleaved on screen
 * (you → records → members → averages → news → archive) and three of its
 * panels were holes — a full-width shelf of four bordered cards, a rail of
 * four averages beside a roster twice its height, and an archive stretched to
 * twelve columns whenever a league had no announcements.
 *
 * Both record bands are DERIVED FROM READS THIS PAGE ALREADY MADE. The record
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

      <AnnouncementsPanel
        announcements={home.announcements}
        leagueId={leagueId}
      />

      {/* ── THE SAME DASHBOARD SEASON HOME USES ──────────────────────────
          Same frame, same twelve columns, same paging. Only the subject
          changes: careers and the archive instead of a season's standings.
          That is the whole reason the shell is in `src/components` rather
          than in either route — two pages drawing the same object differently
          is the drift `BidCta` was lifted out of both pages to stop.

          EVERY ROW HAS ONE SHAPE. Announcements left the frame because they
          were its only conditional panel; the record book is gated as a whole
          rather than spanned around. Nothing in here changes width on data. */}
      <Dashboard
        eyebrow="The league record"
        meta={`${memberCount} member${memberCount === 1 ? "" : "s"} · ${seasonCount} season${seasonCount === 1 ? "" : "s"}`}
        className="mt-4"
      >
        <DashboardGrid>
          {/* THE COMMAND BAND — the league's twin of Season Home's. Same
              placement, same full width, same hidden heading, same tracks, so
              the two pages open the same way. It is conditional because a
              member with no completed season has no career position to state,
              and inventing a rank for them would be the same lie the season
              page refuses to tell before anything has scored. */}
          {home.story.position && (
            <DashboardPanel
              id="your-career"
              title="Your career"
              hideTitle
              span="md:col-span-6 xl:col-span-12"
            >
              <CareerPositionBlock
                position={home.story.position}
                nearest={home.story.nearest}
              />
            </DashboardPanel>
          )}

          {/* THE PEOPLE. Seven columns of ranked roster beside five of the
              seasons they played — two fixed-height lists, so the row holds
              still whatever the league's size. The archive is three short
              columns; at twelve wide it was a name at one edge and a date at
              the other with 700px of nothing between. */}
          <DashboardPanel
            id="members"
            title="Members"
            aside="Seasons · titles · career points"
            span="md:col-span-6 xl:col-span-7"
          >
            <MemberRoster members={home.career} leagueId={leagueId} />
          </DashboardPanel>

          <DashboardPanel
            id="past-seasons"
            title="Past seasons"
            aside="Completed and archived"
            span="md:col-span-6 xl:col-span-5"
          >
            <SeasonsTable
              seasons={home.seasons}
              liveSeasonId={home.current.season?.id ?? null}
            />
          </DashboardPanel>

          {/* THE RECORD. Gated on a marquee record existing, because the
              shelf returns null without one and a titled panel over nothing
              is the defect the announcements panel already taught this page.
              The averages ride inside it as a strip. */}
          {home.records.some((r) => r.marquee) && (
            <DashboardPanel
              id="record-shelf"
              title="The record book"
              aside={
                <TextLink href={`/leagues/${leagueId}/records`} size="micro">
                  Every record and every career
                </TextLink>
              }
              span="md:col-span-6 xl:col-span-12"
            >
              <RecordShelf
                records={home.records}
                aggregates={home.aggregates}
                leagueId={leagueId}
              />
            </DashboardPanel>
          )}
        </DashboardGrid>
      </Dashboard>
    </main>
  );
}
