import Link from "next/link";

import { TextLink } from "@/components/text-link";
import { Card } from "@/components/ui/card";
import { relativeDay } from "@/lib/format";
import type { LeagueAnnouncement } from "@/lib/league";

/**
 * THE TWO MOST RECENT, with the newest given the ink edge. Omitted entirely
 * when a league has never posted one — an empty "Announcements" heading is a
 * promise the league has not made.
 *
 * ── A BAND UNDER THE THREAD, NOT A PANEL IN THE FRAME ────────────────────
 * Announcements are news: the same "what is true now" register as the live
 * season above them, not the record the frame reports. Inside the frame they
 * were the one panel that could be absent, which forced the archive beside
 * them to change width whenever a league had nothing to say. Out here the
 * band comes and goes on its own and every row in the frame keeps one shape.
 * Settled 2026-09-17.
 */
export function AnnouncementsPanel({
  announcements,
  leagueId,
}: {
  announcements: LeagueAnnouncement[];
  leagueId: string;
}) {
  if (announcements.length === 0) return null;

  return (
    <Card
      variant="flat"
      role="region"
      aria-labelledby="announcements-heading"
      className="gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="announcements-heading" className="type-h2 text-h3">
          Announcements
        </h2>
        <TextLink href={`/leagues/${leagueId}/announcements`} size="micro">
          All of them
        </TextLink>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    </Card>
  );
}
