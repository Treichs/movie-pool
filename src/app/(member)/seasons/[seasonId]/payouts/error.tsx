"use client";

import { useParams } from "next/navigation";

import { ErrorScreen } from "@/components/error-screen";

/**
 * THE ONE THING A PAYOUTS BOUNDARY MUST SAY IS THAT NOTHING WAS PUBLISHED.
 *
 * Finalizing is irreversible and visible to the whole league, so a
 * commissioner who sees an error after pressing it needs to know which state
 * they are in. The answer is always "unchanged": every write here returns a
 * result and toasts, so a failed one never reaches this boundary — reaching it
 * means the page could not be READ.
 */
export default function PayoutsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { seasonId } = useParams<{ seasonId: string }>();

  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="The payouts didn't load"
      back={{ href: `/seasons/${seasonId}`, label: "Back to the season" }}
    >
      Nothing was generated, published or paid — this page only reads them, and
      a draft that existed still exists. Try again.
    </ErrorScreen>
  );
}
