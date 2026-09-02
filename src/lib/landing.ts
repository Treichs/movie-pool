import type { SupabaseClient } from "@/lib/supabase";

// WHERE A SIGNED-IN USER LANDS (ADR-443, superseding ADR-104).
//
// ONE ADDRESS, NOT A RULE. Sign-in lands on `/leagues` — the personal command
// centre — and the member chooses from there. The four entry points that need
// this (sign-in, sign-up, password reset and the OAuth callback) share the
// constant rather than each resolving a destination.
//
// ADR-104's ordered rule is not gone; it MOVED. "The live season, else the
// league that would hold it" is now the LEAGUE FRONT DOOR rule, applied at
// `/leagues/[leagueId]` by `liveSeasonId` in lib/nav.ts. It stopped being the
// sign-in rule because sign-in was the one caller that had to GUESS: a member
// of several leagues with nothing remembered got an inferred destination —
// soonest deadline, then join order — and all of that machinery existed only
// because sign-in was required to produce a single answer. Landing on the
// command centre removes the requirement instead of improving the guess, and
// the member reads a ranked list rather than being dropped somewhere by it.
//
// THE REMEMBERED-LEAGUE COOKIE WENT WITH IT. `mp_league` existed for exactly
// one reader — the guess above — and ADR-443 refuses to leave a cookie written
// and unread. Its proxy write is gone too, so `src/proxy.ts` is back to
// sequencing the session refresh alone.
//
// A cheap side effect worth knowing: sign-in no longer calls `getNavLeagues`,
// so it no longer fetches every league, every season and every open week
// before it can redirect.

/** The one signed-in destination. Not a function, because it no longer depends
 *  on anything about the user. */
export const SIGNED_IN_LANDING = "/leagues";

/** THE ONE GATE ON `?next=`, shared by every entry point that honours it.
 *
 *  A post-sign-in redirect target is attacker-supplied by construction — it
 *  arrives in a URL anyone can send you — so "somewhere on this site" has to be
 *  proven rather than assumed. `//evil.com` and `https://evil.com` are both
 *  rejected: the first is a protocol-relative URL that browsers treat as
 *  cross-origin despite starting with a slash, and it is the classic way an
 *  open redirect gets through a naive `startsWith("/")` check.
 *
 *  Returns null when the value cannot be trusted, so callers fall back to the
 *  ordinary landing destination rather than to a half-validated path. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//")) return null;
  // A backslash is normalised to a forward slash by some browsers, so `/\evil`
  // is another protocol-relative form. Refuse it too.
  if (next.startsWith("/\\")) return null;
  return next;
}

/** WHERE EVERY EMAILED AUTH LINK COMES BACK TO, and why it is not /auth/callback.
 *
 *  `@supabase/ssr` runs the PKCE flow, so `signUp`, `resetPasswordForEmail` and
 *  `updateUser({email})` each mint a code verifier and store it in a COOKIE on
 *  the browser that started the flow — verified on 2026-08-14 by watching
 *  `sb-<ref>-auth-token-code-verifier` appear on all three. `/auth/callback`
 *  exchanges a `?code=` against that cookie, which means the link only works in
 *  the browser that requested it. Supabase says so outright: "the code exchange
 *  must be initiated on the same browser and device where the flow was started."
 *
 *  Signing up on a laptop and opening the email on a phone is ordinary, and for
 *  a password reset it is close to the norm — being locked out is exactly when
 *  you reach for the other device. So email links go to /auth/confirm, which
 *  verifies a `token_hash` and carries no device state at all. /auth/callback
 *  keeps the code exchange for Google, where the whole dance happens inside one
 *  browser and PKCE is doing its actual job.
 *
 *  THE TEMPLATES DO NOT READ THIS VALUE, and that is the point. They build the
 *  link from `{{ .SiteURL }}`, which is a bare origin, so the `?` is theirs and
 *  every parameter after it is an `&` they control. The first attempt used
 *  `{{ .RedirectTo }}` — this value — to keep localhost, previews and
 *  production each on their own host. It shipped a link a phone could not
 *  open, because `.RedirectTo` falls back to the Site URL whenever `redirect_to`
 *  is missing OR fails allow-list validation, and the Site URL has no query
 *  string: appending `&token_hash=…` put the token inside the HOSTNAME
 *  (`www.moviepool.app&token_hash=…`), which is a DNS failure rather than a
 *  degraded link. Per-origin links are not worth a template that can produce an
 *  unopenable URL for anyone whose origin is not allow-listed.
 *
 *  So this is still sent — it is validated against the allow list, and it stays
 *  correct if a template is ever reverted to a Supabase default, which DOES read
 *  it — but nothing user-facing depends on it. Local and preview signups
 *  therefore receive a production link. That is the accepted cost.
 *
 *  A DESTINATION IS NO LONGER CARRIED FOR SIGNUP. Recovery and email-change
 *  pin `next` in the template itself (`/reset-password`, `/account`) because
 *  those are constant per flow. Signup's was the invitation deep link, and it
 *  is dropped: a confirmed invitee lands on `/leagues`, where the pending
 *  invitation is listed and acceptable in one more click. */
export function emailLinkTarget(origin: string): string {
  return `${origin}/auth/confirm`;
}

/** For the entry points that must prove a session before they redirect.
 *
 *  Falls back to `/login` if the session is somehow not readable — landing
 *  somewhere useless beats failing the sign-in that just succeeded, and the
 *  sign-in screen is right for an unreadable session: it is the one place that
 *  can repair it. Callers that already hold a user use `SIGNED_IN_LANDING`
 *  directly rather than paying for a second `getUser`. */
export async function landingPathForCurrentUser(
  supabase: SupabaseClient
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";
  return SIGNED_IN_LANDING;
}
