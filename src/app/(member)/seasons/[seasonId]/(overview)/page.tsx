import Link from "next/link";
import { redirect } from "next/navigation";

import { BidCta } from "@/components/bid-cta";
import { Badge } from "@/components/ui/badge";
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
import { requireSeasonMember } from "@/lib/auth";
import { getSeasonHome } from "@/lib/season-home";

import { Bento, BentoCell } from "./_components/bento";
import { HeadToHead } from "./_components/head-to-head";
import { QueueStrip } from "./_components/queue-strip";
import { SeasonHero } from "./_components/season-hero";
import { SeasonPicker } from "./_components/season-picker";
import { SeasonPicks } from "./_components/season-picks";
import { StandingsTable } from "./_components/standings-table";
import { WeekStory } from "./_components/week-story";
import { WeeksTable } from "./_components/weeks-table";
import { YourFilms } from "./_components/your-films";

export const metadata = { title: "Season" };

/**
 * Where a retired `?tab=` value now lands.
 *
 * The Monday-scores mail has been linking `?tab=leaderboard` since the tabs
 * existed (`api/cron/notify`), and mail already sent cannot be edited. Each old
 * value names a region that still exists on the page, so the address is
 * redirected to that region's anchor rather than dropped: an old link lands on
 * the standings, which is what it always promised.
 */
const RETIRED_TABS: Record<string, string> = {
  weeks: "weeks",
  leaderboard: "standings",
  you: "your-films",
};

/**
 * `/seasons/[seasonId]` — SEASON HOME, and THE LEAGUE'S FRONT DOOR since
 * ADR-443: `/leagues/[leagueId]` forwards here whenever the league has an
 * active or a draft season, so for most of the year this is what "open my
 * league" means.
 *
 * ── THE TABS ARE GONE, AND THE PAGE IS ONE SURFACE ────────────────────────
 * Weeks, Leaderboard and You each hid two thirds of this screen behind a click,
 * and between them they printed the viewer's season three times: the strip
 * above the tabs carried the bankroll and the deadline, the Leaderboard opened
 * with a position block saying the rank again, and the You tab's three deltas
 * said the movement a third time. What replaced them is one hero and a bento
 * grid — the hero answers where you stand and what is due, the grid holds every
 * table and chart at once, and nothing on the page is behind a control.
 *
 * The consolidation, block by block:
 *   • `StandingStrip` + `PositionBlock`  -> `SeasonHero` (one reading)
 *   • `WeeksTab`                         -> `WeeksTable` (a ledger, per week,
 *                                           scoped to the viewer, expandable)
 *   • `YouTab`'s deltas                  -> the hero's third register
 *   • `YouTab`'s film list               -> `YourFilms` (ranked by score)
 *   • `TopFilms` + season awards         -> `SeasonPicks` (one subject)
 *   • `LeaderboardTab`                   -> dissolved into the grid
 *
 * ── THE GRID IS UNEQUAL ON PURPOSE, AND PACKED BY LENGTH ──────────────────
 * Twelve columns at `xl`, two at `md`, one below:
 *
 *     WEEK NN IN BRIEF .............................. 12
 *     FILMS YOU OWN ........ 7 │ THE SEASON'S PICKS .. 5
 *     STANDINGS ............ 7 │ HEAD TO HEAD ........ 5
 *     WEEKS ......................................... 12
 *
 * THE ORDER OF THE CELLS BELOW *IS* THE LAYOUT — grid auto-placement fills
 * those slots from this DOM order, so moving one moves the shape. Cells are
 * PAIRED WITH WHAT GROWS AT THEIR OWN RATE, which is what stops the page
 * opening a hole: films-you-own and the picks list both lengthen as a season
 * runs on, and the standings and head-to-head both take one row per player.
 * `bento.tsx` carries the rule; these spans are its application.
 *
 * THE PAIRING WAS RE-CUT ON 2026-09-02, against the first fixture big enough
 * to test it — ten players, ten seasons, ten weeks. Three things moved:
 *
 *   · THE RANK CHART IS GONE. It was the second pair's slack-absorber, and it
 *     earned that because a chart with more room reads better rather than
 *     emptier. Ten lines crossing in a 444px cell is not a rank walk, and no
 *     amount of height fixes it. Head-to-head takes its slot, which pairs the
 *     two tables about the field with each other.
 *   · THE WEEKS LEDGER MOVED TO LAST. It opened the grid and pushed the
 *     standings under the fold at ten weeks — a page that opens with an
 *     archive. It is the cell nobody arrives to read.
 *   · THE BRIEFS TOOK THE FULL WIDTH. They were seven columns propping up a
 *     row-spanned picks cell, tuned to within 16px against a five-player
 *     league; at ten players and nine films owned that stack came out 1009px
 *     against 719 and tore a 290px hole. The briefs are four whatever happens,
 *     so they stopped being a prop.
 *
 * ── NO NOT-STARTED STATE IS OWED, AND THAT WAS CHECKED RATHER THAN ASSUMED ─
 * ADR-443 accepted the cost of one — a draft season would forward a whole
 * league to a page with no weeks. It cannot happen: `create_season` inserts at
 * `active` (migration 20260804080000, "a season is ACTIVE the moment it is
 * created"), enrols every league member into `season_members` in the same
 * statement, and always calls `seed_season_weeks`. So a season arrives with a
 * roster and a schedule, `draft` survives only as an enum value and a rescue
 * transition for rows predating that migration, and the dev database holds
 * none. Anyone arriving here has a member row and at least one week.
 *
 * ── THE TWO STICKY NOTES BOTH SURVIVE ─────────────────────────────────────
 * 1. The season picker is a HEADER CONTROL, not a quarter-width left rail.
 * 2. The commissioner Queue is a STRIP on this page, not a route — the whole
 *    of what the retired commissioner tree becomes. It sits between the hero
 *    and the grid, because it is the only block that is not the same for
 *    everybody and it must not be found by scrolling.
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

  const anchor = tab ? RETIRED_TABS[tab] : undefined;
  if (anchor) redirect(`/seasons/${seasonId}#${anchor}`);

  const ctx = await requireSeasonMember(seasonId);
  const home = await getSeasonHome(ctx);

  const { hub, leaderboard, story, ladder } = home;
  const openWeek = hub.openWeek;
  const paysMoney =
    ladder !== null &&
    (ladder.first > 0 || ladder.second > 0 || ladder.third > 0);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex max-w-measure-page flex-col gap-6 p-6 md:p-8"
    >
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
            {hub.weeks.length}
          </Badge>
        )}
      </div>

      <SeasonHero
        position={story.position}
        bankrollLeft={hub.remaining}
        filmsOwned={hub.me?.filmsOwned ?? null}
        efficiency={hub.me?.efficiency ?? null}
      />

      {/* THE SAME OBJECT LEAGUE HOME DRAWS, and until 2026-09-02 this page drew
          its own — a countdown and a button in the hero's fourth column, with
          different wording, no bid state, and a destination that could disagree
          with League Home's. It points at the earliest open week the viewer has
          NOT bid in, which is why it is `hub.bidTarget` and not `openWeek`.
          No subject: the H1 four inches up already names the season. */}
      {hub.bidTarget && (
        <BidCta
          weekNumber={hub.bidTarget.week.number}
          subject={null}
          deadline={
            hub.bidTarget.week.bid_deadline_override ??
            hub.bidTarget.week.bid_deadline
          }
          href={`/seasons/${seasonId}/weeks/${hub.bidTarget.week.id}/bid`}
          hasBid={hub.bidTarget.hasBid}
        />
      )}

      {/* STICKY NOTE 2. Only fetched for a commissioner, so a player's browser
          never receives it. */}
      {home.isCommissioner && (
        <QueueStrip seasonId={seasonId} weeks={home.overdue} />
      )}

      <Bento>
        {/* FULL WIDTH, AND FOUR BRIEFS ACROSS IT. It was seven columns with a
            2x2 inside until the ten-player fixture landed; see the pairing note
            below for why it moved, and `week-story.tsx` for why four across is
            legible again at this width. */}
        {story.lastScoredWeek !== null && story.headlines.length > 0 && (
          <BentoCell
            id="week-brief"
            title={`Week ${String(story.lastScoredWeek).padStart(2, "0")} in brief`}
            span="md:col-span-2 xl:col-span-12"
          >
            <WeekStory headlines={story.headlines} />
          </BentoCell>
        )}

        {/* ── THE TWO LONG CELLS FACE EACH OTHER, AND THAT IS THE PAIRING ───
            This row used to be the briefs stacked over this list, leaning
            against a row-spanned picks cell. That held while a league was five
            players deep and the viewer owned four films. Against ten players
            and nine films owned the stack came out 1009px against the picks'
            719 and tore a 290px hole in the page — the same failure
            `bento.tsx` documents, with its sign reversed.

            The two cells that actually grow together are these: what you own
            and what the season is remembered for both lengthen as a season
            runs on. Measured against the ten-player fixture they land 87px
            apart, and the briefs — four of them whatever happens — took the
            full width instead of propping up a stack. */}
        <BentoCell
          id="your-films"
          title="Films you own"
          aside={
            hub.myFilms.length > 0
              ? `${hub.myFilms.length} owned · best first`
              : undefined
          }
          span="md:col-span-1 xl:col-span-7"
        >
          <YourFilms films={hub.myFilms} />
        </BentoCell>

        {leaderboard.hasScores && (
          <BentoCell
            id="picks"
            title="The season's picks"
            span="md:col-span-1 xl:col-span-5"
          >
            <SeasonPicks awards={leaderboard.awards} films={leaderboard.rail} />
          </BentoCell>
        )}

        {/* EVERYTHING BELOW NEEDS A SCORED WEEK. Before anything is captured
            every player has zero points and dense ranking would put the whole
            league in 1st, so a standings table would be a list of ties and the
            awards would name a pick nobody has made. `getLeaderboard` returns
            the flag for exactly this. */}
        {leaderboard.hasScores ? (
          <>
            <BentoCell
              id="standings"
              title="Standings"
              aside={
                paysMoney
                  ? "Prize is a projection until the season is finalised"
                  : undefined
              }
              span="md:col-span-2 xl:col-span-7"
              flush
            >
              <StandingsTable data={leaderboard} ladder={ladder} />
            </BentoCell>

            {/* THE SECOND PAIR, AND THE ONE THE CHART USED TO BREAK UP. The
                rank walk sat here as a slack-absorber, stretching to whatever
                the standings beside it came out at — which worked because it
                was a chart and a chart with more room reads better rather than
                emptier. It went at ten players, where ten lines crossing in a
                444px cell stopped being a rank walk and became spaghetti.

                What replaces it is the pairing the page wanted anyway: two
                tables of the same subject — the field, and you against the
                field — that both grow one row per player. Measured against the
                ten-player fixture they land within about 90px. */}
            {story.rivals.length > 0 && (
              <BentoCell
                id="head-to-head"
                title="Head to head"
                aside="A week is won by outscoring them, not by out-placing them"
                span="md:col-span-2 xl:col-span-5"
              >
                <HeadToHead rivals={story.rivals} nearest={story.nearest} />
              </BentoCell>
            )}
          </>
        ) : (
          <BentoCell
            id="standings"
            title="Standings"
            span="md:col-span-2 xl:col-span-5"
          >
            <Empty className="border-0 py-6">
              <EmptyHeader>
                <EmptyTitle>Nothing scored yet</EmptyTitle>
                <EmptyDescription>
                  Standings appear the first Monday a week is captured. Until
                  then everybody is level, and a table would only say so eleven
                  times.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </BentoCell>
        )}

        {/* LAST, AND FULL WIDTH — THE SEASON'S BACK PAGES.
            It opened the grid until 2026-09-02. It is the one cell on the page
            nobody arrives to read: the hero already says where you stand, the
            briefs say what just happened, and the ledger is where you go when
            you want to check a specific week. Ten weeks of it above everything
            else pushed the standings below the fold on a laptop and made the
            page open with an archive. It closes the page instead, which is
            also the only place a table that grows one row per week can sit
            without dictating what pairs with what. */}
        <BentoCell
          id="weeks"
          title="Weeks"
          aside="Sort any column · open a row for the films you owned"
          span="md:col-span-2 xl:col-span-12"
          flush
        >
          <WeeksTable rows={home.ledger} />
        </BentoCell>
      </Bento>
    </main>
  );
}
