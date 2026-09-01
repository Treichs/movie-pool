import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { WeekBidBoard } from "@/lib/week-bid";

/** The trail and the title. Only the parts that are actually this route's:
 *  which crumbs its trail is made of, and what the page calls itself. */
export function BidHeader({ board }: { board: WeekBidBoard }) {
  const { season, league, week } = board;

  // THE WEEK IS THE CURRENT PAGE HERE, not a link above it.
  //
  // It used to be a crumb pointing at `/seasons/[s]/weeks/[w]` — which, while
  // the window is live, redirects straight back to this page (ADR-108: a live
  // bidding window belongs to /bid and nowhere else). So the one crumb a player
  // would reach for to leave the form returned them to the form.
  //
  // The trail now ends where the user actually is. During bidding this screen
  // IS the week, which is the same thing ADR-108 says, said in the breadcrumb.
  const crumbs = [
    // "Your leagues", not "Home" — every other trail in the app names this
    // destination that way, and a root that renames itself reads as two places.
    { label: "Your leagues", href: "/leagues" },
    ...(league ? [{ label: league.name, href: `/leagues/${league.id}` }] : []),
    { label: season.name, href: `/seasons/${season.id}` },
  ];

  return (
    <div>
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((c) => (
            // The separator is a SIBLING, not a child: both it and
            // BreadcrumbItem render <li>, and an <li> inside an <li> is invalid
            // HTML that fails hydration rather than merely looking wrong.
            <Fragment key={c.href}>
              <BreadcrumbItem>
                <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </Fragment>
          ))}
          <BreadcrumbItem>
            <BreadcrumbPage>{weekLabel(week.number, week.weekOf)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="mt-4">Place your bids</h1>
      {/* ONE LINE ON A PHONE. At 24px on a 343px column every extra clause is
          another 32px band between the player and the slate, and this dek is
          read once in week one and then every week forever after. The four
          facts that earn their place are: blind, sealed, changeable, deadline. */}
      <p className="type-dek text-dek mt-3 max-w-measure-tight text-muted-foreground">
        Blind and sealed — change a bid until the deadline.
      </p>
    </div>
  );
}

/** `weekOf` is the generated Monday of the Mon–Sun range (ADR-042) and is what
 *  players are shown; the number is the fallback when it is null.
 *
 *  THE DATE IS LABELLED, because a week has two that matter and they can fall
 *  in different months. This one is the Monday the week is OF; the season page
 *  lists the Friday films open on. Unlabelled, "Week 01 · Aug 31" beside
 *  "Fri, Sep 4" reads as one of the two being wrong. */
function weekLabel(number: number, weekOf: string | null) {
  const n = `Week ${String(number).padStart(2, "0")}`;
  if (!weekOf) return n;
  const d = new Date(`${weekOf}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${n} · week of ${d}`;
}
