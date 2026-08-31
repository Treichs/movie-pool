import type { SupabaseClient } from "@/lib/supabase";
import type { NotifyKind } from "@/lib/notifications";

/**
 * THE ACCOUNT SCREEN'S READ — board 4.10.
 *
 * ── IT IS `getAccountPage`, NOT `getAccount` ──────────────────────────────
 * `src/lib/auth.ts` already exports a `getAccount(supabase, userId)` that
 * returns a display name and an email and nothing else. It currently has zero
 * callers, but a second function of the same name in the same import graph is
 * the bug this project has twice written down as a rule — so this one takes
 * the `…Page` suffix the plan uses for exactly this collision on the player
 * profile. The unused one is left alone rather than deleted; it is not this
 * task's to remove.
 */

export type EmailPreferences = Record<NotifyKind, boolean>;

export type AccountPage = {
  profileId: string;
  displayName: string;
  bio: string | null;
  email: string;
  /** Whether the address has been confirmed. Supabase answers this, not us. */
  emailConfirmed: boolean;
  /** Sign-in methods actually attached to this account, in a stable order. */
  providers: string[];
  preferences: EmailPreferences;
};

/**
 * The two toggles, and the order they are drawn in.
 *
 * The ORDER IS THE WEEK'S ORDER, not the alphabet: bids are revealed, then the
 * scores land. Someone reading down the list is reading the shape of a week,
 * which is why it is worth fixing here rather than leaving to whatever order
 * the columns come back in.
 *
 * It was four until 2026-08-30. `slate_up` and `deadline_reminder` announced
 * things a player can already see on the board; retiring them took the columns
 * with them.
 */
export const NOTIFY_KINDS: NotifyKind[] = ["bids_revealed", "results_up"];

/** The copy for each, taken from board 4.10 rather than invented. */
export const NOTIFY_COPY: Record<NotifyKind, { title: string; detail: string }> =
  {
    bids_revealed: {
      title: "Bids are revealed",
      detail: "Who won what, the moment the week closes.",
    },
    results_up: {
      title: "Monday scores",
      detail: "Box office and Tomatometer are in; standings have moved.",
    },
  };

/**
 * ONE READ FOR THE WHOLE SCREEN.
 *
 * The identities come from the SESSION rather than from a table — Supabase owns
 * which providers are attached and whether the address is confirmed, and a
 * mirror of that in `profiles` would be a second copy able to disagree with the
 * thing that actually gates sign-in.
 */
export async function getAccountPage(
  supabase: SupabaseClient,
  userId: string
): Promise<AccountPage | null> {
  const [{ data: profile }, { data: auth }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, email, bio, notify_bids_revealed, notify_results_up"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!profile) return null;

  const user = auth.user;
  const providers = [
    ...new Set((user?.identities ?? []).map((i) => i.provider)),
  ].sort();

  return {
    profileId: profile.id,
    displayName: profile.display_name,
    bio: profile.bio,
    email: profile.email,
    emailConfirmed: Boolean(user?.email_confirmed_at),
    providers,
    preferences: {
      bids_revealed: profile.notify_bids_revealed,
      results_up: profile.notify_results_up,
    },
  };
}
