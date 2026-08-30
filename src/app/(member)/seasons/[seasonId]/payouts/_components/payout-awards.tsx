import Link from "next/link";

import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PayoutAward } from "@/lib/payouts";
import { cn } from "@/lib/utils";

/**
 * THE AWARDS — the same three cards for both roles.
 *
 * ── MARQUEE IS THE COMPOSER'S CALL, AND THE DESSERT IS NOT ONE ─────────
 * Champion and Best efficiency take the heavy border; the Dessert prize does
 * not, because it is a PENALTY. Both boards draw it that way and it is the
 * right instinct: the shelf reads worst-last without the layout having to say
 * so twice.
 *
 * ── EVERY AWARD SELF-SUPPRESSES ────────────────────────────────────────
 * A season nobody spent in has no efficiency winner, and a season whose worst
 * film still scored has no dessert. The composer omits them and this renders
 * what it is given, so the row is two cards or one rather than a card reading
 * "nobody".
 */
export function PayoutAwards({ awards }: { awards: PayoutAward[] }) {
  if (awards.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2>Awards</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {awards.map((a) => (
          <Card
            key={a.label}
            variant="flat"
            className={cn("gap-2.5", a.marquee && "border-2 border-foreground")}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="type-eyebrow text-eyebrow text-muted-foreground">
                {a.label}
              </span>
              {a.isMe && <Badge variant="ink">You</Badge>}
            </div>

            <div className="flex items-center gap-2.5">
              <PlayerAvatar
                id={a.holderProfileId}
                name={a.holder}
                isMe={a.isMe}
                className="size-7"
              />
              <Link
                href={`/players/${a.holderProfileId}`}
                className="truncate text-h3 hover:underline"
              >
                {a.holder}
              </Link>
            </div>

            <span className="type-numeral text-h2">{a.value}</span>
            <span className="type-body text-micro text-muted-foreground">
              {a.detail}
            </span>
          </Card>
        ))}
      </div>
    </section>
  );
}
