"use client";

import { ErrorScreen } from "@/components/error-screen";

/** This page reads a league's own record of a film — bids, owners, a score
 *  somebody entered. Saying that none of it moved is the reassurance worth
 *  giving on a page full of other people's money. */
export default function LeagueFilmError({
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
      title="This film's record didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      No bid, owner or score has changed — this page only reads them. Try
      again.
    </ErrorScreen>
  );
}
