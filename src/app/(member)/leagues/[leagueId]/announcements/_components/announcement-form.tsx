"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ok, type ActionResult } from "@/lib/action-result";

import { postAnnouncement, updateAnnouncement } from "../actions";

/**
 * ONE FORM, TWO ROUTES — board 4.6, and the edit screen that shares it.
 *
 * ── THE FIELDS ARE CONTROLLED, AND THAT IS NOT A PREFERENCE ─────────────
 * React resets an uncontrolled field when an action "succeeds", and a returned
 * validation error IS a success as far as the runtime is concerned. On a form
 * whose body may be eight thousand characters, that means one over-long title
 * silently empties the whole post. Controlled state is what makes a rejected
 * submit non-destructive.
 *
 * ── THE ACTION BAR IS THE ONE SHADOW IN THE LEAGUE SURFACES ─────────────
 * Board 4.6 says so explicitly: it is sticky, so it overlaps its own form, and
 * overlapping content is the only thing in this design that earns elevation.
 * Every other league panel is flat. (`--shadow-raised` does not exist in this
 * rebuild's theme — the board's value is Tailwind's `shadow-lg`, which is what
 * `popover` and `sheet` already use for the same reason.)
 *
 * ── NO EMAIL SWITCH ─────────────────────────────────────────────────────
 * The board draws "Email this to all nine members" and calls the title the
 * email subject. **Nothing emails an announcement** — `post_league_announcement`
 * writes a row and stops, and the notify cron has no fifth kind. Building the
 * switch would mean building the feature; that was decided against for now
 * (2026-08-30), so the switch is absent rather than inert and the helper text
 * says where a post actually goes.
 */

const CREATE_INITIAL: ActionResult<{ id: string }> = ok({ id: "" });
const EDIT_INITIAL: ActionResult = ok(undefined);

const TITLE_MAX = 120;
const BODY_MAX = 8000;

export function AnnouncementForm({
  leagueId,
  authorName,
  announcement,
}: {
  leagueId: string;
  /** Who is about to post, for the bar's "posting as" line. */
  authorName: string;
  /** Present when editing. Absent is the create form. */
  announcement?: { id: string; title: string; body: string | null };
}) {
  const editing = announcement !== undefined;
  const router = useRouter();
  const titleId = useId();
  const bodyId = useId();

  const [title, setTitle] = useState(announcement?.title ?? "");
  const [body, setBody] = useState(announcement?.body ?? "");

  const [createState, createAction] = useActionState(
    postAnnouncement,
    CREATE_INITIAL
  );
  const [editState, editAction] = useActionState(
    updateAnnouncement,
    EDIT_INITIAL
  );
  const state: ActionResult<unknown> = editing ? editState : createState;

  const listHref = `/leagues/${leagueId}/announcements`;

  // Report once per result. `useActionState` hands back the same object until
  // the next submit, so without this a re-render would toast again.
  const last = useRef<ActionResult<unknown>>(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;

    if (!state.ok) {
      toast.error(state.error);
      return;
    }
    if (state.notice) {
      toast.success(state.notice);
      router.push(
        editing
          ? `${listHref}/${announcement.id}`
          : `${listHref}/${(state.data as { id: string }).id}`
      );
    }
  }, [state, editing, announcement, listHref, router]);

  const problem = (field: string) =>
    !state.ok && state.field === field ? state.error : null;

  const unchanged =
    editing &&
    title.trim() === (announcement.title ?? "") &&
    body.trim() === (announcement.body ?? "");

  return (
    <form
      action={editing ? editAction : createAction}
      className="flex max-w-measure-wide flex-col gap-5"
    >
      <input type="hidden" name="leagueId" value={leagueId} />
      {editing && (
        <input type="hidden" name="announcementId" value={announcement.id} />
      )}

      <Field data-invalid={problem("title") ? true : undefined}>
        <FieldLabel htmlFor={titleId}>Title</FieldLabel>
        <Input
          id={titleId}
          name="title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Week 04 slate is up early"
        />
        {problem("title") ? (
          <FieldError>{problem("title")}</FieldError>
        ) : (
          <FieldDescription>
            One line. Leave it blank and the first line of the body becomes the
            title.
          </FieldDescription>
        )}
      </Field>

      <Field data-invalid={problem("body") ? true : undefined}>
        <FieldLabel htmlFor={bodyId}>Body</FieldLabel>
        <Textarea
          id={bodyId}
          name="body"
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-60"
          placeholder="What the league needs to know."
        />
        {problem("body") ? (
          <FieldError>{problem("body")}</FieldError>
        ) : (
          <FieldDescription>
            Plain text. Line breaks survive; nothing else is interpreted. It
            appears on the announcements page — nothing is emailed.
          </FieldDescription>
        )}
      </Field>

      {/* STICKY, AND THEREFORE SHADOWED. It overlaps the body it sits under,
          which is the one case this design elevates anything. */}
      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-4 rounded border-2 border-foreground bg-card px-4 py-3.5 shadow-lg">
        <span className="type-body text-micro text-muted-foreground">
          {editing ? "Editing as" : "Posting as"} {authorName} · commissioner
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={editing ? `${listHref}/${announcement.id}` : listHref}
              />
            }
          >
            Cancel
          </Button>
          <SubmitButton
            pendingLabel={editing ? "Saving…" : "Posting…"}
            // Nothing typed is nothing to post; nothing CHANGED is nothing to
            // save. Both are the same button telling the truth about itself.
            disabled={
              editing ? unchanged : title.trim() === "" && body.trim() === ""
            }
          >
            {editing ? "Save changes" : "Post it"}
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
