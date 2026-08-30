"use client";

import { ErrorScreen } from "@/components/error-screen";

/** The catalog page is entirely read, and two of its reads are somebody else's
 *  API. "TMDB is having a moment" is the likely cause, which is worth saying
 *  plainly — it is the one failure here that fixes itself. */
export default function FilmError({
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
      title="This film didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      Nothing in your league has changed — no bid, no score, no standing. This
      page reads the film from TMDB and OMDb, and one of them did not answer.
      Try again.
    </ErrorScreen>
  );
}
