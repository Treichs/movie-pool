import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { landingPathForCurrentUser, safeNextPath } from "@/lib/landing";
import { markRecovery } from "@/lib/recovery";

// WHERE EVERY EMAILED AUTH LINK LANDS (?token_hash=…&type=…).
//
// Written long ago against Supabase's documented SSR pattern and then left
// unreachable, because switching it on needs the EMAIL TEMPLATE changed from
// `{{ .ConfirmationURL }}` to `{{ .TokenHash }}` — and that is dashboard state,
// invisible from here. Wired up on 2026-08-14, when turning email confirmation
// on made the gap it closes a live one rather than a theoretical one.
//
// The point of verifyOtp over /auth/callback's exchangeCodeForSession: a token
// hash carries no device state, so the link works from ANY browser. The code
// exchange needs the PKCE verifier cookie held by the browser that started the
// flow, which breaks the ordinary case of signing up on a laptop and opening
// the mail on a phone. See emailLinkTarget in lib/landing for the full note.
//
// Handles all three types the app sends — `email` (signup), `recovery`
// (forgot-password) and `email_change` — because they differ only in the value
// of `type`, which Supabase puts in the link and verifyOtp takes as-is.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Emitted unconditionally by emailLinkTarget, so it is empty rather than
  // absent when there is nowhere specific to go; safeNextPath rejects both
  // identically, along with anything pointing off-site.
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      // An explicit destination wins, and for recovery there IS one: the
      // dashboard's recovery template appends `&next=%2Freset-password`
      // itself (email_change appends `%2Faccount` the same way). Verified
      // against the live project config on 2026-08-29 — do not re-derive it
      // from this repo, which cannot see a mail template.
      //
      // THE RECOVERY FALLBACK BELOW IS DEFENCE IN DEPTH, NOT THE MECHANISM.
      // A recovery token can still arrive here without `next` — one minted by
      // the admin API, or a template edited back towards a default — and the
      // landing rule is the wrong answer for every one of them: it signs the
      // visitor in and drops them on their league with the password they came
      // to change still forgotten. Sending them to the screen the flow is for
      // costs one line and cannot be wrong.
      //
      // Without either, verifying signed them in, so this is a landing like any
      // other (ADR-104): an invited player confirming their email arrives at
      // the league that invited them rather than at a signpost.
      // THE ONE HOP THAT EARNS THE RECOVERY MARK. `/reset-password` sets a new
      // password without asking for the old one, which is only safe for someone
      // who proved possession of the mailbox — that is exactly what verifying a
      // `type=recovery` token above does. Set here rather than at the
      // destination so nothing else in the app can grant it. See lib/recovery.
      if (type === "recovery") await markRecovery();

      const fallback =
        type === "recovery"
          ? "/reset-password"
          : await landingPathForCurrentUser(supabase);
      redirect(next ?? fallback);
    }
  }

  // Expired (the link is good for an hour), already used, or malformed. `/` is
  // the sign-in screen and reads the flag to explain itself, which beats a
  // silent bounce that looks like the link did nothing.
  redirect("/login?error=link");
}
