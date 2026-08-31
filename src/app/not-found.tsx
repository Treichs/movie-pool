import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata = { title: "Not found" };

/**
 * THE 404, WHICH UNTIL NOW WAS NEXT'S STOCK ONE.
 *
 * Black Helvetica on white, inside this app's own chrome, with no way back. It
 * is also the busiest error surface here, because `notFound()` is what every
 * gate in the app calls: a league you are not in, a week that does not exist,
 * and — since 2026-08-31 — every commissioner-only page viewed by a player.
 *
 * ── IT MUST COVER TWO DIFFERENT READERS, AND SAYS SO ──────────────────────
 * One mistyped an address or followed a stale link. The other is a member who
 * clicked something real that simply is not theirs — a settings page in a
 * league they do not commission. This page cannot tell them apart, and it must
 * not guess: naming permissions to the first reader is confusing, and naming a
 * typo to the second is wrong. So it names the two possibilities plainly and
 * lets the reader recognise their own.
 *
 * ── THE ACTION IS AN EXIT ─────────────────────────────────────────────────
 * PatternFly's "no access" guidance is the closest documented match: when the
 * user cannot act on this screen, the button's job is to "easily leave the page
 * and return to the dashboard, home page, or another main area". So the primary
 * control goes to `/leagues`, which is the one address every signed-in reader
 * can always open.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-measure-page flex-col justify-center p-6 md:p-8">
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>This page isn&apos;t here</EmptyTitle>
          <EmptyDescription>
            Either the address is wrong, or it belongs to a league you are not
            in — commissioner pages only open for the person running that
            league.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* `nativeButton={false}` because this renders an `<a>`: Base UI
              warns when a button-shaped control is not a real <button>. */}
          <Button nativeButton={false} render={<Link href="/leagues" />}>
            Go to your leagues
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
