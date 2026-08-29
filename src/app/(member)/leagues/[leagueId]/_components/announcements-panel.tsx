import Link from "next/link";

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
    <div className="flex flex-col gap-3 rounded border bg-card p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-eyebrow text-eyebrow text-muted-foreground">
          Announcements
        </h2>
        <Link
          href={`/leagues/${leagueId}/announcements`}
          className="type-micro text-micro text-link underline underline-offset-4"
        >
          All of them
        </Link>
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
    </div>
  );
}
