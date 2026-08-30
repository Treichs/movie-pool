import { notFound } from "next/navigation";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { requireUser } from "@/lib/auth";
import { getAccountPage } from "@/lib/account";

import { EmailSection } from "./_components/email-section";
import { ProfileSection } from "./_components/profile-section";
import { SignInSection } from "./_components/sign-in-section";
import { SignOutRow } from "./_components/sign-out-row";

export const metadata = { title: "Account" };

/**
 * `/account` — board 4.10. **One account across every league you are in.**
 *
 * ── WHY THIS SCREEN WAS BUILT NEXT, OUT OF THE PLAN'S ORIGINAL ORDER ──────
 * It is the most-linked unbuilt page in the app: the shell's bottom nav, the
 * mobile drawer and the account menu all point here, plus `/leagues`' right
 * rail. Three of those four live in the LAYOUT, so until this existed the dead
 * link was on every signed-in screen rather than on one page.
 *
 * ── FOUR SECTIONS, AND ONLY ONE OF THEM IS ABOUT THE GAME ─────────────────
 * Profile, Sign-in, Email, Sign out. Nothing here is league-scoped and nothing
 * here is a season: this is the account, and the board's own subtitle — "one
 * account across every league you are in" — is the line that keeps it that way
 * when someone later proposes putting a league setting on it.
 *
 * ── THE GATE IS `requireUser`, AND THE READ IS ALREADY SCOPED ─────────────
 * Every RPC behind this page resolves its row from `auth.uid()`, so there is no
 * id in flight that could name another account. `notFound()` on a missing
 * profile row rather than an empty screen: a signed-in user without a profile
 * is a broken account, not an empty one.
 */
export default async function AccountPage() {
  const { supabase, user } = await requireUser();
  const account = await getAccountPage(supabase, user.id);
  if (!account) notFound();

  return (
    <main className="mx-auto flex max-w-measure-page flex-col gap-6 px-8 py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/leagues" />}>
              Your leagues
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Account</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <h1>Account</h1>
        <p className="type-dek text-dek text-muted-foreground">
          One account across every league you are in.
        </p>
      </div>

      {/* The board sets this column at 720px against a 1152px page. The sections
          are forms and reading, not a dashboard — full page width would stretch
          a label and its field two feet apart. */}
      <div className="flex max-w-180 flex-col gap-10">
        <ProfileSection
          initials={account.initials}
          displayName={account.displayName}
          bio={account.bio}
        />
        <SignInSection
          email={account.email}
          confirmed={account.emailConfirmed}
          providers={account.providers}
        />
        <EmailSection preferences={account.preferences} />
        <SignOutRow />
      </div>
    </main>
  );
}
