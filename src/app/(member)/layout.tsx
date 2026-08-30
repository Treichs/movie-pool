import { getProfile, requireUser } from "@/lib/auth";
import { getNavLeagues } from "@/lib/nav";
import { getShellAlerts } from "@/lib/shell-alerts";

import { AppShell } from "./_components/app-shell";

/**
 * THE SIGNED-IN GROUP. `(member)` is a route group: it shares this layout with
 * every screen inside it and adds nothing to any URL, so `/seasons/…/bid` is the
 * same address it was before the folder existed.
 *
 * THE GATE IS HERE AND IN EVERY PAGE, on purpose. `proxy.ts` bounces anonymous
 * visitors and this layout calls `requireUser`, but neither is the reason a
 * page is safe — its own composer gates before it reads. A layout is not a
 * security boundary in the App Router: it does not re-run on every client
 * navigation, and a page rendered without it would be rendered without this
 * check too.
 *
 * Three reads for the frame, and the count is deliberate: the leagues and their
 * open weeks (one call, already needed for the switcher), the profile behind
 * the account menu, and the alerts behind the bell — which costs nothing extra
 * between weeks, since it only asks about bids when a week is actually open.
 */
export default async function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { supabase, user } = await requireUser();
  const [leagues, profile] = await Promise.all([
    getNavLeagues(supabase, user.id),
    getProfile(supabase, user.id),
  ]);
  const alerts = await getShellAlerts(supabase, user.id, leagues);

  return (
    <AppShell
      leagues={leagues}
      alerts={alerts}
      profile={{
        id: user.id,
        // A profile row is created by a trigger on sign-up, so a missing one is
        // a real anomaly rather than a state to design for — the frame still
        // has to render, and the email is the honest fallback for a name.
        name: profile?.display_name ?? user.email ?? "Your account",
        email: user.email ?? "",
      }}
    >
      {children}
    </AppShell>
  );
}
