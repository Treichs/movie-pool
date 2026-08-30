"use client";

import { ErrorScreen } from "@/components/error-screen";

/** The list is entirely read, and the one thing a reader might fear on a page
 *  of notices is that they have missed one. Say the posts are still there.
 *
 *  An earlier draft reassured them that "every announcement was emailed when
 *  it went up, so nothing is only here" — which is false. Nothing emails an
 *  announcement; this page IS the only place they live, which makes the
 *  reassurance the opposite of true. */
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
      Nothing has been lost or unposted — every announcement is still there,
      and this page could not read them. Try again.
    </ErrorScreen>
  );
}
