"use client";

import { useActionState, useId, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlayerAvatar } from "@/components/player-avatar";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";

import { updateProfile } from "../actions";

/**
 * PROFILE — the avatar, the display name and the bio.
 *
 * ── THE DISPLAY-NAME WARNING IS THE POINT OF THIS SECTION ─────────────────
 * Board 4.10 draws it and it must survive: a display name is not a label on
 * this page, it is the label on the whole history. `league-records.ts` collapses
 * a renamed account into one career deliberately, which is what makes the
 * rename retroactive — every standing, every past season and every record
 * re-labels at once. Somebody changing a nickname deserves to know that before
 * they press save, not after.
 *
 * ── CONTROLLED INPUTS, AND THE REASON IS REACT 19 ─────────────────────────
 * When a form Action succeeds, React resets uncontrolled fields — and an action
 * that RETURNS a validation error has succeeded. Uncontrolled, a rejected save
 * would wipe what was typed. The auth screens hit this first and this is the
 * same fix.
 */
export function ProfileSection({
  profileId,
  displayName,
  bio,
}: {
  profileId: string;
  displayName: string;
  bio: string | null;
}) {
  const nameId = useId();
  const bioId = useId();
  const [name, setName] = useState(displayName);
  const [text, setText] = useState(bio ?? "");
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null
  );

  const dirty = name !== displayName || text !== (bio ?? "");

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-3.5">
      <h2 id="profile-heading">Profile</h2>

      <form action={formAction} className="flex flex-col gap-5">
        {state && !state.ok && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.ok && state.notice && (
          <Alert role="status">
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <PlayerAvatar
            id={profileId}
            name={displayName}
            className="size-20"
          />

          <FieldGroup className="grow">
            <Field data-invalid={state && !state.ok && state.field === "display_name" ? true : undefined}>
              <FieldLabel htmlFor={nameId}>Display name</FieldLabel>
              <Input
                id={nameId}
                name="display_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                aria-describedby={`${nameId}-warning`}
              />
              <FieldDescription id={`${nameId}-warning`}>
                Changing this re-labels your whole history at once — the
                standings, every past season, every record you hold.
              </FieldDescription>
              {state && !state.ok && state.field === "display_name" && (
                <FieldError>{state.error}</FieldError>
              )}
            </Field>

            <Field data-invalid={state && !state.ok && state.field === "bio" ? true : undefined}>
              <FieldLabel htmlFor={bioId}>Bio</FieldLabel>
              <Textarea
                id={bioId}
                name="bio"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={280}
                rows={3}
                placeholder="A line your league mates see on your player page."
              />
              <FieldDescription>
                {text.length} of 280 characters.
              </FieldDescription>
              {state && !state.ok && state.field === "bio" && (
                <FieldError>{state.error}</FieldError>
              )}
            </Field>
          </FieldGroup>
        </div>

        {/* Disabled until something changes: a save button that is always live
            invites a write that does nothing, and every one of those is a real
            round trip and a real revalidate of the whole signed-in tree. */}
        <div className="flex sm:pl-25">
          <SubmitButton pendingLabel="Saving…" disabled={!dirty}>
            Save profile
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
