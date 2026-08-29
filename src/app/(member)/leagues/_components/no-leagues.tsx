import Link from "next/link";

import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";

/**
 * BELONGING TO NOTHING — and for this person, this page is the entire product.
 *
 * It is the state the landing rule sends a brand-new account to, the state
 * `dev-outsider` is seeded in, and the state most likely to be built carelessly
 * because whoever builds it already has leagues. So it gets the page rather
 * than a line of grey text inside one: a heading that says what a league is,
 * the one action worth taking, and the reading for someone not ready to take it.
 *
 * THE CLOSING LINE IS CONDITIONAL, and finding out why cost a drive. It reads
 * "waiting on an invitation? it will appear here" — which is reassuring to
 * someone with nothing, and a flat contradiction to someone reading it directly
 * underneath the invitation they were just sent. `dev-outsider` is in exactly
 * that state, which is how it surfaced.
 */
export function NoLeagues({ awaitingInvite }: { awaitingInvite: boolean }) {
  return (
    <div className="flex flex-col items-start gap-5 rounded border-2 border-dashed px-8 py-10">
      <div className="flex max-w-measure-tight flex-col gap-2">
        <h2>You are not in a league yet</h2>
        <p className="text-muted-foreground">
          A league is a group of people playing one season together — your
          friends, your office, whoever argues with you about films. Someone
          runs it, everyone bids, the standings settle it.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          render={<Link href="/leagues/new" />}
          nativeButton={false}
          variant="ink"
        >
          Start a league
        </Button>
        <TextLink href="/how-it-works" size="ui">
          Read how it works first
        </TextLink>
      </div>
      {awaitingInvite && (
        <p className="type-micro text-micro text-muted-foreground">
          Waiting on an invitation? It will appear here the moment it is sent.
        </p>
      )}
    </div>
  );
}
