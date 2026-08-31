"use client";

import { ErrorScreen } from "@/components/error-screen";

/** One read of this league's playings. The `[tmdbId]` segment below keeps its
 *  own boundary — that page also calls TMDB, and its failure has a different
 *  likely cause and a different sentence. */
export default function LeagueFilmsError({
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
      title="This league's films didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      Nothing was lost — this page only reads. Try again, or open the
      league and reach a film from the week it played in.
    </ErrorScreen>
  );
}
