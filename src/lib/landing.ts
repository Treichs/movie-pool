import type { SupabaseClient } from "@/lib/supabase";
import type { NextRequest, NextResponse } from "next/server";
import { getNavLeagues, type NavLeague } from "@/lib/nav";

// `next/headers` is imported DYNAMICALLY, inside the one function that needs
// it, and that is not stylistic. The unit runner (`node --test`, no Next
// runtime, no bundler) cannot resolve it, so a top-level import would make this
// whole module unimportable and the rule below untestable — which is the
// opposite of what it is worth having. Every other import here is type-only
// and erases at runtime, so this is the single thing standing between the rule
// and a test. Deferring it costs nothing: the call is already async.

// WHERE A SIGNED-IN USER LANDS (ADR-104, implementing ADR-094).
//
// One ordered rule, in one place, because the four entry points that need it
// — sign-in, sign-up, password reset, and the OAuth callback — were each
// hardcoding `/leagues` and would otherwise drift apart:
//
//   1. the remembered league's ACTIVE season, if it has one
//   2. otherwise that league's own page
//   3. no league at all → /leagues, which IS the empty state and the wizard
//   4. several leagues, none remembered → INFER one and land on its league page
//
// Steps 3 and 4 were a single "/leagues" until ADR-121 retired that page. They
// split because they are not the same question: one person has nowhere to go,
// the other has too many places and no way to rank them. /leagues answers the
// first — it was unreachable until this rule pointed at it. The second is
// answered by inference plus the switcher already sitting in League Home's
// title, not by asking; see the long note on the branch itself.
//
// Rule 2 is the part worth explaining, because it looks like the thing ADR-094
// refused. ADR-094 rejected branching on LEAGUE COUNT — a property of the
// user, which produces a rare path walked by a minority. This branches on
// SEASON STATE, a property of the world: it flips for every member of a league
// on the same day, so between seasons there is no unfamiliar path because it is
// the only path anyone gets. The league page is also the right screen for that
// phase — it already carries the record book and the roster — and it is a hub
// rather than a leaf, which is what ADR-094's "fail gracefully rather than
// dead-end" actually asks for. A finished season is frozen standings with
// nothing to act on.
//
// DRAFT SEASONS DELIBERATELY DO NOT COUNT. `getNavLeagues` reports a league's
// "current" season as active-or-else-draft, which is right for the nav but
// wrong here: a season that has not started is not somewhere to land. Testing
// for `active` specifically sends it to the league page instead, where that
// season already renders as "Not started" beside the commissioner's start
// action. That is why this reads `currentSeason.status` rather than trusting
// `currentSeason` to be live.

/** The remembered LEAGUE. A league is remembered rather than a season because a
 *  season ends — a remembered season is a pointer that goes stale by design. */
export const REMEMBERED_LEAGUE_COOKIE = "mp_league";

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
 *  ordinary landing rule rather than to a half-validated path. */
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
 *  is dropped: a confirmed invitee lands on the ordinary landing rule, which
 *  sends someone with no league to `/leagues` — where the pending invitation is
 *  listed and acceptable in one more click. */
export function emailLinkTarget(origin: string): string {
  return `${origin}/auth/confirm`;
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Matches /leagues/<uuid> and anything below it. Deliberately strict about the
// shape so a path like /leagues/new can never be stored as a league id.
//
// IT SAID `/league/` UNTIL 2026-08-29, singular, while its own comment said
// plural and the route had been `/leagues/` since the §7.5 rename. So it never
// matched anything: the cookie was never written, and `chooseLandingPath`'s
// remembered-league branch below was unreachable code that looked alive.
// Nothing failed, which is why it survived — a landing rule that silently falls
// through to "your only league" is indistinguishable from a working one until
// somebody belongs to two.
const LEAGUE_PATH = /^\/leagues\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

export function leagueIdFromPath(pathname: string): string | null {
  return LEAGUE_PATH.exec(pathname)?.[1]?.toLowerCase() ?? null;
}

/** Called from the proxy: opening a league is what makes it the remembered one.
 *
 *  It lives in the proxy rather than on the league page because a Server
 *  Component cannot set cookies — only a proxy, Route Handler or Server Action
 *  can. Skipped on redirects, which is how an unauthenticated request bounced
 *  to the sign-in screen avoids leaving a cookie behind. */
export function rememberLeagueFromRequest(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  if (response.headers.has("location")) return response;

  const leagueId = leagueIdFromPath(request.nextUrl.pathname);
  if (!leagueId) return response;
  if (request.cookies.get(REMEMBERED_LEAGUE_COOKIE)?.value === leagueId) return response;

  response.cookies.set(REMEMBERED_LEAGUE_COOKIE, leagueId, {
    httpOnly: true, // nothing client-side reads it
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

/** THE RULE ITSELF, kept pure and separate from the IO around it.
 *
 *  Split out deliberately: everything interesting about ADR-104 is the
 *  ordering, and the ordering is worth testing without a database or a cookie
 *  jar. `resolveLandingPath` below is the thin shell that fetches the two
 *  inputs. */
export function chooseLandingPath(
  leagues: Pick<NavLeague, "id" | "currentSeason" | "openWeek">[],
  rememberedLeagueId: string | null | undefined
): string {
  // Belongs to nothing: /leagues IS that empty state — the explanation of what a
  // league is, plus the creation wizard (ADR-121). It was unreachable until
  // this line pointed at it: nothing linked it, no breadcrumb named it, and the
  // top nav dropped it on 2026-08-05.
  if (leagues.length === 0) return "/leagues";

  // `find` over the user's OWN memberships is also the validation: a cookie
  // naming a league they have left, or never belonged to, simply misses.
  const known =
    leagues.find((l) => l.id === rememberedLeagueId) ??
    // With one league there is nothing to remember and nothing to choose. This
    // is the common case — ADR-094 recorded real usage as one main league and
    // occasionally a second — so most users never depend on the cookie at all.
    (leagues.length === 1 ? leagues[0] : null);

  // KNOWN, so go all the way in: the season if one is live, else the league.
  if (known) {
    return known.currentSeason?.status === "active"
      ? `/seasons/${known.currentSeason.id}`
      : `/leagues/${known.id}`;
  }

  // SEVERAL LEAGUES AND NOTHING REMEMBERED — the last branch that used to
  // return /leagues (ADR-121 retires that page). Two things changed to let it go.
  //
  // FIRST, the choice is now INFERRED rather than abandoned. A league with a
  // season actually running is where the game is; if exactly one qualifies it
  // is not a guess between equals, it is the only live answer, and it is what
  // the cookie would have said. Only when none or several are live does this
  // fall back to leagues[0] — which getNavLeagues orders by league_members
  // .created_at, so it means the league you joined FIRST rather than an
  // arbitrary sort.
  //
  // SECOND, and this is what makes the fallback acceptable: it lands on the
  // LEAGUE page rather than the season, where the shell's league switcher names
  // the league you arrived in and lists the alternatives in one click. So an
  // inference arrives NAMED. The failure the single-league shortcut above
  // guards against is being SILENTLY dropped into the wrong league; chrome that
  // says which league this is and offers the others is the opposite.
  //
  // (This comment used to claim League Home's own <h1> was that switcher, via a
  // `league-title-picker` component. No such component exists in this repo —
  // the claim was never true, and the switcher it describes is the one in the
  // nav band. Corrected 2026-08-30 rather than left pointing at a file that
  // would be looked for and not found.)
  //
  // It also self-corrects exactly once: opening any league sets the remembered
  // cookie, so the next sign-in takes the `known` branch and goes straight to
  // the season. Landing on the league rather than the season is the price of
  // having guessed, and it is paid one time.
  const live = leagues.filter((l) => l.currentSeason?.status === "active");
  if (live.length === 1) return `/leagues/${live[0].id}`;

  // SEVERAL LIVE SEASONS — A DEADLINE OUTRANKS JOIN ORDER. This used to fall
  // straight to leagues[0], the league you joined FIRST, which is a fact about
  // 2019 rather than about this Friday: it dropped a player into a dormant
  // league while another was two hours from closing its bids. Among leagues
  // that are actually taking bids, the soonest deadline is the only one of
  // these that is time-boxed, so it is the only defensible guess.
  const bidding = leagues
    .filter((l) => l.openWeek?.bidDeadline)
    .sort((a, b) => a.openWeek!.bidDeadline!.localeCompare(b.openWeek!.bidDeadline!));
  if (bidding.length > 0) return `/leagues/${bidding[0].id}`;

  return `/leagues/${leagues[0].id}`;
}

/** Fetches the rule's two inputs and applies it. Returns a path, never a
 *  redirect, so callers stay in charge of how they navigate. */
export async function resolveLandingPath(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { cookies } = await import("next/headers");
  const [leagues, jar] = await Promise.all([getNavLeagues(supabase, userId), cookies()]);
  return chooseLandingPath(leagues, jar.get(REMEMBERED_LEAGUE_COOKIE)?.value);
}

/** Convenience for the auth entry points, which have a client but not a user
 *  id to hand. Falls back to `/login` if the session is somehow not readable —
 *  landing somewhere useless beats failing the sign-in that just succeeded, and
 *  the sign-in screen is right for an unreadable session: it is the one place
 *  that can repair it. It was /leagues until ADR-121 and `/` until ADR-435, which
 *  moved sign-in back to /login and made `/` a marketing page — a pitch is the
 *  wrong answer to "your session did not read". */
export async function landingPathForCurrentUser(
  supabase: SupabaseClient
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login";
  return resolveLandingPath(supabase, user.id);
}
