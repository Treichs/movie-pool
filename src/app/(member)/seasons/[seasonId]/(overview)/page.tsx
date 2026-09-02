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

import {
  Dashboard,
  DashboardGrid,
  DashboardPanel,
} from "@/components/dashboard";

import { BankrollBurndown } from "./_components/bankroll-burndown";
import { BumpChart } from "./_components/bump-chart";
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
 * said the movement a third time. What replaced them is one hero and a
 * dashboard — the hero answers where you stand and what is due, the dashboard
 * holds every table and chart at once, and nothing on the page is behind a
 * control.
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
 * ── IT IS NOW ONE CONTAINED SURFACE, NOT A FIELD OF LOOSE CARDS ───────────
 * The grid moved into `components/dashboard.tsx` on 2026-09-02: a wash-ground
 * frame with one border, one radius, and sheet panels inset in it. Both this
 * page and League Home take the same shell — the reason they share it is the
 * reason `BidCta` was lifted out of both a week earlier.
 *
 * THE `md` GRID IS SIX COLUMNS NOW, NOT TWO, so every span reads as a fraction
 * of the same twelve: an 8-of-12 cell is a 4-of-6 cell rather than a
 * full-width one. The spans below were rescaled, not re-laid-out.
 *
 * ── THE GRID IS UNEQUAL ON PURPOSE, AND PACKED BY LENGTH ──────────────────
 * Twelve columns at `xl`, six at `md`, one below:
 *
 *     WEEK NN IN BRIEF .............................. 12   192px
 *     FILMS YOU OWN ........ 8 │ BANKROLL ........... 4   363 / 252
 *     THE RANK WALK ........ 7 │ THE SEASON'S PICKS . 5   575 / 694
 *     STANDINGS ............ 7 │ HEAD TO HEAD ....... 5   554 / 601
 *     WEEKS ......................................... 12   539px
 *
 * THE HEIGHTS ARE MEASURED, NOT ESTIMATED — taken off the ten-player fixture
 * at 1440 on 2026-09-02, which is the only fixture big enough to tell the
 * pairings apart. Every panel above is now a FIXED height: the rail is one
 * poster tall however many films you own, the weeks ledger is six rows however
 * long the season, and the picks list has always capped itself at five. That
 * is what makes a measured pairing worth writing down — the numbers cannot
 * drift out from under it the way the old list-and-table versions did.
 *
 * THE PAIRING WAS RE-CUT AGAIN WHEN THE RAIL LANDED. Turning films-you-own
 * into a rail took it from roughly 700px to 363, which inverted the hole it
 * used to have: it now sat beside a 694px picks panel and left 331px of
 * nothing. Films moved next to the bankroll (363/252) and the picks moved
 * next to the rank walk (575/694). Worst gap on the page went from 331 to
 * about 120.
 *
 * THE ORDER OF THE CELLS BELOW *IS* THE LAYOUT — grid auto-placement fills
 * those slots from this DOM order, so moving one moves the shape.
 *
 * PAIRING BY GROWTH RATE IS RETIRED, and this is the commit that retires it.
 * The old rule — put each cell next to something that lengthens at the same
 * speed — existed because the cells grew. Rails and paging mean they do not,
 * so pairs are now chosen by MEASURED HEIGHT, which is a fact you can check
 * rather than a rate you have to predict. `components/dashboard.tsx` carries
 * the reasoning.
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

      <Dashboard
        eyebrow="The season report"
        meta={`${leaderboard.playerCount} players · ${leaderboard.scoredWeeks.length} of ${hub.weeks.length} weeks scored`}
        className="mt-4"
      >
        <DashboardGrid>
          {/* ── THE COMMAND BAND ─────────────────────────────────────────
              The hero, moved inside the frame on 2026-09-02 so the page reads
              header → what is due → the report, which is what the approved
              board draws. It spans all twelve and carries the page's only
              72px numeral, so it is not "the first of nine equals" that
              `season-hero.tsx` warns about — it is the widest panel, with the
              largest figure, and the only one whose heading is hidden because
              its own first line already says what it is. */}
          <DashboardPanel
            id="your-season"
            title="Your season"
            hideTitle
            span="md:col-span-6 xl:col-span-12"
          >
            <SeasonHero
              position={story.position}
              bankrollLeft={hub.remaining}
              filmsOwned={hub.me?.filmsOwned ?? null}
              efficiency={hub.me?.efficiency ?? null}
            />
          </DashboardPanel>

        {/* FULL WIDTH, AND FOUR BRIEFS ACROSS IT. It was seven columns with a
            2x2 inside until the ten-player fixture landed; see the pairing note
            below for why it moved, and `week-story.tsx` for why four across is
            legible again at this width. */}
        {story.lastScoredWeek !== null && story.headlines.length > 0 && (
          <DashboardPanel
            id="week-brief"
            title={`Week ${String(story.lastScoredWeek).padStart(2, "0")} in brief`}
            span="md:col-span-6 xl:col-span-12"
          >
            <WeekStory headlines={story.headlines} />
          </DashboardPanel>
        )}

        {/* ── THE TWO LONG CELLS FACE EACH OTHER, AND THAT IS THE PAIRING ───
            This row used to be the briefs stacked over this list, leaning
            against a row-spanned picks cell. That held while a league was five
            players deep and the viewer owned four films. Against ten players
            and nine films owned the stack came out 1009px against the picks'
            719 and tore a 290px hole in the page — the same failure
            `components/dashboard.tsx` documents, with its sign reversed.

            The two cells that actually grow together are these: what you own
            and what the season is remembered for both lengthen as a season
            runs on. Measured against the ten-player fixture they land 87px
            apart, and the briefs — four of them whatever happens — took the
            full width instead of propping up a stack. */}
        <DashboardPanel
          id="your-films"
          title="Films you own"
          aside={
            hub.myFilms.length > 0
              ? `${hub.myFilms.length} owned · best first`
              : undefined
          }
          span="md:col-span-6 xl:col-span-8"
        >
          <YourFilms films={hub.myFilms} />
        </DashboardPanel>

        {leaderboard.hasScores && leaderboard.scoredWeeks.length >= 2 && (
          <DashboardPanel
            id="bankroll"
            title="Bankroll"
            aside="Never replenished"
            span="md:col-span-6 xl:col-span-4"
          >
            <BankrollBurndown bankroll={hub.bankroll} rows={home.ledger} />
          </DashboardPanel>
        )}

        {/* ── THE FIELD, IN THREE PANELS ───────────────────────────────────
            The rank walk, the standings and head-to-head are one subject —
            where everyone is — and they now sit together. The chart leads
            because it is the only one of the three that says how you GOT
            here; the two tables say where you ended up.

            THE CHART IS BACK, AND ITS ENCODING IS WHY. It was deleted on
            2026-09-02 for reading as spaghetti at ten players. Half of that
            was the 444px cell it sat in — it takes eight of twelve columns
            now, roughly double. The other half was that ten lines were asked
            to carry ten identities in colour, and `--series-1..10` measurably
            cannot: eight of the ten fall below the chroma floor and the worst
            adjacent pair separates by ΔE 3.9 for normal colour vision. It
            names three players and holds the rest back as one band. See
            `bump-chart.tsx`.

            THE BURNDOWN PAIRS WITH IT AND QUERIES NOTHING — the ledger this
            page already holds carries what you paid each week, and running it
            back from the bankroll is the one question the hero's "$10 left"
            cannot answer: whether that is comfortable or ruinous this far in. */}
        {leaderboard.hasScores && leaderboard.scoredWeeks.length >= 2 && (
          <DashboardPanel
            id="rank-walk"
            title="The rank walk"
            aside="You, the place above and the place below"
            span="md:col-span-6 xl:col-span-7 xl:self-stretch"
          >
            <BumpChart
              series={leaderboard.allTrends}
              scoredWeeks={leaderboard.scoredWeeks}
            />
          </DashboardPanel>
        )}

        {leaderboard.hasScores && (
          <DashboardPanel
            id="picks"
            title="The season's picks"
            span="md:col-span-6 xl:col-span-5"
          >
            <SeasonPicks awards={leaderboard.awards} films={leaderboard.rail} />
          </DashboardPanel>
        )}

        {/* EVERYTHING BELOW NEEDS A SCORED WEEK. Before anything is captured
            every player has zero points and dense ranking would put the whole
            league in 1st, so a standings table would be a list of ties and the
            awards would name a pick nobody has made. `getLeaderboard` returns
            the flag for exactly this. */}
        {leaderboard.hasScores ? (
          <>
            <DashboardPanel
              id="standings"
              title="Standings"
              aside={
                paysMoney
                  ? "Prize is a projection until the season is finalised"
                  : undefined
              }
              span="md:col-span-6 xl:col-span-7"
              flush
            >
              <StandingsTable data={leaderboard} ladder={ladder} />
            </DashboardPanel>

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
              <DashboardPanel
                id="head-to-head"
                title="Head to head"
                aside="A week is won by outscoring them, not by out-placing them"
                span="md:col-span-6 xl:col-span-5"
              >
                <HeadToHead rivals={story.rivals} nearest={story.nearest} />
              </DashboardPanel>
            )}
          </>
        ) : (
          <DashboardPanel
            id="standings"
            title="Standings"
            span="md:col-span-6 xl:col-span-7"
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
          </DashboardPanel>
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
        <DashboardPanel
          id="weeks"
          title="Weeks"
          aside="Sort any column · open a row for the films you owned"
          span="md:col-span-6 xl:col-span-12"
          flush
        >
          <WeeksTable rows={home.ledger} />
        </DashboardPanel>
        </DashboardGrid>
      </Dashboard>
    </main>
  );
}
