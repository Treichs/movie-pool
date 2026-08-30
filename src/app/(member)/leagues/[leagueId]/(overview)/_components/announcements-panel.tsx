import Link from "next/link";

import { TextLink } from "@/components/text-link";
import { Card } from "@/components/ui/card";
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
    <Card variant="flat" size="sm" className="gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-eyebrow text-eyebrow text-muted-foreground">
          Announcements
        </h2>
        <TextLink
          href={`/leagues/${leagueId}/announcements`}
          size="micro"
        >
          All of them
        </TextLink>
      </div>
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
    </Card>
  );
}
