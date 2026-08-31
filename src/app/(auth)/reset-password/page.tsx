import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthSplitShell } from "@/components/auth-split-shell";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { hasRecoveryMark } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Choose a new password" };

/** The brand marker on a screen whose only other brand element is the rail. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="type-eyebrow text-eyebrow text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * `/reset-password` — where a recovery link lands after `/auth/confirm` has
 * exchanged its token for a session. The rail, like `/forgot-password`: this is
 * an interruption reached from an email, not a place anyone arrives.
 *
 * ── THE NO-SESSION STATE IS THIS PAGE'S REASON FOR BEING PUBLIC ───────────
 * `PUBLIC_PATHS` lists `/reset-password`, and the note there says why: the link
 * USUALLY arrives with a session, because the callback just made one — but not
 * when the exchange failed, not when the link was already spent, and not when
 * it was opened in a browser the cookie never reached. A gate would answer
 * every one of those with a redirect to sign-in, which is the screen a person
 * who has forgotten their password cannot use.
 *
 * SO THE CHECK IS HERE, BEFORE THE FORM, not inside it. Discovering a dead link
 * only after typing a password twice is the version of this screen that wastes
 * someone's time at the moment they have least patience for it. The board draws
 * only the signed-in state; a board cannot draw a session that is missing.
 *
 * ── KNOWN GAP, RAISED RATHER THAN QUIETLY CLOSED ──────────────────────────
 * An ORDINARY signed-in session reaches this form too, and can set a new
 * password without knowing the old one. `src/lib/reauth.ts` exists for exactly
 * that class of problem and is the `/account` screen's tool (Task 20); whether
 * this route should additionally require a recovery-grade session is a policy
 * call for the developer, not something to invent inside a screen task.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A SESSION IS NOT ENOUGH TO REACH THIS SCREEN (decided 2026-08-31, closing
  // the open question in the docstring above).
  //
  // This form sets a password without asking for the old one. `/account` does
  // ask, and says why — a password change signs out every other session, so
  // both it and the email change are account-takeover vectors. An ordinary
  // signed-in visitor reaching this page was therefore a way around that check,
  // one URL away from the door it protects.
  //
  // So a live session gets sent to the screen that WILL ask. Only the recovery
  // mark — set at `/auth/confirm` when a mailed `type=recovery` token verifies,
  // and nowhere else — opens this one. Someone who genuinely forgot their
  // password has no session at all and lands here from the link, unaffected.
  if (user && !(await hasRecoveryMark())) redirect("/account");

  return (
    // `<main>` WRAPS THE WHOLE SHELL, as on the other three auth screens.
    <main>
      <AuthSplitShell variant="rail">
        {user ? (
          <FieldGroup>
            <div className="flex flex-col gap-2">
              <Eyebrow>Signed in as {user.email}</Eyebrow>
              <h1 className="type-h1 text-h1">Choose a new password</h1>
              <p className="text-muted-foreground">
                This link is good once. Pick something you have not used here
                before.
              </p>
            </div>
            <ResetPasswordForm />
          </FieldGroup>
        ) : (
          <FieldGroup>
            <div className="flex flex-col gap-2">
              <Eyebrow>The Movie Pool</Eyebrow>
              <h1 className="type-h1 text-h1">This link has expired</h1>
              <p className="text-muted-foreground">
                Reset links last one hour and work once. Ask for a new one and
                your password stays as it is until you use it.
              </p>
            </div>

            {/* NAMES THE THIRD CAUSE, which is the one nobody guesses. The
                first two are in the paragraph above; this one is invisible
                from the inside and looks identical to an expired link. */}
            <Alert>
              <AlertTitle>Or the link was opened somewhere else</AlertTitle>
              <AlertDescription>
                Opening it in a different browser or on a different device can
                land here too. Requesting a new one fixes that as well.
              </AlertDescription>
            </Alert>

            {/* `nativeButton={false}` because this renders an `<a>`: Base UI
                logs an error otherwise, and it is right to — a link that
                claims button semantics breaks both forms and assistive tech.
                Same pattern as the landing page's calls to action. */}
            <Button
              variant="ink"
              render={<Link href="/forgot-password" />}
              nativeButton={false}
            >
              Send a new link
            </Button>

            <FieldDescription>
              <TextLink href="/login">Back to sign in</TextLink>
            </FieldDescription>
          </FieldGroup>
        )}
      </AuthSplitShell>
    </main>
  );
}
