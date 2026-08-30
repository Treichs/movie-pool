import Link from "next/link";

import { PlayerAvatar } from "@/components/player-avatar";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ordinal } from "@/lib/format";
import { formatPoints, type PayoutRow } from "@/lib/payouts";

/**
 * THE LEDGER — every line of the settlement, in finishing order.
 *
 * ── NOT TANSTACK, FOR THE SAME REASON THE DUES SHEET IS NOT ────────────
 * A settlement has one correct order and it is the standings. Sorting it by
 * amount would put the dessert penalty above the champion and answer a
 * question nobody asked; the standing instruction covers data tables that are
 * genuinely explored, which this is not.
 *
 * ── THE MIDDLE COLUMN IS WHERE THE MONEY CAME FROM ─────────────────────
 * Board 5.1a leaves that header blank and fills the cells with the parts. A
 * net of `$24` is a number; "1st $70 · buy-in −$35" is the arithmetic, and on
 * a page about real money the arithmetic is what stops an argument.
 */

const money = (n: number) =>
  n === 0 ? "$0" : `${n > 0 ? "+" : "−"}$${Math.abs(n)}`;

/** The parts that actually applied, in the order the rulebook pays them. */
function parts(row: PayoutRow): string {
  const b = row.breakdown;
  const bits: string[] = [];
  if (b.place_won > 0) bits.push(`${ordinal(b.place)} $${b.place_won}`);
  if (b.third_refund > 0) bits.push(`buy-in back $${b.third_refund}`);
  if (b.efficiency_won > 0) bits.push(`efficiency $${b.efficiency_won}`);
  if (b.buy_in > 0) bits.push(`buy-in −$${b.buy_in}`);
  if (b.dessert_owed > 0) bits.push(`dessert −$${b.dessert_owed}`);
  return bits.join(" · ");
}

export function PayoutLedger({ ledger }: { ledger: PayoutRow[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2>The ledger</h2>
      <Card variant="flat" className="gap-0 overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-11">#</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="w-32 text-right">Points</TableHead>
              <TableHead className="w-64">
                <span className="sr-only">How it adds up</span>
              </TableHead>
              <TableHead className="w-28 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.map((row) => (
              <TableRow
                key={row.lineId}
                className={row.isMe ? "bg-muted/60" : undefined}
              >
                <TableCell className="type-numeral text-ui text-muted-foreground">
                  {row.place}
                </TableCell>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <PlayerAvatar
                      id={row.profileId}
                      name={row.name}
                      isMe={row.isMe}
                      className="size-6"
                    />
                    <Link
                      href={`/players/${row.profileId}`}
                      className={`truncate text-ui hover:underline ${row.isMe ? "type-ui font-semibold" : "type-ui"}`}
                    >
                      {row.isMe ? "You" : row.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="type-numeral text-right text-ui">
                  {formatPoints(row.points)}
                </TableCell>
                <TableCell className="type-body text-micro text-muted-foreground">
                  {parts(row)}
                </TableCell>
                <TableCell className="type-numeral text-right text-ui">
                  {money(row.net)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  );
}
