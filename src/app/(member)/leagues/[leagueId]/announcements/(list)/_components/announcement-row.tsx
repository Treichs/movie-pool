import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { initialsFrom, relativeDay } from "@/lib/format";
import type { LeagueAnnouncement } from "@/lib/league";

/**
 * ONE POST IN THE LIST — board 4.5.
 *
 * ── THE WHOLE CARD IS THE LINK, AND THE TITLE CARRIES IT ────────────────
 * The heading is the anchor rather than a stretched overlay: this card has no
 * control inside it, so there is nothing an absolutely-positioned link would
 * be protecting, and a real heading link is what a screen reader's link list
 * needs to be useful.
 *
 * ── NO UNREAD MARK, BECAUSE THERE IS NO READ STATE ──────────────────────
 * Board 4.5 gives an unread post an ink left edge and a vermilion dot.
 * `league_announcements` has no `read_at` and no reads table exists, so every
 * post renders the same. Faking it — "posted in the last week", say — would be
 * wrong for anyone who read it yesterday, which is most people.
 *
 * ── THE BODY IS CLAMPED, NOT TRUNCATED IN THE DATA ──────────────────────
 * The composer returns the whole body because the detail page needs it. Two
 * lines here is a CSS decision, so the excerpt never cuts mid-word and the
 * same text serves both screens.
 */
export function AnnouncementRow({
  announcement,
  leagueId,
}: {
  announcement: LeagueAnnouncement;
  leagueId: string;
}) {
  return (
    <Card variant="flat" className="gap-2">
      <h3>
        <Link
          href={`/leagues/${leagueId}/announcements/${announcement.id}`}
          className="hover:underline"
        >
          {announcement.title}
        </Link>
      </h3>

      {announcement.body && (
        <p className="type-body line-clamp-2 text-ui text-muted-foreground">
          {announcement.body}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Avatar className="size-5.5 rounded">
          <AvatarFallback className="type-micro rounded bg-muted text-micro">
            {initialsFrom(announcement.authorName ?? "?")}
          </AvatarFallback>
        </Avatar>
        <span className="type-body text-micro text-muted-foreground">
          {announcement.authorName ?? "A commissioner"} ·{" "}
          {relativeDay(announcement.at)}
        </span>
      </div>
    </Card>
  );
}
