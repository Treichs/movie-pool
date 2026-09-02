import Link from "next/link";

import { TextLink } from "@/components/text-link";
import { relativeDay } from "@/lib/format";
import type { LeagueAnnouncement } from "@/lib/league";

/** The two most recent, with the newest given the ink edge. The panel is
 *  omitted entirely when a league has never posted one — an empty
 *  "Announcements" heading is a promise the league has not made. */
export function AnnouncementsPanel({
  announcements,
  leagueId,
}: {
  announcements: LeagueAnnouncement[];
  leagueId: string;
}) {
  if (announcements.length === 0) return null;

  return (
    // The panel around this supplies the card, the heading and the region.
    <div className="flex flex-col gap-3">
      <TextLink href={`/leagues/${leagueId}/announcements`} size="micro">
        All of them
      </TextLink>
      {announcements.map((a, i) => (
        <Link
          key={a.id}
          href={`/leagues/${leagueId}/announcements/${a.id}`}
          className={`flex flex-col gap-0.5 border-l-3 pl-3 hover:bg-muted ${
            i === 0 ? "border-foreground" : "border-border"
          }`}
        >
          <span className={`text-ui ${i === 0 ? "type-h3" : "type-ui"}`}>
            {a.title}
          </span>
          <span className="type-micro text-micro text-muted-foreground">
            {a.authorName ?? "Someone"} · {relativeDay(a.at)}
          </span>
        </Link>
      ))}
    </div>
  );
}
