import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

/**
 * SIGN OUT — "on this device only", and the copy is the whole point.
 *
 * `supabase.auth.signOut()` with no scope ends THIS session. The account page
 * is also where someone comes to end the OTHER ones, and the control that does
 * that is the password change above — which is why its row says so. Saying "on
 * this device only" here stops this button from looking like the answer to
 * "someone else is in my account".
 *
 * A FORM, NOT AN `onClick`, matching the account menu in the shell: the action
 * clears the cookie and redirects, and a fetch-and-hope button would leave a
 * stale session in the tab whenever JavaScript had not loaded. This is
 * therefore a server component — there is nothing here for the client to do.
 */
export function SignOutRow() {
  return (
    <form
      action={signOut}
      className="flex flex-wrap items-center justify-between gap-4 border-t pt-6"
    >
      <div className="flex flex-col gap-0.5">
        <span className="type-h3 text-ui">Sign out</span>
        <span className="type-body text-micro text-muted-foreground">
          On this device only. To end other sessions, change your password.
        </span>
      </div>
      <Button type="submit" variant="outline">
        Sign out
      </Button>
    </form>
  );
}
