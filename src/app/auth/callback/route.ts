import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { landingPathForCurrentUser, safeNextPath } from "@/lib/landing";

// The OAuth landing strip (google-oauth-signin task). Supabase redirects here
// with a one-time PKCE code; exchanging it sets the session cookies, and the
// profile row comes from the same handle_new_user trigger as a password
// signup — display name preferred from Google's full_name (see the
// lifecycle migration), so no PlayerChip ever renders a bare email.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // A TOKEN HASH MEANS AN EMAIL LINK, which /auth/confirm owns — this route
  // only knows how to exchange a PKCE code. Forwarding rather than failing
  // matters for two windows that are real rather than hypothetical: a
  // confirmation link is valid for an hour, so mail sent before a deploy gets
  // opened after it, and the email TEMPLATE changes the instant it is saved
  // while the code that reads it ships whenever the branch does. Either way the
  // person clicking has no idea a migration happened, and shouldn't.
  if (url.searchParams.has("token_hash")) {
    const forwarded = new URL("/auth/confirm", url.origin);
    forwarded.search = url.search;
    return NextResponse.redirect(forwarded);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Recovery and email-change links carry where they want to land.
      // Constrained to a same-site path so the parameter cannot be used to
      // bounce someone off to another origin after authenticating them.
      //
      // With no `next`, this is an ordinary Google sign-in, so it resolves the
      // same landing rule as every other entry point (ADR-104) rather than
      // dropping the user on /home. An explicit `next` still wins — a recovery
      // link asked to go somewhere specific.
      // safeNextPath is the shared gate (lib/landing) rather than a check
      // written out again here — this used to carry its own copy, and a second
      // implementation of "is this path safe" is how one of them ends up
      // missing a case the other covers.
      const safeNext =
        safeNextPath(url.searchParams.get("next")) ??
        (await landingPathForCurrentUser(supabase));
      return NextResponse.redirect(new URL(safeNext, url.origin));
    }
  }

  // No code or a failed exchange: land on login with a readable state rather
  // than a 500. The login page shows its normal form either way. `/login`
  // rather than `/` since ADR-435 — `/` is the landing page and has no form.
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
