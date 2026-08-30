"use client";

import { useActionState, useId, useState } from "react";

import { GoogleMark } from "@/components/google-mark";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { changeEmail, changePassword } from "../actions";

/**
 * SIGN-IN — the address, the password, and what is linked.
 *
 * ── BOTH CHANGES RE-PROVE THE CURRENT PASSWORD, AND THAT IS THE SECTION ───
 * Changing the address moves where every future reset link lands; changing the
 * password ends every other session. Both are account-takeover primitives
 * available to anyone at an unlocked laptop with a live session, so both ask
 * for the current password first. `src/lib/reauth.ts` was written for this and
 * records why neither of Supabase's own mechanisms is usable here.
 *
 * ── THE FORMS ARE CLOSED UNTIL ASKED FOR ──────────────────────────────────
 * Board 4.10 draws two rows with a button each, not two open forms. Changing an
 * address is rare and dangerous; a password field sitting open on a settings
 * page invites a browser to fill it. Each row opens its own form in place.
 *
 * ── LINKED PROVIDERS ARE READ FROM THE SESSION ────────────────────────────
 * Supabase owns which identities are attached. A copy of that in `profiles`
 * would be a second answer able to disagree with the one that actually gates
 * sign-in.
 */
function Row({
  title,
  detail,
  actionLabel,
  open,
  onToggle,
  children,
}: {
  title: React.ReactNode;
  detail: React.ReactNode;
  actionLabel: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card variant="flat" size="sm" className="gap-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="type-h3 text-ui">{title}</span>
          <span className="type-body text-micro text-muted-foreground">
            {detail}
          </span>
        </div>
        <Button variant="outline" onClick={onToggle} aria-expanded={open}>
          {open ? "Cancel" : actionLabel}
        </Button>
      </div>
      <Collapsible open={open}>
        <CollapsibleContent>
          <div className="pt-4">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  return state.notice ? (
    <Alert role="status">
      <AlertDescription>{state.notice}</AlertDescription>
    </Alert>
  ) : null;
}

export function SignInSection({
  email,
  confirmed,
  providers,
}: {
  email: string;
  confirmed: boolean;
  providers: string[];
}) {
  const [openRow, setOpenRow] = useState<"email" | "password" | null>(null);
  const emailId = useId();
  const currentId = useId();
  const currentId2 = useId();
  const nextId = useId();
  const confirmId = useId();

  const [emailState, emailAction] = useActionState<ActionResult | null, FormData>(
    changeEmail,
    null
  );
  const [pwState, pwAction] = useActionState<ActionResult | null, FormData>(
    changePassword,
    null
  );

  const hasGoogle = providers.includes("google");
  const identityLine = [
    confirmed ? "Confirmed" : "Not confirmed yet",
    hasGoogle ? "also linked to Google" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-labelledby="signin-heading" className="flex flex-col gap-3.5">
      <h2 id="signin-heading">Sign-in</h2>

      <div className="flex flex-col gap-3">
        <Row
          title={
            <span className="flex flex-wrap items-center gap-2">
              {email}
              {hasGoogle && <GoogleMark className="size-3.5" />}
            </span>
          }
          detail={identityLine}
          actionLabel="Change email"
          open={openRow === "email"}
          onToggle={() => setOpenRow(openRow === "email" ? null : "email")}
        >
          <form action={emailAction} className="flex flex-col gap-4">
            <Result state={emailState} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={emailId}>New email address</FieldLabel>
                <Input
                  id={emailId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
                <FieldDescription>
                  It is not live until you open the link we send there. Until
                  then, {email} still signs you in.
                </FieldDescription>
                {emailState && !emailState.ok && emailState.field === "email" && (
                  <FieldError>{emailState.error}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={currentId}>Current password</FieldLabel>
                <PasswordInput
                  id={currentId}
                  name="current_password"
                  autoComplete="current-password"
                  required
                />
                {emailState &&
                  !emailState.ok &&
                  emailState.field === "current_password" && (
                    <FieldError>{emailState.error}</FieldError>
                  )}
              </Field>
            </FieldGroup>
            <div className="flex">
              <SubmitButton pendingLabel="Sending…">
                Send the confirmation
              </SubmitButton>
            </div>
          </form>
        </Row>

        <Row
          title="Password"
          detail="Changing it signs out every other device."
          actionLabel="Change password"
          open={openRow === "password"}
          onToggle={() =>
            setOpenRow(openRow === "password" ? null : "password")
          }
        >
          <form action={pwAction} className="flex flex-col gap-4">
            <Result state={pwState} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={currentId2}>Current password</FieldLabel>
                <PasswordInput
                  id={currentId2}
                  name="current_password"
                  autoComplete="current-password"
                  required
                />
                {pwState &&
                  !pwState.ok &&
                  pwState.field === "current_password" && (
                    <FieldError>{pwState.error}</FieldError>
                  )}
              </Field>
              <Field>
                <FieldLabel htmlFor={nextId}>New password</FieldLabel>
                <PasswordInput
                  id={nextId}
                  name="password"
                  autoComplete="new-password"
                  required
                />
                <FieldDescription>At least 8 characters.</FieldDescription>
                {pwState && !pwState.ok && pwState.field === "password" && (
                  <FieldError>{pwState.error}</FieldError>
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor={confirmId}>
                  New password again
                </FieldLabel>
                <PasswordInput
                  id={confirmId}
                  name="confirm"
                  autoComplete="new-password"
                  required
                />
                {pwState && !pwState.ok && pwState.field === "confirm" && (
                  <FieldError>{pwState.error}</FieldError>
                )}
              </Field>
            </FieldGroup>
            <div className="flex">
              <SubmitButton pendingLabel="Changing…">
                Change password
              </SubmitButton>
            </div>
          </form>
        </Row>
      </div>
    </section>
  );
}
