import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./types";

// Paths that work without a session. Everything else redirects to `/login`,
// which IS the sign-in screen again since ADR-435 restored it; `/` is the
// marketing landing page and is public for a different reason — it is the pitch.
// /how-it-works is deliberately here: the most useful moment for "how does
// this work" is BEFORE someone accepts an invitation, and a page that needs an
// account to read cannot answer that.
//
// `/login` MUST be in this list. Without it the sign-in screen bounces to
// itself, which is unreachable rather than merely wrong.
//
// SO MUST BOTH PASSWORD SCREENS, for the same reason and a subtler one. Anyone
// on `/forgot-password` is by definition signed out, so bouncing them to
// `/login` sends them back to the form they could not complete. `/reset-password`
// is reached from an emailed link that lands on `/auth/callback` first: the
// callback exchanges the code for a session, so the visitor usually arrives
// here already signed in — but not when the exchange fails or the link is
// opened in a browser the cookie never reached, and that is exactly the case
// the screen exists to explain. A gate here would answer it with a redirect.
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/how-it-works",
];

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/auth") || // email-confirm + signout callbacks
    // Cron endpoints have no browser session; they authenticate themselves
    // with the CRON_SECRET bearer token (phase 8) and return their own 401.
    pathname.startsWith("/api/cron")
  );
}

// Supabase session refresh for src/proxy.ts. Auth tokens live in cookies;
// this re-validates them on every request and writes refreshed tokens back
// onto both the forwarded request and the outgoing response, so Server
// Components always see a live session without being able to set cookies
// themselves.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() must stay between client creation and the return —
  // it performs the actual token validation/refresh. Do not replace with
  // getSession(), which trusts the cookie without verifying it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    // REMEMBER WHERE THEY WERE GOING. This used to clear the path and the query
    // and drop everyone on the sign-in screen, which quietly broke the one flow
    // that depends on arriving somewhere specific: an invitation link. The join
    // page's own comment claimed "requireUser redirects a signed-out visitor to
    // sign-in, and after signing up they come back here" — nothing brought them
    // back, because the destination was discarded right here.
    //
    // Only the PATH and its query are carried, and the sign-in side re-validates
    // that it is a same-site path before using it (see safeNextPath), so this
    // cannot become an open redirect.
    const url = request.nextUrl.clone();
    const intended = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.search = "";
    // Not for the sign-in screen itself — "come back to /login" is what happens
    // anyway, and a ?next=/login there is noise in the address bar. It is
    // unreachable in practice now that /login is public and therefore never
    // bounced, and kept as a guard rather than deleted because the list of
    // public paths is the only thing making it unreachable.
    if (intended !== "/login") url.searchParams.set("next", intended);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
