import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase";

// PROVING YOU ARE STILL YOU, before a change that could lock you out.
//
// Two account actions are account-takeover primitives rather than preferences:
// changing the sign-in email moves where every future reset link is delivered,
// and changing the password ends every other session. An attacker on a borrowed
// laptop with a live session can do both. Every mainstream product asks for the
// current password first; this app asked for nothing.
//
// WHY NOT SUPABASE'S OWN MECHANISMS. Two exist and neither fits:
//
//   - `updateUser({ current_password, password })` enforces the check, but only
//     when the project's `secure_password_change` setting is on. That setting
//     lives in the hosted dashboard, not in this repo — `supabase/config.toml`
//     is local-stack configuration and this project has no local stack
//     (ADR-005). A guard that silently does nothing when a dashboard toggle is
//     off is exactly the kind of silent failure ADR-116 is about.
//   - `reauthenticate()` mails a nonce. That is a round-trip through the inbox
//     to change a password you already know, and it cannot protect the EMAIL
//     change at all when the point is that you may be changing it because the
//     old inbox is gone.
//
// So the check is explicit and lives here: attempt a password grant for the
// user's CURRENT address on a throwaway client, and report whether it worked.
//
// THE THROWAWAY CLIENT IS LOAD-BEARING. `persistSession: false` and no cookie
// adapter means this sign-in writes nothing — no cookies, no storage, and it
// cannot disturb the caller's live session. Using the request-bound server
// client instead would rotate the session's tokens as a side effect of a
// validation check, and a wrong guess would leave the user's real session in a
// state neither they nor the code expected.
export async function verifyCurrentPassword(
  email: string,
  password: string
): Promise<boolean> {
  if (!password) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Refuse rather than pass. A misconfigured environment must not read as "the
  // password checked out" — that would turn a deploy mistake into an open door.
  if (!url || !key) return false;

  const probe = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { error } = await probe.auth.signInWithPassword({ email, password });
  // Tidy up the session this just minted server-side. It was never persisted,
  // so this is belt-and-braces rather than required.
  if (!error) await probe.auth.signOut();
  return !error;
}
