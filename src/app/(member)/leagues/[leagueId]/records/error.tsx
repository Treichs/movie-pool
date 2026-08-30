"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Nothing in the record book is stored — it is derived on every render — so
 *  the reassurance is unusually literal here: there is no record to have been
 *  lost, only a page that could not add one up. */
export default function RecordsError({
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
      title="The record book didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      No record has been lost — the book is worked out fresh every time it is
      opened, from results that have not moved. Try again.
    </ErrorScreen>
  );
}
