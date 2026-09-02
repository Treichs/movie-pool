"use client";

import { useEffect, useState } from "react";

import { signOut } from "@/app/(auth)/actions";
import { PlayerAvatar } from "@/components/player-avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * THE SECTION INDEX, AND THE THREE PANELS IT SWITCHES BETWEEN.
 *
 * ── WHY THE PAGE NEEDED ONE ───────────────────────────────────────────────
 * Nobody browses `/account`. They arrive from the account menu, the bottom nav
 * or the drawer to change ONE thing — a name, a password, whether the app mails
 * them — and the old single 720px column made every one of those an errand past
 * the other three. The index names all of them at once, in a column that was
 * empty anyway.
 *
 * ── IT SHOWS ONE SECTION, AND THAT IS THE SECOND VERSION ──────────────────
 * The first build kept all three stacked and used the index only to jump. That
 * left two problems a drive made obvious. The page was a 720px ribbon with
 * 112px of dead canvas beside it, because a column sized for a label and its
 * field was also sizing rows that want the whole width. And a jump index on a
 * page with 293px of total scroll is a control for a distance nobody travels.
 *
 * Switching panels answers both. The panel takes ALL the width the rail leaves
 * — the sign-in and email rows are rows, and a row wants the width — while the
 * text fields inside are held to a measure, which is the reason a field is ever
 * narrow. And "which section" becomes real state rather than a guess about
 * scroll position, which is what the two deleted scroll-spies were for.
 *
 * ── `keepMounted`, AND IT IS NOT AN OPTIMISATION ──────────────────────────
 * Base UI unmounts a hidden panel by default (checked in
 * `node_modules/@base-ui/react/tabs/panel/TabsPanel.d.ts`). Unmounted, typing a
 * bio and stepping over to Sign-in throws the draft away with no warning — and
 * these are React 19 controlled forms whose state lives in the component. The
 * panels stay in the DOM and go `hidden`, so a half-written bio survives a
 * detour and the browser keeps them out of the accessibility tree for free.
 *
 * ── THE HASH IS THE TAB, SO A SECTION STAYS LINKABLE ──────────────────────
 * `/account#signin` opens Sign-in on a cold load, and changing tab rewrites the
 * hash. `replaceState`, not push: a tab is not a page, and back should leave
 * the account rather than walk three panels in reverse.
 *
 * ── SIGN OUT IS NOT A FOURTH TAB ──────────────────────────────────────────
 * It sits below a rule as a button. The list above it navigates, this one acts,
 * and drawing them alike would be the page's only real trap. It used to be a
 * bordered row under the last form, which put the one irreversible control here
 * at the end of the longest scroll.
 */
const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "signin", label: "Sign-in" },
  { id: "email", label: "Email" },
] as const;

const IDS: string[] = SECTIONS.map((s) => s.id);

export function AccountSections({
  profileId,
  displayName,
  email,
  profilePanel,
  signInPanel,
  emailPanel,
}: {
  profileId: string;
  displayName: string;
  email: string;
  profilePanel: React.ReactNode;
  signInPanel: React.ReactNode;
  emailPanel: React.ReactNode;
}) {
  const [tab, setTab] = useState<string>(SECTIONS[0].id);

  // THE HASH IS READ AFTER MOUNT, NEVER DURING RENDER. It is not sent to the
  // server, so a first paint derived from it would be a guess hydration has to
  // undo. Profile is the honest default until the URL says otherwise.
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      if (IDS.includes(hash)) setTab(hash);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = String(value);
        setTab(next);
        window.history.replaceState(null, "", `#${next}`);
      }}
      orientation="vertical"
      className="gap-8 max-lg:flex-col lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-12"
    >
      <div className="flex flex-col gap-5 lg:sticky lg:top-32 lg:h-fit">
        {/* THE ACCOUNT ITSELF, ABOVE THE INDEX. Not decoration and not editable:
            this app is one account across several leagues and the display name
            is the label on the whole history, so the rail says WHICH ACCOUNT
            YOU ARE CHANGING before it says where to go. The field that changes
            it is in the panel to the right, under its warning.

            Desktop only — on a phone the page's own h1 is two inches up and
            there is no rail for it to head. */}
        <div className="hidden items-center gap-3 lg:flex">
          <PlayerAvatar
            id={profileId}
            name={displayName}
            className="size-11 shrink-0"
          />
          <div className="flex min-w-0 flex-col">
            <span className="type-h3 truncate text-ui">{displayName}</span>
            <span className="type-body truncate text-micro text-muted-foreground">
              {email}
            </span>
          </div>
        </div>

        {/* `line`, not the filled default. A 2px ink rule, no pill, and NO
            VERMILION — the accent means *live and yours* and belongs to an open
            week.

            THE RULE IS MOVED TO THE LEADING EDGE, which is a correction to the
            registry default and to my own first reading of it. `tabs.tsx` puts
            a vertical tab's mark on its RIGHT, and the app's rule of thumb says
            a bar marks from the edge it faces the page across, which argues for
            the same. Both are wrong here for a reason only the drive showed: a
            rail trigger is `w-full` at 208px with its label at the left, so the
            mark landed two hundred pixels from the word it was marking and read
            as a stray line down the gutter. The nav band's items are only as
            wide as their labels, which is why the rule holds there and not
            here. Adjacency beats the analogy.

            THE `!` ON THE PHONE OVERRIDES IS LOAD-BEARING. `tabs.tsx` drives
            its layout off the ROOT's `data-orientation` through
            `group-data-vertical/tabs:*`, and orientation is a prop, not a
            breakpoint — so a list that is a rail on desktop and a row on a
            phone is a case the primitive does not model. A plain `max-lg:` lost
            to the group variant and shipped a vertical list with a stranded
            marker and a scrollbar; these are the same utilities, forced. The
            alternative was editing `tabs.tsx` for one page, which is what tier
            one exists to prevent. */}
        <TabsList
          variant="line"
          className="w-full gap-1 p-0 max-lg:flex-row!"
        >
          {SECTIONS.map(({ id, label }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="max-lg:flex-1 max-lg:after:inset-x-0! max-lg:after:inset-y-auto! max-lg:after:-bottom-1! max-lg:after:h-0.5! max-lg:after:w-auto! lg:after:right-auto lg:after:-left-1"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <form action={signOut} className="hidden border-t pt-5 lg:block">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
          <p className="type-body mt-2 text-micro text-muted-foreground">
            On this device only. To end other sessions, change your password.
          </p>
        </form>
      </div>

      <div className="min-w-0">
        <TabsContent value="profile" keepMounted>
          {profilePanel}
        </TabsContent>
        <TabsContent value="signin" keepMounted>
          {signInPanel}
        </TabsContent>
        <TabsContent value="email" keepMounted>
          {emailPanel}
        </TabsContent>
      </div>
    </Tabs>
  );
}
