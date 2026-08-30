"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * WRITING AND EDITING AN ANNOUNCEMENT.
 *
 * Both live at the announcements SEGMENT root because two routes share them:
 * `new/` posts and `[announcementId]/edit/` updates, through one form.
 *
 * ── THE AUTHZ IS THE RPC'S, IN BOTH DIRECTIONS ──────────────────────────
 * `post_league_announcement` and `update_league_announcement` are both
 * `SECURITY DEFINER` and both refuse anyone who is not a commissioner of the
 * league in question — the update resolves the league from the announcement id
 * itself, so there is no league parameter a caller could point elsewhere. The
 * pages hide the forms; the database is what refuses the request.
 *
 * ── THE CAPS ARE RESTATED, NOT REIMPLEMENTED ────────────────────────────
 * 120 and 8000 are the RPC's, checked here only so a commissioner is told
 * before they submit rather than after. The database still enforces them, and
 * if the two ever disagree the database wins — which is why these read as
 * "tell them early", not as validation.
 *
 * ── NEITHER REDIRECTS ───────────────────────────────────────────────────
 * A `redirect()` thrown inside a server action is control flow the caller
 * cannot distinguish from a failure, and it would take the error message with
 * it. Both return; the form navigates.
 */

const TITLE_MAX = 120;
const BODY_MAX = 8000;

/** What both forms send, validated once. */
function read(formData: FormData): ActionResult<{ title: string; body: string }> {
  const title = String(formData.get("title") ?? "").trim();
  // A BROWSER SUBMITS A TEXTAREA WITH CRLF. The HTML spec normalises every
  // newline in a form submission to \r\n, so a body typed in the app and one
  // written by the seed script would be stored differently and compare unequal
  // — which is exactly what the edit form's "nothing has changed yet" test
  // does. `pre-line` renders either, so this is about the data, not display.
  const body = String(formData.get("body") ?? "")
    .replace(/\r\n/g, "\n")
    .trim();

  // The RPC's own rule: one of the two has to carry the message. A title-only
  // announcement is ordinary; an empty one is not an announcement.
  if (!title && !body) {
    return fail("An announcement needs something to say.", "title");
  }
  if (title.length > TITLE_MAX) {
    return fail(`A title is limited to ${TITLE_MAX} characters.`, "title");
  }
  if (body.length > BODY_MAX) {
    return fail(
      `An announcement is limited to ${BODY_MAX.toLocaleString("en-US")} characters.`,
      "body"
    );
  }
  return ok({ title, body });
}

export async function postAnnouncement(
  _prev: ActionResult<{ id: string }> | null,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) return fail("Which league is this for?");

  const parsed = read(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_league_announcement", {
    p_league_id: leagueId,
    p_body: parsed.data.body || null,
    p_title: parsed.data.title || null,
  });
  if (error) return fail(error.message);

  // The list, the post's own page and League Home's rail all show this.
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return ok({ id: data as string }, "Announcement posted.");
}

export async function updateAnnouncement(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const announcementId = String(formData.get("announcementId") ?? "");
  if (!leagueId || !announcementId) return fail("Which announcement is this?");

  const parsed = read(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_league_announcement", {
    p_id: announcementId,
    p_body: parsed.data.body || null,
    p_title: parsed.data.title || null,
  });
  if (error) return fail(error.message);

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return ok(undefined, "Announcement updated.");
}
