"use client";

import Link from "next/link";
import { BellIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ShellAlert } from "@/lib/shell-alerts";

/**
 * THE DOT IS PAPER, NOT VERMILION, and that is the rule rather than a
 * preference: the band already spends its one accent on the wordmark, and a
 * second red on the same surface makes neither of them mean anything.
 *
 * What the bell holds is in `lib/shell-alerts.ts` — things waiting on the
 * viewer, not a feed. An empty bell says so plainly instead of hiding, because
 * a control that vanishes when it has nothing to say teaches people to stop
 * looking at it.
 */
export function NotificationBell({ alerts }: { alerts: ShellAlert[] }) {
  const count = alerts.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-11 items-center justify-center rounded-4xl text-nav-foreground outline-none hover:bg-nav-foreground/10 focus-visible:ring-3 focus-visible:ring-nav-foreground/30"
        aria-label={count === 0 ? "Nothing waiting on you" : `${count} waiting on you`}
      >
        <BellIcon className="size-[18px]" aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute top-2.5 right-2.5 size-2.5 rounded-full border-2 border-nav bg-nav-foreground"
          />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="type-micro text-micro px-3 pt-2 pb-1 text-muted-foreground">
          Waiting on you
        </div>
        {count === 0 ? (
          <p className="type-body text-ui px-3 py-2 text-muted-foreground">
            Nothing right now. Bids you owe and invitations you have not answered
            show up here.
          </p>
        ) : (
          alerts.map((alert) => (
            <DropdownMenuItem key={alert.id} render={<Link href={alert.href} />}>
              <span className="flex flex-col gap-0.5">
                <span className="type-ui text-ui">{alert.title}</span>
                <span className="type-body text-micro text-muted-foreground">
                  {alert.detail}
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
