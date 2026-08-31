import { cookies } from "next/headers";

/**
 * THE RECOVERY MARK — proof that this session came from an emailed reset link.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * `/account` re-proves the current password before changing either the email
 * or the password, and says why: both are account-takeover vectors, and a
 * password change signs out every other session (OWASP). `/reset-password` did
 * the same write with no such check, and an ORDINARY signed-in session could
 * reach it — so the lock on one door was missing from the door beside it.
 * Anyone at an unlocked, signed-in device could set a new password without
 * knowing the old one, and lock the owner out of every other device doing it.
 *
 * ── WHY A COOKIE AND NOT A TOKEN CLAIM ────────────────────────────────────
 * Supabase does expose authentication-method information on the session, but
 * its shape is a detail of the vendor's token format and this app would be
 * reading it in exactly one place. A mark this app sets itself, on the one hop
 * that can legitimately grant it, is explicit at both ends and cannot quietly
 * change meaning under a dependency bump.
 *
 * ── IT IS SHORT-LIVED AND SINGLE-USE ──────────────────────────────────────
 * Fifteen minutes, and cleared the moment a password is actually set. A
 * recovery token is already short-lived; this must not outlive the errand it
 * was minted for and become a standing exemption from the check above.
 */
export const RECOVERY_COOKIE = "mp_recovery";

const FIFTEEN_MINUTES = 60 * 15;

/** Set on the one hop that earns it: a `type=recovery` link verified at
 *  `/auth/confirm`. Nothing else may call this. */
export async function markRecovery(): Promise<void> {
  (await cookies()).set(RECOVERY_COOKIE, "1", {
    httpOnly: true, // nothing client-side reads it
    sameSite: "lax",
    path: "/",
    maxAge: FIFTEEN_MINUTES,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function hasRecoveryMark(): Promise<boolean> {
  return (await cookies()).get(RECOVERY_COOKIE)?.value === "1";
}

/** Called after the password is set, so the mark cannot be spent twice. */
export async function clearRecovery(): Promise<void> {
  (await cookies()).delete(RECOVERY_COOKIE);
}
