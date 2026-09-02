"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LeagueMark } from "@/components/league-mark";
import { SkipLink } from "@/components/skip-link";
import { resolveFocusedLeague } from "@/lib/league-focus";
import type { NavLeague } from "@/lib/nav";
import type { ShellAlert } from "@/lib/shell-alerts";

import { AccountMenu } from "./account-menu";
import { BottomNav } from "./bottom-nav";
import { LeagueSwitcher } from "./league-switcher";
import { MobileDrawer } from "./mobile-drawer";
import { isCurrent, sectionLinks, settingsLink } from "./nav-links";
import { NotificationBell } from "./notification-bell";
import { SearchCommand } from "./search-command";

/**
 * THE SIGNED-IN FRAME — two bands, and the split between them is the point.
 *
 * BAND 1 IS INK, and it is the same black bar the signed-out header already
 * paints: signing in should not change what the top of the app looks like.
 * It is also the only ground in this palette where the accent is legal as
 * text (`--nav-primary` at 5.59:1), which is why the wordmark lives there and
 * why nothing else in the frame is red.
 *
 * BAND 2 IS SHEET, not paper. It used to be `--background`, which is the exact
 * value the page behind it also paints, so the band had no ground at all and a
 * 1px rule was the only thing saying a frame existed. Sheet gives the chrome
 * its own tone: ink, then sheet, then the paper page. The bottom nav takes the
 * same sheet for the same reason.
 *
 * BAND 2 IS A SECTION STRIP, not a row of pills. The old current-item chip was
 * `--muted` on `--background` — a measured 1.06:1, which is not a marker. A
 * section is marked the way this app's own phone nav already marks one: a 2px
 * ink rule on the band's edge, with the label set in the narrow uppercase the
 * rest of the app shouts its headings in. The two navigations now agree.
 *
 * THIS COMPONENT RENDERS NO `<main>`. Every page owns its own landmark; two
 * would fail the accessibility pass on every screen at once.
 *
 * It is a client component because the current-item highlight needs
 * `usePathname`, and because the switcher, the bell and the menus are all
 * interactive. Everything it draws was fetched by `layout.tsx` and passed in —
 * nothing here reaches for data.
 */
export function AppShell({
  leagues,
  alerts,
  profile,
  children,
}: {
  leagues: NavLeague[];
  alerts: ShellAlert[];
  profile: { id: string; name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const focused = resolveFocusedLeague(leagues, pathname);

  // NO SECTIONS ON THE ACCOUNT HOME. `/leagues` is tier one — it is about the
  // viewer across every league — and `resolveFocusedLeague` still has to name
  // one for the switcher, so the strip would otherwise offer Season, Payouts
  // and Dues for a league the reader has not opened while a list of four sits
  // below it. Caught in the drive: signed in, landed here, and the band was
  // pointing at whichever league sorted first. An organisation's tabs do not
  // appear on the account dashboard for the same reason.
  const onAccountHome = isCurrent(pathname, "/leagues", true);
  const sections = onAccountHome ? [] : sectionLinks(focused);
  const settings = onAccountHome ? null : settingsLink(focused);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-40">
        <SkipLink />

        <div className="flex h-14 items-center gap-1 bg-nav px-2 text-nav-foreground md:h-19 md:px-8">
          <MobileDrawer leagues={leagues} focused={focused} pathname={pathname} />

          {/* THE MASTHEAD, and on a desktop it is set at the h2 scale, not at
              the eyebrow's. Two bands of near-equal height read as two slabs; a
              trade paper's masthead has mass and its section strip is thin
              underneath it. So the ink band grows to 76px, the strip drops to
              44px, and the name is finally the largest thing on the band rather
              than the smallest.

              THE ABBREVIATION SURVIVES BELOW `md`, where the drawer button and
              three controls have already taken the width and the band stays at
              56px. Both spans are decorative; the `sr-only` name is what any
              screen reader announces at either width. */}
          <Link
            href="/leagues"
            className="type-eyebrow text-ui md:type-h2 md:text-h2 rounded-lg px-2 py-1 text-nav-primary md:px-0 outline-none focus-visible:ring-3 focus-visible:ring-nav-foreground/30"
          >
            <span aria-hidden className="hidden md:inline">
              The Movie Pool
            </span>
            <span aria-hidden className="md:hidden">
              TMP
            </span>
            <span className="sr-only">The Movie Pool — home</span>
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <SearchCommand />
            <NotificationBell alerts={alerts} />
            <AccountMenu name={profile.name} email={profile.email} profileId={profile.id} />
          </div>
        </div>

        {/* THE NAV BAND, desktop only. On a phone this same list lives in the
            drawer, because a row that scrolls sideways under a thumb is a worse
            control than a list you can scroll down.

            IT IS A LANDMARK, and it is the only one the signed-in app has on a
            desktop: `BottomNav` carries the same `aria-label` but is
            `md:hidden`, and `display: none` takes an element out of the
            accessibility tree entirely. So exactly one "Primary" navigation is
            ever exposed, and which one depends on the viewport. */}
        <nav
          aria-label="Primary"
          className="hidden h-11 items-stretch gap-7 border-b bg-card px-8 md:flex"
        >
          {/* TIER ONE, AND IT IS NOT A SECTION. "Your leagues" is the account
              home — the same words the breadcrumb root and the switcher's own
              heading already use for the same destination, which is one fewer
              thing in the frame disagreeing with another. It was labelled
              "Home" while the landing rule worked hardest to route past it;
              ADR-443 made it where sign-in lands, and the label now says what
              the page is. The rule separates it from the league's sections,
              because it is a different tier rather than a seventh destination. */}
          <NavItem
            href="/leagues"
            label="Your leagues"
            current={isCurrent(pathname, "/leagues", true)}
          />
          {sections.length > 0 && (
            <span aria-hidden className="my-2.5 w-px shrink-0 bg-border" />
          )}
          {sections.map((link) => (
            <NavItem
              key={link.href}
              href={link.href}
              label={link.label}
              current={isCurrent(pathname, link.match, link.exact)}
            />
          ))}
          <div className="ml-auto flex items-center gap-4">
            {settings && (
              <NavItem
                href={settings.href}
                label={settings.label}
                current={isCurrent(pathname, settings.match, settings.exact)}
              />
            )}
            <LeagueSwitcher leagues={leagues} focused={focused} />
          </div>
        </nav>

        {/* The phone's stand-in for the switcher, which is inside the drawer
            there: without it nothing on screen says which league you are
            looking at, and a member can belong to several. */}
        {focused && (
          <div className="flex h-12 items-center gap-2 border-b bg-card px-4 md:hidden">
            <LeagueMark
              id={focused.id}
              name={focused.name}
              className="size-5.5"
            />
            <span className="type-ui truncate text-ui">{focused.name}</span>
          </div>
        )}
      </header>

      <div className="flex-1">{children}</div>

      <BottomNav focused={focused} pathname={pathname} />
    </div>
  );
}

/**
 * THE SECTION RULE — the shared look of every item on the strip.
 *
 * The rule is drawn as an inset shadow rather than a border so it lands ON the
 * band's own bottom border instead of adding a second line above it, and so an
 * item's height never changes between states. `BottomNav` draws the identical
 * 2px from the opposite edge; a bar under your thumb marks from the top, a bar
 * over the page marks from the bottom.
 */
const NAV_ITEM =
  "type-eyebrow text-ui flex items-center outline-none focus-visible:ring-3 focus-visible:ring-ring/30";
const NAV_CURRENT = "text-foreground shadow-[inset_0_-2px_0_0_var(--foreground)]";
const NAV_RESTING = "text-muted-foreground hover:text-foreground";

function NavItem({
  href,
  label,
  current,
}: {
  href: string;
  label: string;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`${NAV_ITEM} ${current ? NAV_CURRENT : NAV_RESTING}`}
    >
      {label}
    </Link>
  );
}
