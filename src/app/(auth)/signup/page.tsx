import { redirect } from "next/navigation";

import { AuthSplitShell } from "@/components/auth-split-shell";
import { SIGNED_IN_LANDING, safeNextPath } from "@/lib/landing";
import { createClient } from "@/lib/supabase/server";

import { ConfirmationNotice } from "./confirmation-notice";
import { SignUpForm } from "./signup-form";
import { SignUpInk } from "./signup-ink";

export const metadata = { title: "Create an account" };

/**
 * The same shape as `/login` (ADR-435), one address over: redirect anyone
 * already signed in, honour a validated `next` over the ordinary landing rule,
 * and round-trip that destination through every link that leaves the page.
 *
 * ── `?resend=` IS A SECOND ENTRANCE, NOT A DECORATION ─────────────────────
 * The sign-in form links here when an account exists but has never confirmed
 * its email — the one state a person cannot escape alone, since sign-in and
 * password reset both refuse an unconfirmed address. Carrying the address in
 * the URL is what saves them retyping it. They already HAVE an account, so this
 * renders the confirmation panel rather than the form.
 *
 * THE PARAMETER IS VALIDATED BEFORE IT IS ECHOED. React escapes it, so this is
 * not about markup; it is about not printing "Sent to <whatever a link put in
 * the query string>" as though the app had sent it. Anything that is not an
 * address is ignored and the ordinary form renders.
 */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; resend?: string }>;
}) {
  const { next, resend } = await searchParams;
  const safeNext = safeNextPath(next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(safeNext ?? SIGNED_IN_LANDING);

  const resendEmail = resend?.trim().toLowerCase();
  const awaitingConfirmation =
    resendEmail && EMAIL.test(resendEmail) ? resendEmail : null;

  // THE DESTINATION SURVIVES THE HOP BACK TO SIGN-IN. Someone who followed an
  // invitation, has no account, and then realises they do is the case this
  // exists for.
  const signInHref = safeNext
    ? `/login?next=${encodeURIComponent(safeNext)}`
    : "/login";

  return (
    // `<main>` WRAPS THE WHOLE SHELL, for the reason `/login`'s page records:
    // the ink pane's perforations are aria-hidden but its wordmark and the
    // three beats are real text, and a landmark drawn around the form alone
    // would leave them in no region at all.
    <main>
      <AuthSplitShell variant="field" inkLayout="strip" ink={<SignUpInk />}>
        {awaitingConfirmation ? (
          <ConfirmationNotice
            email={awaitingConfirmation}
            notice="This account still needs its email confirmed. We sent a link when it was created — if it never arrived, ask for another."
          />
        ) : (
          <SignUpForm next={safeNext ?? undefined} signInHref={signInHref} />
        )}
      </AuthSplitShell>
    </main>
  );
}
