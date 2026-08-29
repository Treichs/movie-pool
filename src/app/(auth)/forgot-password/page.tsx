import { AuthSplitShell } from "@/components/auth-split-shell";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Reset your password" };

/**
 * THE RAIL, NOT THE FIELD (board 1.3). `/login` and `/signup` are places you
 * arrive; this is an interruption reached from a dead end, so it gets a 96px
 * perforated strip and no ink pane at all. Passing `ink` to the rail is a
 * compile error, which is how the shell keeps the two apart.
 *
 * ── NO SIGNED-IN REDIRECT, UNLIKE ITS TWO SIBLINGS ────────────────────────
 * `/login` and `/signup` send a signed-in visitor away because being signed in
 * is the thing those screens exist to achieve. It proves nothing here: a
 * session that persisted on one device says nothing about whether its owner
 * remembers the password, and someone who has forgotten it still needs the
 * link. Bouncing them would answer a real request with a page that cannot help.
 */
export default function ForgotPasswordPage() {
  return (
    // `<main>` WRAPS THE WHOLE SHELL, as on `/login` — though the reason is
    // weaker here, the rail being aria-hidden decoration. Kept identical
    // because four auth screens differing in where their landmark sits is a
    // difference nobody would maintain on purpose.
    <main>
      <AuthSplitShell variant="rail">
        <ForgotPasswordForm />
      </AuthSplitShell>
    </main>
  );
}
