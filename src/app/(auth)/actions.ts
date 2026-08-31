"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailLinkTarget, landingPathForCurrentUser, safeNextPath } from "@/lib/landing";
import { SITE_URL, sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email-templates";

// WHERE TO GO AFTER AUTHENTICATING. An explicit, validated `next` wins over the
// ordinary landing rule — it means the visitor asked for a specific page and was
// bounced to sign-in on the way (the proxy records it). Without one, ADR-104's
// rule decides. The validation lives in safeNextPath so the four entry points
// cannot drift on what counts as safe.
async function destinationAfterAuth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData
): Promise<string> {
  const next = safeNextPath(String(formData.get("next") ?? "") || null);
  return next ?? (await landingPathForCurrentUser(supabase));
}

export type AuthFormState = {
  error?: string;
  notice?: string;
  // Set ONLY when the outcome is "this account exists but has not confirmed its
  // email" — which is the one state a person cannot escape on their own without
  // a way to ask for the mail again. Carrying the address here is what lets the
  // form offer that without making them retype it.
  unconfirmedEmail?: string;
};

export async function signIn(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Supabase deliberately keeps this vague ("Invalid login credentials")
    // so attackers can't probe which emails exist. Pass it through as-is,
    // except the one case worth translating for players.
    if (error.code === "email_not_confirmed") {
      // Reachable since 2026-08-14, when mailer_autoconfirm was turned off.
      // The address is echoed back so the form can offer a resend: "check your
      // inbox" is a dead end for the person whose mail never arrived, and this
      // is now the ONLY way into an account, not a formality.
      return {
        error: "Confirm your email first — check your inbox for the link.",
        unconfirmedEmail: email,
      };
    }
    return { error: error.message };
  }

  redirect(await destinationAfterAuth(supabase, formData));
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!displayName) return { error: "Pick a display name — it's what the standings will show." };
  if (!email || !password) return { error: "Enter an email and password." };
  // THE SAME TWO GUARDS `completePasswordReset` ALREADY RAN, in the same order,
  // with the same wording — one implementation of "a new password is set here",
  // not two that drift (2026-08-24, Task B1.3).
  //
  // The length check closes a promise nothing kept: both signup forms set
  // `minLength={8}` and the hint under the field says "At least 8 characters",
  // so the rule was advertised on the client and enforced nowhere. A browser
  // constraint is a courtesy, not a gate — the action is reachable without one.
  //
  // The confirm check is what makes the restored field mean something. A
  // required control nothing validates answers a typo with silence, which is
  // why the field was removed in B1.1 rather than shipped unwired; it comes
  // back WITH its comparison, both in the same commit.
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  // WHERE A CONFIRMATION LINK LANDS. The template builds the link from
  // {{ .SiteURL }} and does not read this, so it carries no destination — see
  // emailLinkTarget for why per-origin links were given up. An invited player
  // therefore confirms and lands on the ordinary landing rule, which puts
  // someone with no league on /league, where the invitation is waiting.
  const origin = (await headers()).get("origin") ?? "";
  const confirmTarget = emailLinkTarget(origin);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The handle_new_user DB trigger reads this to build the profile row.
      data: { display_name: displayName },
      emailRedirectTo: confirmTarget,
    },
  });
  if (error) return { error: error.message };

  // THE ORDINARY PATH SINCE 2026-08-14. `mailer_autoconfirm` was flipped to
  // false that day, so signUp no longer returns a session and this branch is
  // what every new account now hits. It was written while it was unreachable
  // and kept on the grounds that it would become correct the moment
  // confirmation was switched on; that is what happened.
  //
  // Why it was switched on: without it anyone can register an address they do
  // not own, and get_my_league_invites matches pending invitations on the
  // signed-in user's email — so an unconfirmed account could be shown, and
  // accept, an invitation meant for its real owner.
  if (!data.session) {
    return {
      notice:
        "Almost there — we sent a confirmation link to your email. Click it, then sign in.",
      unconfirmedEmail: email,
    };
  }


  // THE INVITE PATH DEPENDS ON THIS. A brand-new account has no leagues, so the
  // landing rule sends them to /league — but someone who arrived on an
  // invitation link was bounced here from /invites/<token>, and `next` carries
  // them back to the invitation they came to accept rather than to an empty
  // state telling them to ask a commissioner for one.
  redirect(await destinationAfterAuth(supabase, formData));
}

// SEND THE CONFIRMATION MAIL AGAIN. Required rather than nice-to-have since
// confirmation became mandatory: a lost or filtered message is otherwise a
// permanently locked account, because the only two other doors — sign-in and
// password reset — both refuse an unconfirmed address.
//
// The reply is the SAME whether or not the address has an account, and whether
// or not it is already confirmed, for exactly the reason requestPasswordReset
// gives: a form that answers differently is an account-enumeration oracle. The
// one distinguished case is the 429, and that is safe to surface because
// Supabase's `smtp_max_frequency` (60s on this project) is applied before it
// looks the address up — a rate-limit reply proves nothing about who exists.
// Takes no destination: the confirmation template carries none (see
// emailLinkTarget), so accepting one here would be a parameter that quietly
// does nothing.
export async function resendConfirmation(email: string): Promise<string> {
  const address = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
    return "That doesn't look like an email address.";
  }

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: address,
    options: {
      emailRedirectTo: emailLinkTarget(origin),
    },
  });

  if (error?.status === 429) {
    return "Hold on a moment before asking for another one.";
  }
  return "If that address needs confirming, a new link is on its way.";
}

// Google OAuth (google-oauth-signin task, 2026-08-02). The PKCE dance:
// Supabase mints a Google consent URL, Google bounces back to Supabase's
// /auth/v1/callback, and Supabase lands the user on OUR /auth/callback with a
// one-time code that the route handler exchanges for a session. The origin is
// derived from the request so the same code serves localhost, previews, and
// production — each origin just has to be in Supabase's redirect allowlist.
export async function signInWithGoogle(formData?: FormData): Promise<void> {
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  // The destination rides along on the callback URL, which is the only channel
  // that survives the bounce out to Google and back. /auth/callback re-validates
  // it before redirecting.
  const next = safeNextPath(String(formData?.get("next") ?? "") || null);
  const callback = next
    ? `${origin}/auth/callback?next=${encodeURIComponent(next)}`
    : `${origin}/auth/callback`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback,
      // Force Google's account chooser every time. Without this, a visitor
      // already signed into ONE Google account that has authorized the app is
      // bounced straight back with no chance to pick — which reads as "the
      // button did nothing". select_account always shows the picker.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Signing out lands on the SIGN-IN screen, not the landing page (ADR-435).
  // The commonest reason to sign out is to sign in as someone else, and `/` is
  // now a pitch aimed at people who have never played.
  redirect("/login");
}

// Forgot-password, step one: mail a recovery link. The link lands on
// /auth/callback, which exchanges the code for a session and then sends the
// user to /reset-password to choose a new one.
//
// The reply is deliberately the SAME whether or not an account exists. Saying
// "no account with that email" turns this form into an account-enumeration
// oracle, which is the one thing a password-reset form must not be — and it is
// the same reason Supabase keeps its sign-in error vague above.
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter the email address you signed up with." };
  }

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    // THE FLOW THAT MOST NEEDS A DEVICE-INDEPENDENT LINK. Someone resetting a
    // password is often locked out of the device they normally use, so "open
    // this on the browser you started from" is the one instruction they cannot
    // follow. /auth/confirm's token hash has no such requirement.
    redirectTo: emailLinkTarget(origin),
  });

  return {
    notice:
      "If that address has an account, a reset link is on its way. The link is good for one hour.",
  };
}

// Step two, after the recovery link has established a session.
export async function completePasswordReset(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // No session means the link expired, was already used, or was never valid.
  // Say so plainly rather than failing with Supabase's raw auth error.
  if (!user) {
    return {
      error: "That reset link has expired or was already used. Request a new one.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // OWASP: "whenever a successful password reset occurs, all other sessions
  // should be invalidated." A reset is the flow people use precisely BECAUSE
  // they think someone else is in the account, so leaving that someone signed
  // in defeats the point. `others` spares the session that just did the reset.
  await supabase.auth.signOut({ scope: "others" });

  // And tell the account it happened, which is how the owner learns it was not
  // them. Best-effort: the password is already changed, and a mail failure must
  // not be reported as a failed reset.
  if (user.email) {
    const mail = passwordResetEmail(SITE_URL);
    await sendEmail(user.email, mail.subject, mail.html);
  }

  // NOTE ON THE AUTO-SIGN-IN. OWASP would rather we did not — it prefers
  // sending you back to sign in with the new password. Kept deliberately: the
  // recovery link has already established a verified session, so bouncing to a
  // form to re-enter the password just typed twice is friction without a threat
  // it answers. The sessions above are invalidated either way, which is the
  // part of that guidance that carries the security value.
  redirect(await landingPathForCurrentUser(supabase));
}
