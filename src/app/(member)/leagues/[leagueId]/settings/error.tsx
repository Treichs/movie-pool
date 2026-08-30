"use client";

import { useParams } from "next/navigation";

import { ErrorScreen } from "@/components/error-screen";

/**
 * A SETTINGS BOUNDARY HAS TO SAY NOTHING WAS APPLIED.
 *
 * This page changes a league's name, its rules for every future season, who
 * commissions it and who is in it. A reader who sees an error after pressing
 * something needs to know which of those took — and the answer is none: every
 * write here returns a result and toasts, so a failed one never reaches this
 * boundary. It means the page could not be READ.
 */
export default function SettingsError({
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
      title="The settings didn't load"
      back={{ href: `/leagues/${leagueId}`, label: "Back to the league" }}
    >
      Nothing was changed — no name, no rule, no role and no invitation. This
      page could not read them. Try again.
    </ErrorScreen>
  );
}
