"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup } from "@/components/ui/field";

import { resendConfirmation } from "../actions";

/**
 * THE STATE AFTER SIGNING UP — and the state `/signup?resend=` lands in.
 *
 * ── IT IS A SCREEN, NOT A TOAST ───────────────────────────────────────────
 * Since `mailer_autoconfirm` was turned off on 2026-08-14 this is the ONLY way
 * into a new account: the form no longer returns a session, and both other
 * doors — sign-in and password reset — refuse an unconfirmed address. A message
 * that disappears on its own would be the only instruction a person ever got.
 * So it replaces the form entirely rather than sitting above it.
 *
 * ── WHY THE PAGE ALSO ROUTES HERE ─────────────────────────────────────────
 * `/login` sends anyone whose account exists but is unconfirmed to
 * `/signup?resend=<address>`. They already have an account, so handing them a
 * signup form would invite a second one; this is the panel they need, reached
 * from the other direction. One state, two entrances, and the `notice` prop is
 * the only thing that differs — the action's own wording on the way out of the
 * form, and a plainer line for someone arriving days later.
 *
 * The resend button is `type="button"`. There is no form around it here, but
 * the default is "submit" and a copy of this inside one would re-post it.
 * Disabled after a send so a second click cannot walk into Supabase's 60-second
 * `smtp_max_frequency` and report a failure for something that just worked.
 */
export function ConfirmationNotice({
  email,
  notice,
}: {
  email: string;
  notice: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <FieldGroup>
      <div className="flex flex-col gap-2">
        <h1 className="type-h1 text-h1">Check your email</h1>
        <p className="text-muted-foreground">{notice}</p>
      </div>

      {/* "The link goes to", NOT "sent to". Both entrances render this, and
          only one of them has just sent anything — someone arriving from
          `/login?…&resend=` days later would be told a mail had gone out that
          had not. This wording is true on both paths. */}
      <Alert role="status">
        <AlertDescription>
          The link goes to <span className="text-foreground">{email}</span>, and
          it lasts one hour.
        </AlertDescription>
      </Alert>

      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending || result !== null}
          onClick={() =>
            startTransition(async () => {
              setResult(await resendConfirmation(email));
            })
          }
        >
          {pending ? "Sending…" : "Send it again"}
        </Button>
        {/* The reply is the same whether or not the address has an account —
            see `resendConfirmation`, which explains why answering differently
            would be an account-enumeration oracle. */}
        {result && <FieldDescription role="status">{result}</FieldDescription>}
      </div>

      <FieldDescription>
        Confirmed already?{" "}
        <Link href="/login" className="text-link underline underline-offset-4">
          Sign in
        </Link>
      </FieldDescription>
    </FieldGroup>
  );
}
