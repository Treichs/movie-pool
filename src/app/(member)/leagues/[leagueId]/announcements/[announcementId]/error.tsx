"use client";

import { useParams } from "next/navigation";

import { ErrorScreen } from "@/components/error-screen";

/**
 * ONE POST'S OWN FAILURE.
 *
 * The parent boundary at `announcements/error.tsx` would already catch this,
 * but it says "The announcements didn't load" and offers the league list —
 * both wrong here. A reader who followed a link to one post wants that post,
 * and the thing they can usefully do next is go back to the list, which is one
 * segment up rather than three.
 *
 * `useParams` is how a boundary learns which league it failed in; `error.tsx`
 * is a client component and is handed no params of its own.
 */
export default function AnnouncementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { leagueId } = useParams<{ leagueId: string }>();

  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="This announcement didn't load"
      back={{
        href: `/leagues/${leagueId}/announcements`,
        label: "All announcements",
      }}
    >
      It has not been deleted or edited — this page could not read it. Try
      again.
    </ErrorScreen>
  );
}
