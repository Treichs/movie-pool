import Link from "next/link";

import { PublicHeader } from "@/components/public-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { peekInvite } from "@/lib/invites";

import { InviteDecision } from "./_components/invite-decision";

export const metadata = { title: "You have been invited" };

/** The page is one centred column at every state, so the frame is written once
 *  and the states differ only in what they put inside it. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader signedIn />
      <main id="main" tabIndex={-1} className="flex items-center justify-center px-6 py-20">
        <div className="flex w-full max-w-160 flex-col gap-7">{children}</div>
      </main>
    </>
  );
}

/** One row of the facts panel. A `<dl>`, because that is exactly what these
 *  are — a label and its value — and a screen reader then reads them as pairs
 *  rather than as eight loose strings. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <dt className="type-body text-ui text-muted-foreground">{label}</dt>
      <dd className="type-numeral text-ui">{value}</dd>
    </div>
  );
}

function Dead({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Frame>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          The invitation
        </span>
        <h1>{title}</h1>
      </div>
      {children}
      <div className="flex justify-center">
        <Button
          render={<Link href="/leagues" />}
          nativeButton={false}
          variant="ink"
        >
          Go to your leagues
        </Button>
      </div>
    </Frame>
  );
}

/**
 * `/invites/[token]` — WHERE AN EMAILED INVITATION LANDS.
 *
 * ── IT IS GATED, BECAUSE THE READ ITSELF IS ───────────────────────────────
 * `peek_league_invite` raises "must be signed in" when auth.uid() is null, so
 * there is no anonymous preview of this screen to build. A signed-out visitor
 * is bounced by the proxy to /login?next=/invites/<token> and returns here with
 * a session — which is the flow the proxy's own comment describes.
 *
 * ── IT SITS OUTSIDE `(member)`, WHICH THE PLAN'S FILE LIST DID NOT ────────
 * Board 4.9 strips the chrome to a single line and centres one decision. That
 * is right: the app shell's switcher and nav invite someone to wander off
 * instead of answering the question, and for a person joining their FIRST
 * league most of that shell has nothing in it. The gate moves into the page,
 * where every composer's gate belongs anyway.
 *
 * ── FOUR STATES, NOT THE THREE THE PLAN NAMED ─────────────────────────────
 * Read straight off what the RPCs can actually tell apart:
 *
 *   1. peekInvite returns null — the token is not a real invitation.
 *   2. alreadyMember — you are in this league already. Not a failure.
 *   3. TARGETED AT SOMEONE ELSE. accept_league_invite refuses when a targeted
 *      invitation's address is not the caller's, and `targetedAt` lets the page
 *      say so BEFORE the click. This is the state that strands a real person:
 *      they opened their own mail while signed in as another account, and every
 *      other wording would tell them their invitation was broken when it is
 *      their session that is wrong.
 *   4. expired.
 *
 * ── WHY (4) IS WORDED FOR TWO CAUSES ──────────────────────────────────────
 * peek computes `expired` as "expires_at < now() OR accepted_at is not null",
 * so for a TARGETED invitation it fuses "ran out of time" with "already used".
 * The two are separable only by a change to that function. For an OPEN link the
 * flag is unambiguous — accepted_at is never stamped on one, deliberately, so
 * that a link shared with a group stays usable — and the copy differs
 * accordingly rather than hedging in both cases.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { supabase, user } = await requireUser();
  const invite = await peekInvite(supabase, token);

  if (!invite) {
    return (
      <Dead title="This link isn&apos;t valid">
        <p className="text-center text-muted-foreground">
          It may have been mistyped or cut short by an email client. Ask whoever
          invited you to send it again.
        </p>
      </Dead>
    );
  }

  // MEMBERSHIP IS CHECKED FIRST, AND THE ORDER IS A DECISION. Someone who is
  // already in the league gets that answer even when the invitation was
  // addressed to somebody else, because it is the more useful of two true
  // statements: they need nothing, and telling them whose invitation they are
  // holding does not change that.
  if (invite.alreadyMember) {
    return (
      <Dead title={`You are already in ${invite.leagueName}`}>
        <p className="text-center text-muted-foreground">
          Nothing to do — following this link twice is harmless.
        </p>
      </Dead>
    );
  }

  // A TARGETED invitation names one address and refuses every other, so the
  // mismatch is worth catching here rather than letting the RPC throw it.
  const wrongAccount =
    invite.targetedAt !== null &&
    invite.targetedAt.toLowerCase() !== (user.email ?? "").toLowerCase();

  if (wrongAccount) {
    return (
      <Dead title="This invitation is for a different account">
        <Alert>
          {/* THE ADDRESS IT WAS SENT TO IS NOT PRINTED, though `peek` returns
              it. Whoever is reading this holds a token that was emailed to
              someone else — a forwarded message, a shared screen, a link that
              got loose — and naming the recipient would hand that person's
              email address to exactly the reader who should not have it. The
              viewer's OWN address is safe to show and is the useful half: the
              person who owns the mailbox knows which account to switch to, and
              nobody else learns anything. */}
          <AlertTitle>You are signed in as {user.email}</AlertTitle>
          <AlertDescription>
            This invitation was sent to a different address. Sign out, sign back
            in as the one the email arrived at, and open the link again — the
            invitation is still waiting and nothing about it has been used up.
          </AlertDescription>
        </Alert>
      </Dead>
    );
  }

  if (invite.expired) {
    return (
      <Dead title="This invitation is no longer good">
        <p className="text-center text-muted-foreground">
          {invite.targetedAt
            ? "It has either expired or already been used. Ask whoever invited you for a new one — it takes them a moment."
            : "This link has expired. Ask whoever shared it for a new one."}
        </p>
      </Dead>
    );
  }

  return (
    <Frame>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          You have been invited
        </span>
        <h1>{invite.leagueName}</h1>
        <p className="text-muted-foreground">
          Joining puts you on the roster. If a season is still filling up, it
          puts you in that season too.
        </p>
      </div>

      {/* THE FACTS PANEL, which board 4.9 draws and which cost a migration to
          make possible: every table behind these is RLS'd to members, so
          peek_league_invite had to be extended to answer at all
          (20260829010000). The board's fourth row is "next season starts";
          `seasons` has no start date, and what a person actually needs to know
          is whether joining puts them in the season already running — which is
          the rule `accept_league_invite` applies, asked before the click
          instead of discovered after it.

          THE MEMBERS' AVATARS ARE NOT HERE, deliberately. That is a roster —
          names and faces of people who never agreed to be shown to whoever
          holds a link — and the count answers the question the panel is for. */}
      <dl className="divide-y rounded border bg-card">
        <Fact label="Members" value={String(invite.memberCount)} />
        {invite.bankroll !== null && (
          <Fact label="Season bankroll" value={`$${invite.bankroll}`} />
        )}
        {invite.winningTiers !== null && (
          <Fact label="Winning tiers" value={String(invite.winningTiers)} />
        )}
        <Fact
          label="This season"
          value={
            invite.joinsCurrentSeason === null
              ? "None running yet"
              : invite.joinsCurrentSeason
                ? "You are in it"
                : "You play from the next one"
          }
        />
      </dl>

      <InviteDecision token={token} />
    </Frame>
  );
}
