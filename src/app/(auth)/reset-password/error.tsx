"use client";

import { ErrorScreen } from "@/components/error-screen";

/** A recovery link is single-use and this page cannot tell whether it was spent, so the copy refuses to guess and offers the safe move instead. */
export default function ResetPasswordError({
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
      title="This page didn't load"
      back={{ href: "/forgot-password", label: "Send a new link" }}
    >
      We cannot tell from here whether your link was used, so treat it as spent. Your password has not changed unless you saw it confirmed. Requesting a new link is safe either way.
    </ErrorScreen>
  );
}
