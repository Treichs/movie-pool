import { notFound, redirect } from "next/navigation";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { requireSeasonMember } from "@/lib/auth";
import { buildRevealStory, rankFilmsByScore, weekTopBid } from "@/lib/reveal";
import { getWeekBoardView } from "@/lib/week-board-view";
import { resultsAreOpen, weekStatusDisplay } from "@/lib/week-status";

import { Corrections } from "./_components/corrections";
import { RevealBriefStrip } from "./_components/reveal-brief";
import { RevealFilmRow } from "./_components/reveal-film";
import { RevealSheet } from "./_components/reveal-sheet";
import { WeekendWatch } from "./_components/weekend-watch";
import { FinishUnbidWeek } from "./_components/finish-unbid-week";
import { WeekHeader } from "./_components/week-header";
import { YourWeek } from "./_components/your-week";

export const metadata = { title: "Week" };

/**
 * `/seasons/[seasonId]/weeks/[weekId]` — THE WEEK BOARD. Board 3.2.
 *
 * ── THE REDIRECT TO `/bid` IS THE RULE THAT KEEPS TWO SCREENS APART ──────
 * A live bidding window belongs to `/bid` and nowhere else (ADR-108), and the
 * bid page redirects HERE the moment its week stops being biddable. The pair
 * only works because both sides key off `biddable` rather than `open`: a week
 * past its deadline still reads open for up to a minute while the automated
 * close runs, and each page bouncing on `open` would send a reader back and
 * forth through that window.
 *
 * **This redirect is in the page, not in `next.config.ts`.** Reading the config
 * will not reveal it.
 *
 * ── THE CEREMONY, ADDED 2026-09-01 ──────────────────────────────────────
 * A reveal is the most intense minute of the week and this page used to report
 * it like a results table: your own panel, then a list of winners. The two
 * things it was missing were both already computed. `film.rows` carries EVERY
 * bid, not only the winning ones, so the sheet can draw the ladder and the cut
 * that decided it; and `weekTopBid`, `rowEfficiency` and `weekTopEfficiency`
 * sat exported with no consumer at all, which is exactly what the briefs are
 * built from.
 *
 * The motion is one authored moment rather than an effect per section: the
 * bars grow, film after film, and the cut lands under the last bid that got
 * in. `globals.css` carries the keyframes and the reasoning.
 *
 * ── THE WEEKEND IS A STATE, NOT A SCREEN ────────────────────────────────
 * There is no route for "the weekend" and there should not be: the route set
 * is settled, and the weekend IS this page in `closed` — owners decided, points
 * not yet landed. `week-status.ts` already calls it "the most interesting state
 * in the game, not a transient one", and until 2026-09-01 the page spent it
 * showing a dash where a score would go.
 *
 * ── THE PAGE IS DRAWN SETTLED BECAUSE THAT IS THE HALF NOBODY HAS SEEN ──
 * Every other week state is reachable here too, and each one says what it is:
 * pending has no slate yet, skipped never had one, closed has owners but no
 * points, final has everything — and a SETTLED WEEK WITH NO OWNERS is its own
 * state again (2026-08-31), because films opened, everybody passed, and none of
 * the other five sentences is true of that.
 */
export default async function WeekBoardPage({
  params,
}: {
  params: Promise<{ seasonId: string; weekId: string }>;
}) {
  const { seasonId, weekId } = await params;

  const ctx = await requireSeasonMember(seasonId);
  const view = await getWeekBoardView(ctx, weekId);
  if (!view) notFound();

  if (view.biddable) redirect(`/seasons/${seasonId}/weeks/${weekId}/bid`);

  const { sheet, removed, league, status } = view;
  const scored = status === "final";
  const settled = status === "closed" || status === "final";
  // Films opened, everybody passed. Its own state — see `weekStatusDisplay`.
  const noOwners = settled && view.ownerCount === 0;
  const display = weekStatusDisplay(
    status,
    status === "open" && !view.biddable,
    noOwners
  );
  // ONE SCALE FOR THE WHOLE SHEET, removed films included: they were bid on
  // with the same money, and rescaling the survivors when a film is withdrawn
  // would redraw every bar on the page for a reason unrelated to the bidding.
  const weekTop = weekTopBid([...sheet, ...removed]);
  const story = settled ? buildRevealStory(sheet) : { nearMiss: null, briefs: [] };
  // THE SECOND ORDER, computed only when there is one. `rankFilmsByScore` has
  // existed since the Monday storyboard was locked with no caller at all; the
  // sheet component decides whether the two orders actually differ enough to
  // offer the step between them.
  const scoredOrder = scored
    ? rankFilmsByScore(sheet).map((f) => f.filmId)
    : null;

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-measure-page flex-col gap-6 p-6 md:p-8">
      <WeekHeader view={view} />

      {/* ONE PANEL, NOT TWO. `YourWeek` is the SCORED conclusion — its hero
          figure is the week's points and its last figure is points per dollar,
          and on an unscored week both are dashes sitting directly above a band
          that says "1 film, $15 paid, results land Sunday" properly. The
          weekend band supersedes it outright for the days it covers rather
          than being stacked under it. */}
      {view.weekend ? (
        <WeekendWatch watch={view.weekend} />
      ) : (
        view.mine && <YourWeek mine={view.mine} scored={scored} />
      )}

      <RevealBriefStrip briefs={story.briefs} nearMiss={story.nearMiss} />

      {/* THE ONE PRESS THAT CLOSES AN UNBID WEEK OUT. Offered only when every
          condition `finalize_week` checks is already met, so the button is
          never a promise the database will refuse: commissioner, week closed,
          no owners, and the weekend actually over (ADR-080 — a week is not
          history until its Monday). The RPC re-checks all four regardless. */}
      {ctx.role === "commissioner" &&
        noOwners &&
        status === "closed" &&
        view.week.weekOf !== null &&
        resultsAreOpen(view.week.weekOf) && (
          <FinishUnbidWeek seasonId={seasonId} weekId={weekId} />
        )}

      <section className="flex flex-col gap-3">
        {/* "The reveal" is a claim about content. A pending week has nothing to
            reveal and a skipped one never will, so the heading names the slate
            instead and the empty state below says which of the two it is.
            THE CLAIM WAS CHECKED AGAINST THE WRONG SET until 2026-08-31: it
            asked whether films existed, not whether anything was revealed, so a
            week the whole league passed on was headed "The reveal" over a board
            of dashes. A reveal needs something revealed. */}
        <h2>{sheet.length > 0 && !noOwners ? "The reveal" : "The slate"}</h2>

        {sheet.length === 0 ? (
          <Empty className="border">
            {/* The TITLE names the state in a word and the DESCRIPTION is
                `week-status.ts`'s own sentence, so a week explains itself the
                same way here as everywhere else. Kept deliberately short: the
                first draft titled a skipped week "Nothing opened this weekend"
                directly above a blurb beginning with the same five words. */}
            <EmptyHeader>
              <EmptyTitle>
                {status === "skipped" ? "Skipped" : "Not built yet"}
              </EmptyTitle>
              <EmptyDescription>{display.blurb}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <RevealSheet
            films={sheet}
            scoredOrder={scoredOrder}
            weekTop={weekTop}
            leagueId={league?.id ?? null}
          />
        )}
      </section>

      <Corrections overrides={view.overrides} />

      {removed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2>Removed</h2>
          {/* An epilogue, not a result: these score for nobody and their bids
              were refunded, which is why they sit below the corrections that
              explain them rather than among the films that counted.
              NO BLURB. The corrections panel directly above already says
              "removed after bidding closed… refunded in full" — with the
              commissioner's own reason attached, which this could not carry.
              Repeating it verbatim two inches lower made the page read as
              though it were arguing with itself. */}
          {removed.map((film) => (
            <RevealFilmRow
              key={film.filmId}
              film={film}
              weekTop={weekTop}
              leagueId={league?.id ?? null}
            />
          ))}
        </section>
      )}
    </main>
  );
}
