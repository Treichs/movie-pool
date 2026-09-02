import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: proxy.ts is the renamed middleware.ts (Node.js runtime).
// Refreshes the Supabase session cookie on every request and bounces
// signed-out visitors of protected pages to `/login`, which is the sign-in
// screen again since ADR-435 restored it and made `/` a landing page. The
// bounce itself lives in updateSession (lib/supabase/proxy), not here — this
// file only sequences what must happen per request.
// Fine-grained role checks (player vs commissioner) happen server-side in each
// page/action, never here alone.
//
// IT NO LONGER REMEMBERS WHICH LEAGUE YOU LAST OPENED. The `mp_league` cookie
// was written here because a Server Component cannot set cookies, and it was
// read by exactly one thing: the sign-in destination guess ADR-443 removed.
// Nothing reads it now, so the write is gone rather than left orphaned.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
