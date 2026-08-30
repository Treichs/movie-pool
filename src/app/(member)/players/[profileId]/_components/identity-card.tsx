import { CalendarIcon } from "lucide-react";

import { TextLink } from "@/components/text-link";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatMonthYear } from "@/lib/format";
import type { PlayerProfile } from "@/lib/player-profile";

/**
 * WHO THIS IS — the card the board marks with the ink edge.
 *
 * ── THE INK SPINE IS THE MARK'S MOTIF, NOT A DECORATION ───────────────────
 * Board 2.4 draws an 8px ink bar down the left of this card and of no other
 * card in the app. It is the ticket stub the brand is built on, spent once, on
 * the one card that stands for a person.
 *
 * ── THE BIO IS READ-ONLY HERE, AND THAT IS A CHANGE FROM THE PLAN ─────────
 * The plan had this screen own bio editing, because it was written when this
 * screen came before `/account`. The re-order put `/account` first and it now
 * has a Profile section that edits the display name and the bio together. Two
 * editors for one field is the duplication this project keeps removing, so
 * this page shows the bio and points its owner at the one place that changes
 * it. `isMe` is still used — to offer the link, not to grow a second form.
 */
export function IdentityCard({ profile }: { profile: PlayerProfile }) {
  const since = formatMonthYear(profile.memberSince.slice(0, 10));

  return (
    <Card variant="flat" className="flex-row gap-0 overflow-hidden p-0">
      <div aria-hidden className="w-2 shrink-0 bg-foreground" />

      <div className="flex grow flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
        <PlayerAvatar
          id={profile.profileId}
          name={profile.displayName}
          className="size-24"
        />

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1>{profile.displayName}</h1>
            {profile.isMe && <Badge variant="ink">You</Badge>}
          </div>

          {profile.bio ? (
            <p className="type-dek max-w-measure-tight text-dek text-muted-foreground">
              {profile.bio}
            </p>
          ) : (
            profile.isMe && (
              <p className="type-body text-ui text-muted-foreground">
                You have not written a bio yet.{" "}
                <TextLink href="/account">Add one</TextLink>.
              </p>
            )
          )}

          <div className="flex flex-wrap items-center gap-2">
            <CalendarIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="type-micro text-micro text-muted-foreground">
              In the pool since {since}
              {profile.sharedLeagues.length > 0 &&
                ` · ${profile.sharedLeagues.join(" · ")}`}
            </span>
          </div>

          {profile.isMe && profile.bio && (
            <span className="type-micro text-micro text-muted-foreground">
              <TextLink href="/account" size="micro">
                Edit your name and bio
              </TextLink>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
