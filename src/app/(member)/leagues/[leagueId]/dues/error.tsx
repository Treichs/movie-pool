"use client";

import { ErrorScreen } from "@/components/error-screen";

/**
 * THIS SCREEN IS ABOUT REAL MONEY, SO THE COPY SAYS WHAT DID NOT HAPPEN.
 *
 * A boundary here means the page could not READ the ledger. No payment was
 * recorded, none was cleared, and no balance moved — and saying so is worth
 * more than any other reassurance on this page, because the alternative is a
 * commissioner wondering whether the "Mark paid" they pressed went through.
 *
 * (It could not have: marking paid returns a result and toasts, and a failed
 * write never reaches this boundary. But the reader does not know that, and
 * the sentence costs nothing.)
 */
export default function DuesError({
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
      title="The dues ledger didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      No payment was recorded or cleared, and no balance has changed — this
      page only reads them. Try again.
    </ErrorScreen>
  );
}
