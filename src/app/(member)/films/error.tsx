"use client";

import { ErrorScreen } from "@/components/error-screen";

/** The index is one read of the viewer's own leagues — no third-party API in
 *  it, unlike the film page below it, so a failure here is ours. The child
 *  segment keeps its own boundary, which still wins for `/films/[tmdbId]`. */
export default function FilmsError({
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
      title="Your films didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      Nothing was lost — this page only reads. Try again, and if it keeps
      failing the films are still reachable from each week&rsquo;s board.
    </ErrorScreen>
  );
}
