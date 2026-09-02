"use client";

import { useActionState, useId, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
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
  displayName,
  bio,
}: {
  displayName: string;
  bio: string | null;
}) {
  const nameId = useId();
  const bioId = useId();
  const [name, setName] = useState(displayName);
  const [text, setText] = useState(bio ?? "");
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null,
  );

  const dirty = name !== displayName || text !== (bio ?? "");

  return (
    <section
      aria-labelledby="profile-heading"
      className="flex flex-col gap-3.5"
    >
      <h2 id="profile-heading">Profile</h2>

      {/* A FLAT CARD, WHICH SIGN-IN AND EMAIL ALREADY HAD AND THIS DID NOT.
          With the sections stacked in one narrow column the difference did not
          show; in a panel that fills the page it did — two fields floating on
          bare paper had nothing bounding them, so the panel read as unfinished
          rather than as spacious. The card holds data, so it is FLAT: the
          app's elevation rule spends lift on artifacts, never on forms. */}
      <Card variant="flat">
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

          {/* NO AVATAR BESIDE THE FIELDS, since 2026-09-02. It was orientation on a
            page that had none, and the rail now carries the same circle over the
            same name three inches to the left. It also cost the form its column:
            an 80px mark and its gap indented every label 101px past the section
            heading and past the left edge of every card below, which is exactly
            the ragged column this app's own Tabular Rule calls a defect. It
            never previewed anything either — the mark is keyed to the profile
            id, so it could not change with the name being typed. */}
          {/* EACH FIELD TAKES A MEASURE, NOT THE PANEL'S WIDTH. The panel now
            fills what the rail leaves, which is right for the sign-in and email
            ROWS and wrong for a text field: a display name is about twenty
            characters and an 800px box for it reads as a mistake. Both caps are
            the app's own `ch` tokens used for what they are for — tight for a
            name, default for the sentence of prose the bio actually is. */}
          <div className="flex flex-col gap-5">
            <FieldGroup className="grow *:data-[slot=field]:max-w-measure-default">
              <Field
                data-invalid={
                  state && !state.ok && state.field === "display_name"
                    ? true
                    : undefined
                }
              >
                <FieldLabel htmlFor={nameId}>Display name</FieldLabel>
                <Input
                  id={nameId}
                  name="display_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  aria-describedby={`${nameId}-warning`}
                  className="max-w-measure-tight"
                />
                <FieldDescription id={`${nameId}-warning`}>
                  Changing this re-labels your whole history at once — the
                  standings, every past season, every record you hold.
                </FieldDescription>
                {state && !state.ok && state.field === "display_name" && (
                  <FieldError>{state.error}</FieldError>
                )}
              </Field>

              <Field
                data-invalid={
                  state && !state.ok && state.field === "bio" ? true : undefined
                }
              >
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
          <div className="flex">
            <SubmitButton pendingLabel="Saving…" disabled={!dirty}>
              Save profile
            </SubmitButton>
          </div>
        </form>
      </Card>
    </section>
  );
}
