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

import { AccountSections } from "./_components/account-sections";
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
 * ── IT IS AN INDEX AND ONE PANEL, NOT FOUR STACKED SECTIONS (2026-09-02) ──
 * The four sections used to stack in one 720px column at equal spacing, on a
 * 1152px page whose other two thirds were empty. That reads as a document, and
 * NOBODY READS THIS PAGE — they arrive from the account menu, the bottom nav or
 * the drawer to change one specific thing, and every one of those errands was a
 * scroll past the other three. `AccountRail` names all of them at once in the
 * space the page already had, and takes Sign out with it: the one irreversible
 * control here was sitting at the end of the longest scroll.
 *
 * SWITCHED PANELS, WHICH WAS THE SECOND ANSWER. The first build kept all three
 * stacked and used the index only to jump, on the argument that three short
 * sections do not earn a tab. Driven, they do: the stacked page was a 720px
 * ribbon with 112px of dead canvas beside it, because ONE column cannot size
 * both a display-name field and a row whose button belongs at the far end. One
 * panel at a time lets the rows take the full width while the fields keep a
 * measure, and it turns "which section" into state instead of a guess about
 * scroll position. `#signin` still opens Sign-in, so nothing was lost.
 *
 * What is NOT borrowed from `@shadcnblocks/settings-profile4` is its single
 * sticky save bar. This page has three independent server actions, each with
 * its own result to report, and one button over them would have to lie about
 * what it saved.
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
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-measure-page flex-col gap-6 p-6 md:p-8">
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

      {/* THE PANEL TAKES THE WIDTH THE RAIL LEAVES, and the fields inside it
          take a MEASURE. The board's 720px column was one number doing two
          jobs — holding a label beside its field, and holding a row whose
          button belongs at the far end — and it did the second badly, leaving
          112px of canvas unused. Width is decided per control now, in `ch`,
          which is the unit a field is actually measured in. */}
      <AccountSections
        profileId={account.profileId}
        displayName={account.displayName}
        email={account.email}
        profilePanel={
          <ProfileSection displayName={account.displayName} bio={account.bio} />
        }
        signInPanel={
          <SignInSection
            email={account.email}
            confirmed={account.emailConfirmed}
            providers={account.providers}
          />
        }
        emailPanel={<EmailSection preferences={account.preferences} />}
      />

      {/* BELOW `lg` ONLY — the rail carries it above that. Two forms in the
          markup, never two in the accessibility tree: `display: none` removes
          the hidden one, the same mechanism that keeps the shell to one
          `aria-label="Primary"` per viewport. */}
      <SignOutRow />
    </main>
  );
}
