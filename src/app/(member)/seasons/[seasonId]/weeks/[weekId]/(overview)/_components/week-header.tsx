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
import { formatDate, numberWord } from "@/lib/format";
import { todayIso, weekStatusDisplay } from "@/lib/week-status";
import type { WeekBoardView } from "@/lib/week-board-view";

/**
 * WHICH WEEK THIS IS, AND WHAT STATE IT IS IN — board 3.2's masthead.
 *
 * ── THE CHIP AND THE SENTENCE BOTH COME FROM `week-status.ts` ────────────
 * That module is the app's one place where a week status becomes words, and
 * it is unit-tested. Writing "Settled" here would be a second vocabulary that
 * drifts the first time a status is added — ADR-069's `skipped` is exactly
 * that history.
 *
 * ── THE DEADLINE WINDOW IS DERIVED, NOT FETCHED AGAIN ────────────────────
 * A week can read `open` for up to a minute after its deadline while the
 * automated close catches up. The page has already refused to render a
 * biddable week, so `open` and not biddable IS that window — no second clock.
 */
export function WeekHeader({ view }: { view: WeekBoardView }) {
  const { week, season, league, status, biddable, sheet, removed } = view;
  const display = weekStatusDisplay(status, status === "open" && !biddable);

  const films = sheet.length + removed.length;
  // TENSE, NOT DECORATION. A pending week has not opened yet and a skipped one
  // never will — "Opened Fri, Sep 11" about next month is simply false. The
  // comparison is UTC on both sides, matching `todayIso` and the database's
  // own `current_date`.
  const opening =
    status === "skipped"
      ? `Weekend of ${formatDate(week.openingDate)}`
      : week.openingDate > todayIso()
        ? `Opens ${formatDate(week.openingDate)}`
        : `Opened ${formatDate(week.openingDate)}`;

  const parts = [
    opening,
    view.scoredAt ? `scored ${formatDate(view.scoredAt.slice(0, 10))}` : null,
    `${numberWord(films)} film${films === 1 ? "" : "s"}`,
    view.bidderCount > 0
      ? `${numberWord(view.bidderCount)} bidder${view.bidderCount === 1 ? "" : "s"}`
      : null,
  ].filter((p): p is string => p !== null);

  return (
    <div className="flex flex-col gap-1">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          {league && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/leagues/${league.id}`} />}>
                  {league.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/seasons/${season.id}`} />}>
              {season.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              Week {String(week.number).padStart(2, "0")}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-center gap-3.5">
        <h1>Week {String(week.number).padStart(2, "0")}</h1>
        {/* Accent for "bids settled" alone — ADR-048 calls it the most
            interesting state in the game, and it is the one this page exists
            to show. Everything else is a label, not an event. */}
        <Badge variant={display.tone === "accent" ? "default" : "outline"}>
          {display.label}
        </Badge>
      </div>

      <p className="type-dek text-ui text-muted-foreground">
        {parts.join(" · ")}
      </p>
    </div>
  );
}
