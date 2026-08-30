"use client";

import { ErrorScreen } from "@/components/error-screen";

/** The list is entirely read, and the one thing a reader might fear on a page
 *  of notices is that they have missed one. Say that nothing was posted into
 *  the void — the posts are there, the page could not fetch them. */
export default function AnnouncementsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="The announcements didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      Nothing has been lost or unposted — this page could not read the list.
      Every announcement was emailed when it went up, so nothing is only here.
      Try again.
    </ErrorScreen>
  );
}
