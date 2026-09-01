import { notFound, redirect } from "next/navigation";

import { requireSeasonMember } from "@/lib/auth";
import { getWeekBidBoard } from "@/lib/week-bid";

import { BidForm } from "./_components/bid-form";
import { BidHeader } from "./_components/bid-header";
import { CommissionerStrip } from "./_components/commissioner-strip";
import { WeekStatusBar } from "./_components/week-status-bar";

export const metadata = { title: "Place your bids" };

/**
 * THE BID PAGE — the open week, and the only place bidding happens (ADR-108).
 *
 * The template the remaining screens follow. Three things about its shape are
 * the point, not incidental:
 *
 * 1. THE GATE IS STRUCTURAL. `getWeekBidBoard` takes a `SeasonContext`, and the
 *    only way to obtain one is `requireSeasonMember`. Step 1 precedes step 2
 *    because the TYPE refuses any other order — not because 25 pages each
 *    remember to open with a check that nothing fails if one of them forgets.
 * 2. THE ROUTE PLACES; IT DOES NOT STYLE. `<main>` is the exception that proves
 *    it — a bare landmark carrying layout only. It is the route's to give, and
 *    EVERY SCREEN THAT COPIES THIS TEMPLATE NEEDS IT: nothing in this repo
 *    asserts a landmark exists, so a page without one is caught by driving it
 *    and by no gate at all.
 * 3. THE SEGMENT OWNS ITS FAILURE. `error.tsx` sits beside this file.
 */
export default async function BidPage({
  params,
}: {
  params: Promise<{ seasonId: string; weekId: string }>;
}) {
  const { seasonId, weekId } = await params;

  const ctx = await requireSeasonMember(seasonId);
  const board = await getWeekBidBoard(ctx, weekId);
  if (!board) notFound();

  // BIDDABLE, not open. A week past its deadline still reads `open` for up to a
  // minute while the automated close catches up, and the RPC would refuse a bid
  // placed in that window — so this page must not be reachable in it. Everything
  // that is not a live bidding window belongs on the week board.
  if (!board.biddable) redirect(`/seasons/${seasonId}/weeks/${weekId}`);

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-measure-page flex-col gap-6 p-6 md:p-8">
      {/* THE MASTHEAD AND THE STANDING FIGURES SHARE A LINE, the way a trade
          paper sets them. Stacked, the trail, title, dek and status card spent
          320px before the first film — which pushed the slate off a 390px
          phone entirely, and made the page taller than a 900px laptop so the
          summary bar pinned itself over the only inputs on the screen. Side by
          side they cost the height of the taller column instead of the sum. */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-8">
        <BidHeader board={board} />
        <WeekStatusBar board={board} />
      </div>
      <BidForm
        seasonId={seasonId}
        weekId={weekId}
        leagueId={board.league?.id ?? null}
        minBid={board.minBid}
        // NOT remaining + exposure: `member_remaining_budget` deducts only
        // WINNING bids, so this week's pending bids were never taken out of it.
        // Adding them back would offer a budget the player does not have and
        // green-light a basket the RPC then rejects.
        remaining={board.remaining}
        // So the form can end WITH the clock. The redirect above only runs on a
        // fresh render, and the player who matters most is the one already on
        // this page when the deadline lands.
        deadline={board.week.bidDeadline}
        films={board.slate.map((film) => ({
          id: film.id,
          title: film.title,
          eligible: film.eligible,
          posterPath: film.posterPath,
          releaseDate: film.releaseDate,
          tomatometer: film.tomatometer,
          myBid: film.myBid,
          tmdbId: film.tmdbId,
        }))}
      />
      {/* AFTER THE SLATE, deliberately. Closing bidding is irreversible and
          league-wide; the player's own bidding is the reason this page exists.
          Placing the consequential control above the routine one is NN/g's
          documented proximity mistake — users slip into automaticity, and the
          remedy is spatial separation rather than a heavier dialog. */}
      {ctx.role === "commissioner" && <CommissionerStrip board={board} />}
    </main>
  );
}
