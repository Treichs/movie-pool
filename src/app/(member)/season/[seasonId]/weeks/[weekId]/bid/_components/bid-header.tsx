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

  const crumbs = [
    { label: "Home", href: "/home" },
    ...(league ? [{ label: league.name, href: `/league/${league.id}` }] : []),
    { label: season.name, href: `/season/${season.id}` },
    {
      label: weekLabel(week.number, week.weekOf),
      href: `/season/${season.id}/weeks/${week.id}`,
    },
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
            <BreadcrumbPage>Bid</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="mt-4">Place your bids</h1>
      <p className="type-dek text-dek mt-3 max-w-[52ch] text-muted-foreground">
        Blind and sealed until the week closes — change a bid any time before the
        deadline.
      </p>
    </div>
  );
}

/** `weekOf` is the generated Monday of the Mon–Sun range (ADR-042) and is what
 *  players are shown; the number is the fallback when it is null. */
function weekLabel(number: number, weekOf: string | null) {
  const n = `Week ${String(number).padStart(2, "0")}`;
  if (!weekOf) return n;
  const d = new Date(`${weekOf}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${n} · ${d}`;
}
