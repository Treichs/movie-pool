import { redirect } from "next/navigation";

import { AuthSplitShell } from "@/components/auth-split-shell";
import { SIGNED_IN_LANDING, safeNextPath } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";

import { SignInForm } from "./sign-in-form";
import { SignInInk } from "./sign-in-ink";

export const metadata = { title: "Sign in" };

/**
 * SIGN-IN'S OWN ADDRESS (ADR-435).
 *
 * Until this file existed every sign-in reference in the app pointed at a 404 —
 * `requireUser`, the proxy's signed-out bounce, `signOut`, the OAuth-start and
 * OAuth-callback failures, the dead-email-link path, and the signup and
 * forgot-password back-links all target `/login`.
 *
 * ── THE ERROR CODES ARE BEHAVIOUR, NOT DECORATION ─────────────────────────
 * `link` needs its own entry rather than falling through to the OAuth copy:
 * `/auth/confirm` sends EVERY dead email link to `/login?error=link` — expired
 * (they last an hour), already used, or malformed — and telling someone whose
 * confirmation link went stale that "Google sign-in didn't complete" sends them
 * looking in entirely the wrong place.
 */
const AUTH_ERRORS: Record<string, string> = {
  oauth: "Google sign-in didn’t complete. Please try again.",
  link: "That link has expired or was already used. Sign in to send a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const safeNext = safeNextPath(next);

  // SIGNED IN ALREADY? An explicit, validated `next` wins over the ordinary
  // landing destination (ADR-443), because it means the visitor asked for a
  // specific page and was bounced on the way.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(safeNext ?? SIGNED_IN_LANDING);

  // Unknown codes fall back to the OAuth copy, which is where every code but
  // `link` comes from.
  const urlError = error ? (AUTH_ERRORS[error] ?? AUTH_ERRORS.oauth) : undefined;

  // THE DESTINATION SURVIVES THE HOP TO SIGNUP. Someone who followed an
  // invitation and has no account is the COMMON case for that link.
  const signUpHref = safeNext
    ? `/signup?next=${encodeURIComponent(safeNext)}`
    : "/signup";

  return (
    // `<main>` WRAPS THE WHOLE SHELL, and it has to come from here: the root
    // layout renders none and `AuthSplitShell` renders only divs.
    //
    // OUTSIDE the shell rather than inside the content pane, which is the
    // narrower-looking and wronger choice. The ink pane is NOT decorative — its
    // perforation columns are aria-hidden, but its wordmark and the scoring
    // rule are real text in the accessibility tree. A landmark drawn around the
    // form alone would leave that content in no region at all.
    <main>
      <AuthSplitShell variant="field" inkLayout="cell" ink={<SignInInk />}>
        <SignInForm
          next={safeNext ?? undefined}
          signUpHref={signUpHref}
          urlError={urlError}
        />
      </AuthSplitShell>
    </main>
  );
}
