"use client";

import { ErrorScreen } from "@/components/error-screen";

/**
 * THE BID SLATE'S BOUNDARY, and the last one still writing its own frame.
 *
 * IT NAMES WHAT IS SAFE. On this screen the player's fear is specific and
 * expensive: bids are money and the deadline is running. Saying nothing was
 * submitted is the whole job of this copy, and it is the only part of the file
 * that should ever have differed from the other twelve.
 */
export default function BidError({
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
      title="This week didn't load"
    >
      Nothing was submitted and no bid changed. Try again &mdash; if it keeps
      failing, the week board still shows where the season stands.
    </ErrorScreen>
  );
}
