import { notFound, redirect } from "next/navigation";

import { requireSeasonMember } from "@/lib/auth";
import { getWeekBidBoard } from "@/lib/week-bid";

import { BidForm } from "./_components/bid-form";
import { BidHeader } from "./_components/bid-header";
import { CommissionerStrip } from "./_components/commissioner-strip";
import { WeekStatusBar } from "./_components/week-status-bar";

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
  if (!board.biddable) redirect(`/season/${seasonId}/weeks/${weekId}`);

  return (
    <main className="mx-auto flex w-full max-w-measure-page flex-col gap-6 p-6 md:p-8">
      <BidHeader board={board} />
      <WeekStatusBar board={board} />
      {ctx.role === "commissioner" && <CommissionerStrip board={board} />}
      <BidForm
        seasonId={seasonId}
        weekId={weekId}
        minBid={board.minBid}
        // NOT remaining + exposure: `member_remaining_budget` deducts only
        // WINNING bids, so this week's pending bids were never taken out of it.
        // Adding them back would offer a budget the player does not have and
        // green-light a basket the RPC then rejects.
        remaining={board.remaining}
        films={board.slate.map((film) => ({
          id: film.id,
          title: film.title,
          eligible: film.eligible,
          posterPath: film.posterPath,
          releaseDate: film.releaseDate,
          tomatometer: film.tomatometer,
          myBid: film.myBid,
        }))}
      />
    </main>
  );
}
