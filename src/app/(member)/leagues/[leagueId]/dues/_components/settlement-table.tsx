"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { initialsFrom, ordinal } from "@/lib/format";
import { ok, type ActionResult } from "@/lib/action-result";
import type { DuesRow } from "@/lib/league-dues";

import { clearPayment, markPaymentPaid } from "../actions";

/**
 * THE LATEST SEASON'S SETTLEMENT — board 4.4's table.
 *
 * ── NOT TANSTACK, AND THAT IS THE RULE WORKING ──────────────────────────
 * The standing instruction is that a DATA TABLE uses TanStack, and the two
 * that do are sortable because sorting answers a real question there ("which
 * season did I play best", "who is most efficient"). This is a settlement
 * sheet: it has one correct order — finishing place — and every row carries a
 * control. Sorting it by amount would break the one thing its order means, so
 * it is the vendored `ui/table` and nothing more.
 *
 * ── EACH ROW IS ITS OWN FORM ────────────────────────────────────────────
 * `useActionState` is per-form, and one form around the whole table would
 * leave every row sharing one pending flag and one error. A row is the unit
 * that succeeds or fails, so a row is the form.
 */

const money = (n: number | null) =>
  n === null ? "—" : n === 0 ? "$0" : `${n > 0 ? "+" : "−"}$${Math.abs(n)}`;

const INITIAL: ActionResult = ok(undefined);

function PaymentControl({
  leagueId,
  row,
}: {
  leagueId: string;
  row: DuesRow;
}) {
  const settled = row.status !== null;
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    settled ? clearPayment : markPaymentPaid,
    INITIAL
  );

  const last = useRef<ActionResult>(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (!state.ok) toast.error(state.error);
    else if (state.notice) toast.success(state.notice);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="seasonMemberId" value={row.seasonMemberId} />
      {/* The debt itself is what gets recorded as paid. `record_settlement_payment`
          takes a whole number of dollars 0 or more, so the sign comes off here
          — the direction is already in the settlement's own net. */}
      <input type="hidden" name="amount" value={Math.abs(row.net ?? 0)} />
      <Button type="submit" variant="outline" size="xs" disabled={pending}>
        {pending ? "Saving…" : settled ? "Undo" : "Mark paid"}
      </Button>
    </form>
  );
}

export function SettlementTable({
  leagueId,
  seasonName,
  rows,
  isCommissioner,
}: {
  leagueId: string;
  seasonName: string;
  rows: DuesRow[];
  isCommissioner: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2>{seasonName} settlement</h2>
      <Card variant="flat" className="gap-0 overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead className="w-30">Finish</TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
              <TableHead className="w-28">Status</TableHead>
              {isCommissioner && <TableHead className="w-30" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.seasonMemberId}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="size-6 rounded">
                      <AvatarFallback
                        className={`type-micro rounded text-micro ${row.isMe ? "bg-foreground text-background" : "bg-muted"}`}
                      >
                        {initialsFrom(row.name)}
                      </AvatarFallback>
                    </Avatar>
                    <Link
                      href={`/players/${row.profileId}`}
                      className={`truncate text-ui hover:underline ${row.isMe ? "type-ui font-semibold" : "type-ui"}`}
                    >
                      {row.isMe ? "You" : row.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell>
                  {row.place === null ? (
                    <span className="text-ui text-muted-foreground">—</span>
                  ) : row.place === 1 ? (
                    // The champion is the one place worth naming; the rest are
                    // ordinals, which is how the board draws them.
                    <Badge variant="default">Champion</Badge>
                  ) : (
                    <span className="text-ui text-muted-foreground">
                      {ordinal(row.place)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="type-numeral text-right text-ui">
                  {money(row.net)}
                </TableCell>
                <TableCell>
                  {row.status !== null ? (
                    <Badge variant="outline">
                      {row.status === "waived" ? "Waived" : "Paid"}
                    </Badge>
                  ) : row.net === null || row.net === 0 ? (
                    <Badge variant="outline">Square</Badge>
                  ) : (
                    <Badge variant="ink">
                      {row.net > 0 ? "Unpaid" : "Owed"}
                    </Badge>
                  )}
                </TableCell>
                {isCommissioner && (
                  <TableCell>
                    {/* Nothing to settle on a zero line — offering a control
                        that records a $0 payment would put a row in the ledger
                        saying something happened when nothing did. */}
                    {row.net !== null && row.net !== 0 && (
                      <PaymentControl leagueId={leagueId} row={row} />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
