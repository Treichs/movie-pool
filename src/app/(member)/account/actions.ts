"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { SITE_URL, sendEmail } from "@/lib/email";
import {
  emailChangeRequestedEmail,
  passwordChangedEmail,
} from "@/lib/email-templates";
import { verifyCurrentPassword } from "@/lib/reauth";
import { createClient } from "@/lib/supabase/server";

/**
 * THE ACCOUNT'S WRITES.
 *
 * ── THE PROFILE WRITES NEED NO AUTHZ HERE, AND THAT IS STRUCTURAL ─────────
 * `update_display_name`, `update_bio` and `update_email_preferences` all
 * resolve their row from `auth.uid()` and take no profile id. There is no
 * parameter in flight that could name another account, so there is nothing for
 * this layer to check and nothing it could forget.
 *
 * ── THE TWO SIGN-IN WRITES ARE DIFFERENT, AND THEY ARE GUARDED ────────────
 * Changing the address moves where every future reset link is delivered;
 * changing the password ends every other session. Both are account-takeover
 * primitives available to anyone sitting at an unlocked laptop with a live
 * session, so both re-prove the current password first. `src/lib/reauth.ts`
 * exists for exactly this and explains why neither of Supabase's own
 * mechanisms fits.
 */

/**
 * ── WHY `revalidatePath("/", "layout")` AND NOT `/account` ────────────────
 * A display name is not local to this page. It labels the roster, the
 * leaderboard, every record it has ever held, and the shell's own account menu
 * — which lives in the LAYOUT. A page-scoped revalidate would save the name and
 * leave the menu in the corner still showing the old one.
 *
 * ── TWO RPCs, ONE FORM, AND THE PARTIAL FAILURE IS REPORTED ───────────────
 * The board draws Profile as one section, so it saves as one. `update_bio` and
 * `update_display_name` are separate functions and either can fail alone, so
 * the name goes first and a bio failure says plainly that the name was already
 * saved. Silently reporting one failure for two writes would leave the reader
 * unable to tell what to retype.
 */
export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const name = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();

  if (!name) return fail("A display name cannot be empty.", "display_name");
  if (name.length > 60) {
    return fail("A display name is capped at 60 characters.", "display_name");
  }
  // The 280 cap is the RPC's. Restated here only so the reader is told before
  // they submit rather than after; the database still enforces it.
  if (bio.length > 280) {
    return fail("A bio is capped at 280 characters.", "bio");
  }

  const supabase = await createClient();

  const named = await supabase.rpc("update_display_name", {
    p_name: name,
  });
  if (named.error) return fail(named.error.message, "display_name");

  const bioed = await supabase.rpc("update_bio", { p_bio: bio });
  if (bioed.error) {
    revalidatePath("/", "layout");
    return fail(
      `Your display name was saved, but the bio was not: ${bioed.error.message}`,
      "bio"
    );
  }

  revalidatePath("/", "layout");
  return ok(undefined, "Saved. Your display name shows everywhere at once.");
}

/**
 * All four preferences in one call, because the section saves rather than each
 * switch — see the RPC's own comment.
 *
 * **An absent field is `false`.** That is how an unchecked box posts, and
 * reading a missing key as "leave it alone" would make turning anything off
 * impossible.
 */
export async function updateEmailPreferences(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const on = (name: string) => formData.get(name) === "on";

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_email_preferences", {
    p_bids_revealed: on("bids_revealed"),
    p_results_up: on("results_up"),
  });
  if (error) return fail(error.message);

  revalidatePath("/account");
  return ok(undefined, "Your email settings are saved.");
}

/**
 * ── THE NEW ADDRESS IS NOT LIVE UNTIL IT IS CONFIRMED ─────────────────────
 * Supabase mails a confirmation link to the NEW address and leaves the old one
 * signing you in until it is clicked. That is the correct behaviour and the
 * copy has to say so, or someone changes their address, signs out, and cannot
 * get back in with either one.
 */
export async function changeEmail(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("current_password") ?? "");

  if (!email.includes("@")) {
    return fail("That does not look like an email address.", "email");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("You are not signed in.");

  if (email === user.email.toLowerCase()) {
    return fail("That is already your address.", "email");
  }
  if (!(await verifyCurrentPassword(user.email, password))) {
    return fail("That password is not right.", "current_password");
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) return fail(error.message, "email");

  // The OLD address is told, which is how the owner finds out if it was not
  // them. Best-effort: the change is already requested, and a mail failure must
  // not be reported as a failed change.
  const changing = emailChangeRequestedEmail({ newEmail: email, siteUrl: SITE_URL });
  await sendEmail(user.email, changing.subject, changing.html, "transactional");

  return ok(
    undefined,
    `Check ${email} for a confirmation link. Until you open it, ${user.email} still signs you in.`
  );
}

/**
 * OWASP: a password change signs out every other session. `others` spares the
 * one doing the changing, which is the same rule `completePasswordReset`
 * already follows.
 */
export async function changePassword(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) {
    return fail("Password needs at least 8 characters.", "password");
  }
  if (next !== confirm) return fail("Passwords don't match.", "confirm");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return fail("You are not signed in.");

  if (!(await verifyCurrentPassword(user.email, current))) {
    return fail("That password is not right.", "current_password");
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return fail(error.message, "password");

  await supabase.auth.signOut({ scope: "others" });

  const changed = passwordChangedEmail(SITE_URL);
  await sendEmail(user.email, changed.subject, changed.html, "transactional");

  return ok(
    undefined,
    "Password changed. Every other device has been signed out."
  );
}
