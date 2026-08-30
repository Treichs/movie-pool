"use client";

import { useParams } from "next/navigation";

import { ErrorScreen } from "@/components/error-screen";

/**
 * THE EDIT BOUNDARY SAYS TWO THINGS, AND BOTH MATTER.
 *
 * The post is untouched — an edit is one RPC that either ran or did not, and a
 * boundary here means the page failed, not the write. And any unsaved change
 * is gone, because the form holds it in component state and a boundary
 * replaces the component.
 *
 * Reassuring a commissioner that their edit "may have saved" is worse than
 * either fact: they would neither retype it nor trust what is on the page.
 */
export default function EditAnnouncementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { leagueId, announcementId } = useParams<{
    leagueId: string;
    announcementId: string;
  }>();

  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="The editor didn't load"
      back={{
        href: `/leagues/${leagueId}/announcements/${announcementId}`,
        label: "Back to the announcement",
      }}
      resetLabel="Try again"
    >
      The announcement itself is unchanged — nothing was saved. Anything you
      had edited is gone, though: a change lives only in this page until you
      save it.
    </ErrorScreen>
  );
}
