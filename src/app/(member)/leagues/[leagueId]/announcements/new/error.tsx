"use client";

import { useParams } from "next/navigation";

import { ErrorScreen } from "@/components/error-screen";

/**
 * A COMPOSE SCREEN'S BOUNDARY HAS TO SAY WHAT HAPPENED TO THE DRAFT.
 *
 * It says the draft is gone, and that is not hedging — it is the truth. The
 * form holds its title and body in component state, and a boundary REPLACES
 * the component: whatever was typed went with it, and `Try again` remounts an
 * empty form rather than restoring one. Nothing is written to the database
 * until Post, so there is no half-posted announcement either.
 *
 * The alternative — "your draft may have been saved" — is the reassurance the
 * task warns against, and a commissioner who believed it would go looking for
 * a post that does not exist.
 */
export default function NewAnnouncementError({
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
      title="The composer didn't load"
      back={{
        href: `/leagues/${leagueId}/announcements`,
        label: "All announcements",
      }}
      resetLabel="Start again"
    >
      Nothing was posted, and anything you had typed is gone — a draft lives
      only in this page until you post it. Starting again gives you an empty
      form.
    </ErrorScreen>
  );
}
