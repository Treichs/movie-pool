import { type NextRequest } from "next/server";

import { rememberLeagueFromRequest } from "@/lib/landing";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: proxy.ts is the renamed middleware.ts (Node.js runtime).
// Refreshes the Supabase session cookie on every request and bounces
// signed-out visitors of protected pages to `/login`, which is the sign-in
// screen again since ADR-435 restored it and made `/` a landing page. The
// bounce itself lives in updateSession (lib/supabase/proxy), not here — this
// file only sequences the two things that must happen per request.
// Fine-grained role checks (player vs commissioner) happen server-side in each
// page/action, never here alone.
//
// It also remembers which league you last opened (ADR-104), which has to
// happen here for a mechanical reason: a Server Component cannot set cookies,
// so the league page cannot record its own visit. Ordered AFTER updateSession
// because that call can replace the response object when Supabase refreshes
// its tokens — setting the cookie first would drop it on the floor.
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  return rememberLeagueFromRequest(request, response);
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
