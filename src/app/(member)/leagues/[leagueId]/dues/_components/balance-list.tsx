import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { initialsFrom } from "@/lib/format";
import type { DuesBalance } from "@/lib/league-dues";

/**
 * ALL-TIME BALANCES — board 4.4's main panel.
 *
 * ── THE SIGN IS EXPLAINED IN WORDS, EVERY ROW ───────────────────────────
 * "+$85" on a page called dues reads as "they owe $85" to most people, and it
 * means the opposite. So every row carries a word — **Due to them**, **Owed**,
 * **Square** — and the panel repeats the rule underneath. Neither is
 * decoration: this is the one screen where misreading a sign costs somebody
 * real money.
 *
 * ── OWED IS INK, NOT RED ────────────────────────────────────────────────
 * A debt is a fact, not a failure or a destructive action, and `--destructive`
 * is for the latter. Ink is how this system marks the row that needs attention
 * without spending the accent — which on this page is not spent at all.
 */

const money = (n: number) =>
  n === 0 ? "$0" : `${n > 0 ? "+" : "−"}$${Math.abs(n)}`;

export function BalanceList({ balances }: { balances: DuesBalance[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Card variant="flat" className="gap-0 p-0">
        <ul className="flex flex-col">
          {balances.map((b) => (
            <li
              key={b.profileId}
              className={`flex items-center justify-between gap-4 border-b px-3 py-2.5 last:border-b-0 ${
                b.isMe ? "bg-muted" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar className="size-6.5 rounded">
                  <AvatarFallback
                    className={`type-micro rounded text-micro ${b.isMe ? "bg-foreground text-background" : "bg-muted"}`}
                  >
                    {initialsFrom(b.name)}
                  </AvatarFallback>
                </Avatar>
                <Link
                  href={`/players/${b.profileId}`}
                  className={`truncate text-ui hover:underline ${b.isMe ? "type-ui font-semibold" : "type-ui"}`}
                >
                  {b.name}
                </Link>
              </div>
              <div className="flex items-center gap-5">
                {b.balance > 0 ? (
                  <Badge variant="outline">Due to them</Badge>
                ) : b.balance < 0 ? (
                  <Badge variant="ink">Owed</Badge>
                ) : (
                  <Badge variant="outline">Square</Badge>
                )}
                <span
                  className={`type-numeral w-19 text-right text-h3 ${
                    b.balance === 0 ? "text-muted-foreground" : ""
                  }`}
                >
                  {money(b.balance)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <span className="type-body text-micro text-muted-foreground">
        A positive balance means the league owes them — usually a payout not
        yet handed over.
      </span>
    </div>
  );
}
