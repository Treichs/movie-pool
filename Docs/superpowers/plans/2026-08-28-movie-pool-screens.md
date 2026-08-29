# The Movie Pool — Screen Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining 22 screens of the 25-route contract, in the order a real person meets them, on top of an app shell that does not exist yet.

**Architecture:** Next.js App Router with React Server Components. Every page is a *placer*: it gates, calls one composer from `src/lib/`, and hands the result to components. Writes are `'use server'` actions colocated in the segment's own `actions.ts`. Authorization precedes every fetch, enforced by the type system rather than by memory — a composer takes an authenticated context, and the only way to obtain one is a `require*` helper that has already checked.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · shadcn/ui on Base UI, plus `@reui` · Supabase (Postgres, Auth, RLS, `SECURITY DEFINER` RPCs) · Vercel.

**Spec:** [Docs/ia-screen-map.md](../../ia-screen-map.md) is the route contract. [Docs/movie_pool_official_rules.md](../../movie_pool_official_rules.md) is the rulebook and outranks every screen. The design canvas holds one board per screen, and **the board is the approved layout**.

**Design canvas:** <https://claude.ai/code/artifact/224e174f-ce5d-4490-8995-004408f7c4bf> — "Movie Pool Phase 6 Screens", 27 artboards. Every screen task names its **board** by number, and that number is the artboard's title on this canvas. **Open the board before writing the screen.**

The number reads `<section>.<screen>`, and the section says where in the app the screen sits:

| Section | What it covers | Boards |
|---|---|---|
| `0` | The pitch — the signed-out landing page | `0.1` |
| `1` | Getting in — the four auth screens | `1.1`–`1.4` |
| `2` | Readable without a league — how it works, films, players | `2.1`–`2.4` |
| `3` | Playing a season | `3.1`, `3.2` |
| `4` | A league, its records, and your account | `4.1`–`4.11` |
| `5` | Commissioner-only | `5.1a`, `5.1b`, `5.2` |

A letter suffix (`1.3b`, `5.1a`/`5.1b`) is a **second board for the same route** — a distinct state or role, drawn separately because it is a real screen rather than a toast.

**A board's title can name a pre-rename address.** The canvas was drawn on 2026-08-23; the routing pass on 2026-08-28 ([ia-screen-map.md](../../ia-screen-map.md) §7.5) renamed four addresses, and the boards were not retitled. Board `4.1` is still called `/home` and builds `/leagues`. **The route contract wins over a board's title; the board's layout wins over everything else.**

**The shell has its own board, drawn after the canvas:** <https://claude.ai/code/artifact/9a7b3dbb-4c6c-43e7-a15f-1274b038fbb4> — "Movie Pool App Shell". Task 1 was built from it.

**Reference repo:** `C:\Dev\Git\movie_pool_app` — the previous implementation. **Read it freely; it is reference, not a base.** Its five component tiers, nine-link governance chain and 1,400-line `tokens.css` are what this rebuild exists to be rid of. Where a task says *port*, it means copy the working logic; where it says *build*, it means search the registry and compose fresh.

---

## Global Constraints

Every task's requirements implicitly include this section.

### The gate

```
npm run verify   →  typecheck · lint · a11y:contrast · types:fresh · build
```

**Never run `npm run build` while `npm run dev` is running** — it corrupts the dev server's chunks and every route 500s. Drive on a second port: `npx next dev -p 3100`.

### The seven conditions — in force for every screen task

1. `page.tsx` renders from a `src/lib` composer, with the authz gate preceding the fetch.
2. Its writes are `'use server'` actions in the segment's own `actions.ts`, returning `ActionResult`, calling `revalidatePath`. A write two routes share moves to `src/lib/actions/`.
3. Route-private components live in the segment's `_components/`. **A component moves to `src/components/` the first time a second screen needs it — never in anticipation.** The cost of getting it wrong is one file move.
4. The segment has an `error.tsx`.
5. Anything the screen replaced, and its now-unreferenced components, are deleted in the same commit.
6. `npm run verify` is green.
7. The screen has been driven in a browser at **1440×900** — desktop only (Ruling 78).

### Condition 7 — the drive, exactly

Use the **`ui-review` skill** ([.claude/skills/ui-review/SKILL.md](../../../.claude/skills/ui-review/SKILL.md)). Do not invent a harness.

- Sign in as the role the screen is for, using the `npm run seed:dev` fixtures: `dev-commish@moviepool.local`, `dev-player@moviepool.local`, `dev-outsider@moviepool.local` (no league), password `dev-Passw0rd!`.
- For a write surface, **complete the write and confirm the row in the database** — a banner is not evidence.
- Console must be clean. Exactly one `<main>`. Every control with an accessible name. This repo has no rendered-page axe, so that check is manual by necessity.
- **Report what was NOT driven** — roles not signed in as, states with no fixture, branches not reachable.
- Clean up anything the drive wrote to the shared dev database.

**Ruling 78's reversal condition:** the moment a screen is built with a fixed width, a horizontal-scroll container that assumes desktop, or a `min-width` that would force a phone to pan, restore the 390×844 capture for that screen.

### The route contract

25 addresses, listed in [Docs/ia-screen-map.md](../../ia-screen-map.md) §1. **No further IA change without a redirect.** If a screen turns out to need a different address, stop and raise it — do not change it inside a screen task.

### Authoring rules

- **No raw palette classes.** `globals.css` sets `--color-*: initial`, which deletes Tailwind's stock palette. `bg-blue-500` emits no CSS at all. It is not a lint rule; the class does not exist.
- **A class naming a deleted token is silent at every gate.** `bg-black/30`, `bg-white/[.08]`, `bg-surface-secondary` all compile, lint, build and pass `a11y:contrast` while painting nothing. Four have been caught this way. **Look at the pixels.**
- **No hand-written native form elements** — `<input> <select> <textarea> <table> <details> <button>`. Use the vendored primitive.
- **No arbitrary Tailwind values.** The colour namespace is not disable-able.
- **ONE SHAPE, ONE FILE.** One `button`, one `table`, one `sheet`. When the app needs a different shape, **modify the primitive in place**. Wrapping is what produced two badges, two empty states and three buttons in the old repo.
- **Sourcing runs EXISTS → INSTALL → BUILD.** Search the configured registries (`@shadcn`, `@shadcnblocks`, `@reui`, `@animate-ui`, `@8bitcn`) before writing UI. `src/components/ui/` is what is **installed**, not what is **available**; reaching "not vendored, so I'll compose it" from an `ls` is the documented failure mode. Use the shadcn MCP server.
- **`--dry-run` first, every time.** `-o/--overwrite` is the only flag that can lose work; the "already exists" prompt defaults to No and `-y` does not bypass it. Read `~ overwrite` in a dry run as *"this file differs from the registry copy"* — those are exactly the files already customised here (`src/lib/utils.ts` carries a tailwind-merge extension; `ui/button.tsx` carries the `ink` variant). Any of them is a stop-and-read.
- **`@reui` auth blocks are licence-gated** and 401 without a key; `@reui/frame` is free. `@shadcnblocks` works once `SHADCNBLOCKS_API_KEY` is exported from `.env.local`.

### The layer contract — two tiers, no plugin

- **Components:** `src/components/ui/` is shadcn and registry code, edited in place. `src/components/reui/` is where `@reui` installs itself, treated identically. Everything else starts in the route's `_components/` and moves to `src/components/` the first time a second route needs it.
- **Reads:** composers live in `src/lib/`. A page imports its composer directly. A composer may import another composer — the DAG that forbade it is deleted, so an existing helper is **reused, not re-derived**.
- **Writes:** colocate in the segment's `actions.ts`; move to `src/lib/actions/` only when a second route needs the same write.
- **Authz precedes the fetch.** A review point, not a lint rule.
- Import the Supabase client through `@/lib/supabase`, which re-exports `SupabaseClient` already bound to the generated schema. Narrow a form value to a database enum with `asEnum` from the same module.
- **All writes go through `SECURITY DEFINER` RPCs.** Direct table writes are refused. **Money and standings are derived, never stored.**

### The design system

| Token | Value | Rule |
|---|---|---|
| `--background` (paper) | `#F5F4F3` | the ground |
| `--card` | `#FFFFFF` | panels |
| `--foreground` (ink) | `#000000` | 19.12:1 on paper |
| `--primary` (printer red) | `#C52F1B` | the paper-side accent. 5.04:1 — legal as a ground **and** as text. **One per surface.** |
| `--nav-primary` (vermilion) | `#EB4B37` | the ink-side accent, 5.59:1 on `--nav`. **Ink surfaces only** — it is 3.42:1 on paper. |
| `--link` (cobalt) | `#14567A` | links, and the past tense |
| `--muted` / `--input` | `#EDECEA` | field ground |
| `--border` | `#DCDBD9` | panel edges — decoration, no ratio required |
| `--edge` | `#84827E` | **control boundaries** — anything you type in, tick or open. 3.25:1 at its worst ground, one value in both modes. |
| `--radius` | `0.25rem` | drives every corner. No component hardcodes one. |
| `--container-measure-page` | `72rem` | the page frame |

**The accent is one colour at two lightnesses, and which one you reach for is decided by the ground, not by taste.** A red readable on paper and a red readable on the ink band cannot be the same value — the luminance windows do not overlap. `--primary` is the paper-side red and **never appears on an ink surface**; `--nav-primary` is the ink-side red and **never appears on paper**. Getting this wrong passes every gate and is visible only in the pixels.

**Errors carry ink; the brand owns red.** Settled 2026-08-28 with the palette pass. `--destructive` (`#7A1D10`, 9.51:1) is for a destructive **action** — a delete button, a finalize warning — not for every validation message, because a red error beside a red brand reads as one thing. `--success` `#266445` and `--warning` `#76550A` follow the same rule: reached for deliberately, not by category habit. There is no amber in this palette, so no traffic light can be built from it.

**Width is the hierarchy.** One family (Archivo, `wdth` 62–125 × `wght` 100–900). Display is `wdth 62`, h1 `64`, h2 `70`, body `100`, numerals `78`. Use the `type-*` utilities paired with their `text-*` sizes — never one without the other.

**Elevation is two tiers.** A panel sits **on** the page: 1px `--border`, no shadow. Only something that **overlaps content** — dropdown, popover, sheet, sticky action bar — carries `--shadow-raised`.

**Never hard-code the number of winning tiers.** It is `season_settings.top_n_distinct`, default 3, marked **[Configurable]** in the rulebook. Ties are always honoured, so a film can have more owners than tiers.

### The two ratchets

Both in [scripts/a11y/contrast.mjs](../../../scripts/a11y/contrast.mjs), both with their reasoning in the file:

- **`MIN_PAIRS` is 143.** It rises as screens put more tokens into use. Raise it in the same commit as the screen that raises the count; lowering it needs a reason. It went 137 → 143 on 2026-08-28, when `--edge` and `--nav-primary` entered the sweep.
- **A state token named `<surface>-<role>` is swept against that surface only.** `--nav-primary` is 5.59:1 on `--nav` and 3.42:1 on paper; sweeping it against every ground would fail it for being used correctly. This rule replaced a hand-written carve-out that had exempted `--primary` from text checks entirely — the carve-out is gone, and the file records why.
- **`MIN_STACK_DEPTH` is 1.** Raise it to 2 in the same commit as the first screen that renders a tinted panel inside a tinted panel.

### Commit discipline

One screen, one commit, on branch `frontend/rebuild-ground`. Message form `feat(<surface>): <what the screen now does>` — or `refactor`/`fix` where that is honest. Every commit ends with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## Already built — do not rebuild

| Route | Where | Note |
|---|---|---|
| `/` — landing | [src/app/page.tsx](../../../src/app/page.tsx), `src/app/_components/` | Board `0.1`. Signed-in visitors are redirected; `?next=` is honoured over the ordinary landing rule. |
| `/login` | [src/app/(auth)/login/](<../../../src/app/(auth)/login/>) | Board `1.1`. **The pattern every auth screen copies** — its page comment explains why `<main>` wraps the whole shell rather than the form. |
| `/seasons/[seasonId]/weeks/[weekId]/bid` | [src/app/(member)/seasons/](<../../../src/app/(member)/seasons/>) | **The template every screen copies.** Its board is the app itself; the canvas has none. Task 1 moved it into the `(member)` group and §7.5 renamed `season` → `seasons`. |
| The six route handlers | `src/app/auth/`, `src/app/api/` | OAuth exchange, token-hash confirm, three crons, avatar composition. |
| `src/proxy.ts` | [src/proxy.ts](../../../src/proxy.ts) | Next 16's renamed middleware: session refresh, signed-out bounce to `/login`, last-league cookie. **`PUBLIC_PATHS` already lists all six public addresses** ([src/lib/supabase/proxy.ts](../../../src/lib/supabase/proxy.ts)) — Tasks 2, 3, 4 and 5 need no change here. |
| The signed-in shell | [src/app/(member)/layout.tsx](<../../../src/app/(member)/layout.tsx>), `(member)/_components/` | Task 1, below. Two bands, a league switcher, a notification bell, a mobile drawer and a bottom nav. |
| `src/lib/shell-alerts.ts` | [src/lib/shell-alerts.ts](../../../src/lib/shell-alerts.ts) | The bell's composer. Two extra queries, and only while a week is actually open. |

**Carried forward from the bid page, deliberately unfinished:**

- `PosterCard` takes an optional `href` that is **unset**. Its destination is `/leagues/[leagueId]/films/[tmdbId]` — pass it in **Task 12**.
- The commissioner strip ships with "Close bidding" only. The "Week settings" disclosure needs `CommishFormState` and the commissioner surface — **Task 22**.
- The poster card is **variant A (bid tile) on the slate, variant B (catalog tile) everywhere else**.
- `@reui/frame` is installed and unused. It was mocked up holding the bid slate with the running total in `FrameFooter`; the sticky bar won because a footer scrolls away on a long slate.

**Also already satisfied:** the corrected route map, the `verify` gate, the field shape consolidation (`ui/field.tsx` is the only definition and is byte-identical to upstream), the real `--series-1..10` hues, and the fixture week with a live `bid_deadline` three hours out.

---

## File Structure

Every screen follows one shape:

```
src/app/(member)/<segment>/page.tsx           the route: gate → read → place. No className.
src/app/(member)/<segment>/error.tsx          the segment's boundary, carrying its own <main>
src/app/(member)/<segment>/_components/*.tsx  route-private pieces
src/app/(member)/<segment>/actions.ts         the segment's writes, if it has any
src/lib/<screen>.ts                           the composer, if the screen needs a new one
src/lib/actions/<entity>.ts                   a write two routes share
```

`(member)` in parentheses is a **route group**: it does not appear in the URL. It exists so every signed-in screen shares one layout — the shell built in Task 1.

Public routes (`/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/how-it-works`, `/films/[tmdbId]`) stay outside it. `(auth)` is the group the four auth screens already share.

---

## Task Order — the user's path through the app

| # | Task | Route | Board |
|---|---|---|---|
| **1** | The app shell — **DONE**, `8df8de2` | `(member)/layout.tsx` | its own board |
| **2** | Sign up — **DONE** | `/signup` | `1.2` |
| **3** | Forgot password — **DONE** | `/forgot-password` | `1.3` / `1.3b` |
| **4** | Reset password — **DONE** | `/reset-password` | `1.4` |
| **5** | How it works | `/how-it-works` | `2.1` |
| **6** | Home | `/leagues` | `4.1` |
| **7** | Accept an invite | `/invites/[token]` | `4.9` |
| **8** | Create a league | `/leagues/new` | `4.8` |
| **9** | League home | `/leagues/[leagueId]` | `4.2` |
| **10** | Start a season | `/leagues/[leagueId]/seasons/new` | `5.2` |
| **11** | Season home | `/seasons/[seasonId]` | `3.1` |
| **12** | The week board | `/seasons/[seasonId]/weeks/[weekId]` | `3.2` |
| **13** | Film — catalog | `/films/[tmdbId]` | `2.2` |
| **14** | Film — league record | `/leagues/[leagueId]/films/[tmdbId]` | `2.3` |
| **15** | A player's profile | `/players/[profileId]` | `2.4` |
| **16** | The record book | `/leagues/[leagueId]/records` | `4.3` |
| **17** | Announcements list | `…/announcements` | `4.5` |
| **18** | Reading one | `…/announcements/[announcementId]` | `4.7` |
| **19** | Writing one | `…/announcements/new` | `4.6` |
| **20** | Account | `/account` | `4.10` |
| **21** | Dues | `/leagues/[leagueId]/dues` | `4.4` |
| **22** | League settings | `/leagues/[leagueId]/settings` | `4.11` |
| **23** | Payouts | `/seasons/[seasonId]/payouts` | `5.1a` / `5.1b` |

**Why the shell is first, ahead of sign-up.** Every auth screen's success path lands inside the app — sign-up confirms to `/leagues`, reset signs you in. Building them first means each drive stops at a 404 and "it worked" cannot be shown. One day of shell buys an honest drive on all 22.

**Task 12 must not be skipped ahead of Task 11.** The week board redirects to the already-built `/bid` when a week is biddable, and that redirect is the only thing keeping the two screens from disagreeing about which state owns the URL.

---

### Task 1: The app shell — DONE (`8df8de2`)

**Board:** the Phase 6 canvas has no board for the signed-in chrome, so one was drawn for it — <https://claude.ai/code/artifact/9a7b3dbb-4c6c-43e7-a15f-1274b038fbb4>, "Movie Pool App Shell". It is the approved shape, and it is what was built.

**What shipped.** [src/app/(member)/layout.tsx](<../../../src/app/(member)/layout.tsx>) gates with `requireUser`, makes three reads — the leagues with their open weeks, the profile, the alerts — and hands them to `AppShell` in [(member)/_components/](<../../../src/app/(member)/_components/>): `app-shell` · `nav-links` · `league-switcher` · `account-menu` · `notification-bell` · `mobile-drawer` · `bottom-nav`. **The layout renders no `<main>`** — every page owns its own landmark, and two would fail condition 7 on every screen at once.

**The gate is in the layout AND in every page, on purpose.** A layout is not a security boundary in the App Router: it does not re-run on every client navigation, and a page rendered without it would be rendered without its check too.

**Three ways the built shell departs from the shape this task first described. Each is a decision, not a drift:**

1. **Two horizontal bands, not a vertical sidebar.** ADR-023's "one league in focus, the rest a click away" is carried by the switcher, not by a sidebar; the artboard settled the geometry. Band 1 is ink and is the same black bar the signed-out header already paints — signing in should not change what the top of the app looks like. Band 2 is paper, so navigation reads as part of the page, and the switcher holds its right end.
2. **A notification bell, not a bid countdown.** The countdown stays on the bid page ([`deadline-countdown.tsx`](<../../../src/app/(member)/seasons/[seasonId]/weeks/[weekId]/bid/_components/deadline-countdown.tsx>)), where the clock it counts belongs to the thing you are looking at.
3. **No breadcrumb trail.** With every address at most two levels deep (§7.5) and every truncation landing on a real page, the nav band already says where you are.

**What it consumed and what it left behind.** `getNavLeagues` and `leagueLandingPath` in [src/lib/nav.ts](../../../src/lib/nav.ts) had zero consumers and now have one. The deploy-window retry inside `getNavLeagues` was deleted, as its own comment instructed; the outage it guarded is preserved as a comment rather than as code. `src/app/season/` moved to `src/app/(member)/seasons/[seasonId]/weeks/[weekId]/bid/` — the group is invisible in the URL, and the `season` → `seasons` rename belongs to §7.5, not to this task.

**Two Windows facts worth keeping.** `git mv` on an app directory fails with *Permission denied* while `next dev` holds a handle on it — `cp -r` then `rm -rf` is the way through. Afterwards `.next` must be deleted, because a stale `.next/types/validator.ts` still names the old route path and fails `typecheck` with `TS2307`; on this machine only PowerShell's `Remove-Item -Recurse -Force .next` succeeds.

**Two defects the gates could not see, both found by driving it:**

- Two `text-primary` sites on ink grounds went muddy under the deeper red. `a11y:contrast` checks token pairs, not which token a component reached for, so it passed. **This is exactly the failure the design-system section warns about, it happened on the first screen, and it will happen again.**
- The nav dropdown highlighted two items at once, because prefix matching let "Season home" claim the bid page's route. `isCurrent` in `nav-links.ts` now takes an `exact` flag, and a link whose current-state lives in a query string carries `match: null` rather than a route it cannot own.

---

### Task 2: `/signup` — DONE

**Board:** `1.2  /signup`

**What shipped.** Five files in [src/app/(auth)/signup/](<../../../src/app/(auth)/signup/>): `page.tsx` (the signed-in redirect, the two entrances, the `next` round-trip), `signup-form.tsx`, `signup-ink.tsx`, `confirmation-notice.tsx`, `error.tsx`. It is the first use of `AuthSplitShell` at `inkLayout="strip"`, and `signUp` and `resendConfirmation` finally have a caller.

**Sourcing.** `@shadcn/signup-05` was read and rejected: an email-only form with two providers — no password, no confirm, no name — whose dry-run wanted to overwrite `button.tsx` and `input.tsx`. The screen copies `/login`'s `login-02` grammar instead, which is its sibling and already in the repo.

**Three departures from the board, each decided rather than drifted:**

1. **Four fields, not three.** `signUp` reads a `confirm` and returns "Passwords don't match" whenever it is absent, so the drawn three-field form could never have succeeded. Settled with the developer on 2026-08-28: add the field, leave the action alone. A board is the approved layout and cannot draw a server-side rule.
2. **`?resend=` renders the confirmation panel, not the form.** `/login` has linked to that address since the day it was built and it was a 404 until now. Someone whose account exists but is unconfirmed does not need a signup form; they need the resend.
3. **The "Invited to <league>" eyebrow is not built.** The board draws it, and nothing on this route knows which league invited you — the token lives on `/invites/[token]`. It needs a public read of an invite by token and belongs to **Task 7**.

**Two defects no gate can see, both found by driving it:**

- **React 19 resets an uncontrolled form when its action completes — and a REJECTED sign-up is a completion.** One mistyped confirmation wiped the name, the email and both passwords: four fields retyped to fix one. The two identity fields are now controlled; the passwords are deliberately left to clear. **`/login` has the same bug** on its email field — one field rather than four, same cause, not fixed here.
- Echoing the values back as `defaultValue` also survives the reset, but Base UI then logs *"a component is changing the default value state of an uncontrolled FieldControl"*. A clean console is condition 7, so the fields are controlled rather than defaulted.

**Copy corrected mid-drive:** the confirmation alert read "Sent to <address>", which is false on the `?resend=` path, where nothing has just been sent. It now reads "The link goes to <address>, and it lasts one hour" — true from both entrances.

**The drive, at 1440×900, signed out.** Console clean, exactly one `<main>`, every control with an accessible name. The whole chain was completed against the live project rather than inferred from a banner: the account was created, the `handle_new_user` trigger wrote its profile carrying the display name, a confirmation token minted through the admin API verified at `/auth/confirm`, and the landing rule sent the zero-league account to `/leagues` — a 404 until Task 6, which is the correct destination arriving early. The account and its profile were deleted afterwards and their absence confirmed by query.

**Not driven, and worth naming:** Google sign-up, which needs a real consent hop; a real inbox, since the confirmation token was minted with the admin API rather than received by mail; and the resend button itself, which renders and is wired but was not clicked — a send to a `.local` address proves nothing, and a send to a real one leaves mail in somebody's inbox.

---

### Task 3: `/forgot-password` — DONE

**Boards:** `1.3  /forgot-password` **and** `1.3b  /forgot-password — sent`. Two boards, one route: **the sent state is a real state, not a toast.**

**What shipped.** Three files in [src/app/(auth)/forgot-password/](<../../../src/app/(auth)/forgot-password/>): `page.tsx`, `forgot-password-form.tsx` (both states), `error.tsx`. First use of `AuthSplitShell variant="rail"`. `requestPasswordReset` finally has a caller.

**Why the sent state is a screen.** It is the only place a person is told what to do when nothing arrives, and the reply never varies — `requestPasswordReset` says the same sentence whether or not the address has an account, and does not read Supabase's result at all, because a form that answered differently would be an account-enumeration oracle. So the copy says "IF an account exists", the resend cannot report success or failure, and in-flight is the only honest feedback it has.

**Three decisions worth keeping:**

1. **No signed-in redirect, unlike `/login` and `/signup`.** Those two bounce a signed-in visitor because being signed in is what they exist to achieve. It proves nothing here — a session that persisted on one device says nothing about whether its owner remembers the password — so bouncing would answer a real request with a page that cannot help.
2. **The email field is controlled.** Two reasons: the sent state names the address and the action does not return it, so the component is the only thing that knows it; and React 19's form reset, the defect `/signup` was built around, would otherwise wipe a malformed address before it could be corrected.
3. **The resend hides the field rather than showing it again.** Changing the address there would be a second request wearing a resend's label. Someone who mistyped goes back and starts over, which is what the panel's own copy tells them.

**Ink, not green.** The confirmation is a bordered ink panel with a mail glyph. `--success` exists and was not reached for: "we sent an email" — to an address that may be on no account at all — is not a success worth colouring.

**The drive, at 1440×900, signed out.** Console clean, exactly one `<main>`, every control named, the alert carrying `role="status"`.

- **The send is real, and provable without an inbox:** submitting `dev-player@moviepool.local` moved that row's `recovery_sent_at` from null to `2026-08-29 00:01:10+00`, so Supabase minted and dispatched a recovery token.
- **The resend path WAS tested.** Clicking "Send it again" re-ran the action and held the sent state.
- **The anti-enumeration property was tested, not assumed:** an address with no account rendered a screen byte-identical to the real one apart from the address it names.

**Not driven:** delivery. The fixtures are `@moviepool.local`, which no mail server will accept, and sending to a real address to watch it land would leave mail in somebody's inbox. The token was verified as minted rather than as received. **The drive left `recovery_sent_at` set on `dev-player`** — a token that expires within the hour and is unusable without the hash from the mail. Nothing was created, so there was nothing to delete.

---

### Task 4: `/reset-password` — DONE

**Board:** `1.4  /reset-password`

**What shipped.** Three files in [src/app/(auth)/reset-password/](<../../../src/app/(auth)/reset-password/>): `page.tsx` (which decides between two states), `reset-password-form.tsx` (the meter, the match check, the submit), `error.tsx`. `PasswordInput` gained three optional props — `value`, `onChange`, `trailing` — edited in place, because the meter and the tick both have to read what has been typed.

**A ROUTE HANDLER BUG MADE THIS SCREEN UNREACHABLE, and it was fixed here.**
`/auth/confirm`'s comment claimed *"a recovery link asked for `/reset-password`"*. It never did: `requestPasswordReset` passes `emailLinkTarget(origin)`, which is `${origin}/auth/confirm` with no `next` on it, so every recovery link fell through to the landing rule — signing the visitor in and dropping them on their league with their password still forgotten. **Proved by following a real token on 2026-08-29: it landed on `/leagues/<id>`.** `/auth/confirm` now defaults `type=recovery` to `/reset-password`. The default lives there rather than on the sent link so it holds for any recovery token however minted, and so nothing has to be added to Supabase's redirect allowlist.

**The no-session state is not on the board, and is the reason the route is public.** `PUBLIC_PATHS`'s own note says the link usually arrives with a session but not when the exchange failed, the link was spent, or it was opened in a browser the cookie never reached. The check is in the page, before the form: discovering a dead link only after typing a password twice is the version of this screen that wastes someone's time at the moment they have least patience. It names the third cause explicitly, because it looks identical to an expired link from the inside.

**Four ink steps and a word, and the rule is small on purpose.** Eight characters is the only thing the server enforces, so anything shorter is named rather than scored; above it the meter reads length past twelve and how many of the four character families appear. No red-amber-green: there is no amber in this palette, and the red that exists is the brand's, which would make a weak password look like a feature.

**Two accessibility decisions.** The four bars are `aria-hidden` and the word beside them carries the same fact through `aria-live="polite"` — it is the only feedback the meter gives a non-sighted user. The board's match tick is decorative, so it is `aria-hidden` and paired with an `sr-only` `role="status"` line reading "Passwords match."

**One defect the gates could not see.** `<Button render={<Link/>}>` renders an `<a>`, and Base UI logs an error unless it is told so: *"a component that acts as a button expected a native `<button>`"*. It is right — a link claiming button semantics breaks forms and assistive tech. Both call sites now pass `nativeButton={false}`, which is what the landing page already does.

**The drive, at 1440×900.** Console clean, one `<main>` in both states, every control named.

- Signed out with no session: the expired state renders.
- A real recovery token through `/auth/confirm` lands on `/reset-password`, signed in, eyebrow reading the account's own address.
- The meter was exercised across its range — `short` → 1 bar "Too short"; `lowercaseonly` → 3 "Good"; `Abcd1234` → 3 "Good"; `Task4-Drive-Pass!` → 4 "Strong". The tick appears only on a match, and the `sr-only` status reads "Passwords match."
- **The reset really resets.** After submitting, the new password signed in and **the old one was refused with "Invalid login credentials"** — the change was verified from both directions, not assumed from a redirect.
- **`dev-Passw0rd!` was restored** through the admin API and re-verified by signing in with it, so every later task's fixtures still work.

**Not driven:** a real inbox, again — the recovery token was minted with the admin API rather than received by mail. The other-session invalidation (`signOut({ scope: "others" })`) and the "your password was reset" notification email both ran server-side and were not observed.

**Raised, not closed: an ordinary signed-in session reaches this form** and can set a new password without knowing the old one. [src/lib/reauth.ts](../../../src/lib/reauth.ts) exists for exactly that class of problem and is `/account`'s tool (**Task 20**). Whether this route should additionally require a recovery-grade session is a policy call for the developer, not something to invent inside a screen task.

---

### Task 5: `/how-it-works`

**Board:** `2.1  /how-it-works`

**Public route — no gate, no composer.** `/leagues` links to `#faq`, so **that anchor is load-bearing.**

**Files:**
- Create: `src/app/how-it-works/page.tsx`, `_components/*.tsx`, `error.tsx`

- [ ] **Step 1: Open the board, then read the rulebook**

[Docs/movie_pool_official_rules.md](../../movie_pool_official_rules.md). **This page is the rulebook's public face and must not contradict it. If the board and the rulebook disagree, the rulebook wins and the board is wrong.**

- [ ] **Step 2: Build the four parts**

Hero, the five beats, "the rules worth knowing", and the worked example. **The worked example does the arithmetic in real numbers including the tie that produces four owners from three tiers** — that is the rule people get wrong, and showing it beats stating it.

- [ ] **Step 3: Do not hard-code the tier count in prose**

The page is public and has no season in scope, so it may say "three" **only** where it is explicitly describing the default. Word it as the default, not as the rule.

- [ ] **Step 4: Keep the `#faq` anchor**

```bash
git grep -n "how-it-works#faq"
```

Whatever id that resolves to must exist on this page.

- [ ] **Step 5: Add `error.tsx`**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it signed out, then signed in**

Public means a session with **no cookie** — confirm it renders and does not link `/leagues`. Then follow `/how-it-works#faq` from `/leagues` as a member and confirm it scrolls.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(public): how-it-works is rebuilt, and the worked example shows the tie"
```

---

### Task 6: `/leagues`

**Board:** `4.1  /home`

**`/leagues` IS the league list** — it absorbed what the IA map called `/home`, and before that a separate `/league` index whose own description was *"`/home`'s empty state wearing a URL"*. One address, three names in its history, and the routing pass on 2026-08-28 settled it: the collection is `/leagues`, and its index is the signed-in front door. **The composer file stays `src/lib/home.ts`** — renaming it would put `leagues.ts` one letter from `league.ts`, which is how a wrong import happens.

**Files:**
- Create: `src/app/(member)/leagues/page.tsx`, `_components/*.tsx`, `error.tsx` — **the folder name is the URL**, so this is `leagues/`, not `home/`. The composer keeps the name `home.ts`; the route does not.
- Modify: `src/lib/home.ts` — it already exports `getHomeLeagues(supabase, userId) -> HomeLeague[]`; add the screen composer beside it.

**Interfaces:**
- Consumes: `getHomeLeagues` from `src/lib/home.ts` and `getMyInvites(supabase) -> MyInvite[]` from `src/lib/invites.ts`. **Both already written — import them.**
- Produces: `getHome(ctx) -> Home` in `src/lib/home.ts` — the viewer's leagues with their live state, pending invites, and the zero-league flag.

- [ ] **Step 1: Open the board**

**The pending invite is the one vermilion element on this surface.** Not "Start a league", not the open-week chip on a league card. The invite is the only thing asking you to act.

- [ ] **Step 2: Confirm nothing still points at an address this route absorbed**

```bash
git grep -nE '"/league"|"/home"' -- 'src/**/*.ts' 'src/**/*.tsx'
```

Expected: nothing. `/league` and `/home` are both retired into `/leagues`. `chooseLandingPath` ([src/lib/landing.ts](../../../src/lib/landing.ts)) already returns `/leagues` for the zero-league case — **the comment above that line still says `/league` and is stale; the code is right.**

- [ ] **Step 3: Build the page**

Greeting, invites, the league list, and the getting-started links. **The zero-league case renders the creation prompt** — that is the state `/leagues` used to own, and it is the state `dev-outsider` lands in.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive it in three states**

With leagues (`dev-player`), with a pending invite (**accept one and confirm the membership row exists**), and with none (`dev-outsider`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(home): /leagues is the front door, and the invite takes the accent"
```

---

### Task 7: `/invites/[token]`

**Board:** `4.9  /invites/[token]`

**Email-linked.** The address does not change; it is generated by the invite RPC and mailed.

**Files:**
- Create: `src/app/(member)/invites/[token]/page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/actions/league.ts` — `acceptInvite`

**Interfaces:**
- Consumes: `peekInvite(token) -> InvitePeek | null` from [src/lib/invites.ts](../../../src/lib/invites.ts) — **already written.** It takes **no `ctx`**, because this is the one read reached *before* membership exists: it resolves the league's public facts and nothing member-scoped. Do not write a second one.
- Produces: `acceptInvite(prev, formData) -> Promise<ActionResult>` in `src/lib/actions/league.ts` — it lives there rather than in the segment because Task 8 and Task 22 write to the same entity.

- [ ] **Step 1: Open the board and build the page**

League name, what the invite is for, the four league facts (members, bankroll, tiers, next season), the member avatars, and **one** action.

- [ ] **Step 2: Handle the three failure states with three pieces of copy**

**Expired**, **already used**, and **already a member**. A single "invalid invite" for all three is the lazy answer and it strands people who did nothing wrong.

- [ ] **Step 3: Add `error.tsx`**

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it, including a failure**

**Generate a real invite, accept it as `dev-outsider`, and confirm the membership row exists.** Then re-open the same token and confirm the already-used copy renders. Remove the membership afterwards so `dev-outsider` stays the zero-league fixture.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(invites): the join screen is rebuilt, with three distinct failure states"
```

---

### Task 8: `/leagues/new`

**Board:** `4.8  /leagues/new` — the board draws step 2.

**Files:**
- Create: `src/app/(member)/leagues/new/page.tsx`, `_components/create-league-wizard.tsx`, `error.tsx`
- Modify: `src/lib/actions/league.ts` — add `createLeague`

**Interfaces:**
- Produces: `createLeague(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

Four steps in a left rail: **Name it · House rules · Invite people · First season.**

- [ ] **Step 2: Build the house-rules step against the rulebook**

Every value is marked **[Configurable]** and must reach the rules engine, never a hard-coded literal: season bankroll (**$100** default), winning tiers (**3** default), include limited releases (**off** default), results capture time (**Monday morning** default).

**The winning-tiers copy must explain the tie**, because "3" alone is what makes people expect three owners: *"Ties are always honoured, so a film can have more owners than tiers."*

- [ ] **Step 3: Add `error.tsx`**

A wizard's boundary should say **which step's data survived**, if any.

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it end to end**

**Create a real league and confirm it exists with you as commissioner.** Then delete it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(league): the creation wizard is rebuilt on configurable rules"
```

---

### Task 9: `/leagues/[leagueId]`

**Board:** `4.2  /leagues/[leagueId]`

**Files:**
- Create: `src/app/(member)/leagues/[leagueId]/page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/league-home.ts`

**Interfaces:**
- Consumes, all already written in `src/lib/`: `getLeague`, `getLeagueRoster`, `getLeagueSeasons`, `getLeagueRunningSince` (`league.ts`) and `getLeagueRecordBook` (`league-records.ts`). **Import them; the DAG that forbade a composer calling a composer is deleted.**
- Produces: `getLeagueHome(ctx, leagueId) -> LeagueHome` in `src/lib/league-home.ts` — identity, seasons, members with career figures, the record-book aggregates, and the announcements rail. **Task 22 consumes it for the identity facts.**

- [ ] **Step 1: Open the board, and know about the uppercase trap**

**The title is the league switcher, and it sits inside a `<button>`.** A previous session found the `<h1>` computing `text-transform: uppercase` correctly while rendering title-case, because the user-agent rule on form controls beats inheritance. `getComputedStyle` reported the rule as applied while the pixels disagreed. **The case must come from a class on the element, not from the base `h1` rule.**

- [ ] **Step 2: The record-book aggregates carry no member**

ADR-085: average winning bid, average points per film, league points-per-dollar, films ever owned. **They are the league's own numbers**, and putting a name in one turns the panel into a leaderboard.

- [ ] **Step 3: Build the page**

Seasons table, members with a role badge, the record-book panel linking to `/records`, the announcements rail, the dues summary, and a **link** to `/leagues/[id]/settings`. There is no settings dialog in this repo and none is to be created — Task 22 owns that surface.

- [ ] **Step 4: Count the vermilion**

The old league page painted **51 vermilion elements**, measured 2026-08-22, against a system rule of one per surface. In the browser console on this page:

```js
[...document.querySelectorAll("*")].filter(e => {
  const s = getComputedStyle(e);
  return [s.backgroundColor, s.color, s.borderColor].some(v => v.includes("235, 75, 55"));
}).length
```

Expected: **1**. Higher means a shared component is painting it — fix the component, not this page.

- [ ] **Step 5: Add `error.tsx`**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it as both roles**

Player and commissioner. Confirm the title renders in caps **in the browser**, not in `getComputedStyle`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(league): league home is rebuilt, and 51 vermilion elements become one"
```

---

### Task 10: `/leagues/[leagueId]/seasons/new`

**Board:** `5.2  /leagues/[id]/seasons/new`

**Files:**
- Create: `src/app/(member)/leagues/[leagueId]/seasons/new/page.tsx`, `_components/*.tsx`, `actions.ts`, `error.tsx`
- Port: `src/lib/season-settings.ts`, `src/lib/season-schedule.ts` — **already present.**

**Interfaces:**
- Produces: `createSeason(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

Two dates, a derived week count, and the inherited rules. **All league members auto-join** (ADR-016) — the board says so, because nobody should wonder whether they need to invite people again.

- [ ] **Step 2: Derive the week count; do not ask for it**

One week per Friday between the two dates, numbered `01`…`NN` — **two digits**, per the canvas decision. Show the derived count so the commissioner can sanity-check the dates before committing.

- [ ] **Step 3: Inherit the rules, and allow the override**

Defaults come from the league. **Changing one here changes it for this season only** — say that on screen; the board does.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive it end to end**

**Create a real season in a throwaway league**, confirm the weeks exist with the right numbers and dates, and confirm every member joined. Then delete the season.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(season): the season wizard is rebuilt, and week numbers are two digits"
```

---

### Task 11: `/seasons/[seasonId]`

**Board:** `3.1  /seasons/[seasonId]` — **and the two sticky notes beside it.**

**The largest read screen in the app:** three tabs, a role-gated strip, and the bump chart.

**Files:**
- Create: `src/app/(member)/seasons/[seasonId]/page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/season-home.ts`

**Interfaces:**
- Consumes, all already written: `getSeasonHub(ctx, seasonId) -> SeasonHub` (`season-hub.ts`), the leaderboard and trend reads (`leaderboard.ts`, `season-trend.ts`), and `getOverdueWeeks` (`commish.ts`).
- Produces: `getSeasonHome(ctx, seasonId) -> SeasonHome` in `src/lib/season-home.ts` — the header facts, the viewer's own standing, the weeks rows, the leaderboard, and — **when `ctx.role === "commissioner"`** — the overdue-week queue.

- [ ] **Step 1: Open the board and read both sticky notes**

Two decisions are drawn rather than described: the **season picker is a header control**, not a quarter-width left rail; and the **commissioner Queue is a strip on this page, not a route.**

- [ ] **Step 2: Fold the Queue into the composer**

`getOverdueWeeks` / `OverdueWeek` are in [src/lib/commish.ts](../../../src/lib/commish.ts) with **zero consumers** — a composer with no UI. Call it from `getSeasonHome` behind the role check. **Import it; do not port or re-derive it.**

The overdue rule, from its own comment: a week whose opening weekend has passed, whose status is neither `final` nor `skipped`, and whose eligible films still have no `captured_at`. **A week still marked `open` past its opening weekend counts** — that combination is a deadline that did not fire, and surfacing it is the entire point.

- [ ] **Step 3: Order the open-week lookup by week number**

The old hub found the open week over a list ordered by `created_at`. Harmless with one open week, **wrong in principle with two** — and two open weeks is a supported state.

- [ ] **Step 4: Build the page**

Header with the picker and the status chip; the viewer's own standing strip; the Queue strip when commissioner; then the three tabs — **Weeks leads**, because it is the only tab with a deadline in it.

**The countdown is the one vermilion element on this surface.** Not the "Place bids" button, not the status chip.

- [ ] **Step 5: Build the bump chart on the real series hues**

Consume them as `var(--series-N)`, N in 1…10. They are real hues in both `:root` and `.dark`; do not substitute.

- [ ] **Step 6: Keep the tab-from-URL behaviour**

`?tab=leaderboard` must land on Leaderboard — the Monday-scores email links it (`api/cron/notify/route.ts:189`). Switching a tab writes nothing to the URL; arriving at one that names a tab must honour it.

- [ ] **Step 7: Add `error.tsx`**

- [ ] **Step 8: Run the gate**

```bash
npm run verify
```

- [ ] **Step 9: Drive it as both roles**

As `dev-player`: three tabs, the countdown ticking, **no Queue strip.** As `dev-commish`: the Queue strip renders and its two actions go where they claim. **The Queue has never been seen by anyone** — this is its first render, so look at it properly rather than confirming it exists.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(season): season home is rebuilt, and the commissioner queue finally renders"
```

---

### Task 12: `/seasons/[seasonId]/weeks/[weekId]`

**Board:** `3.2  /seasons/[id]/weeks/[weekId] — settled`

**Files:**
- Create: `src/app/(member)/seasons/[seasonId]/weeks/[weekId]/page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/week-board-view.ts`
- Modify: the bid page's `PosterCard` — pass the `href` left unset

**Interfaces:**
- Consumes: `getWeekBoard`, `WeekOverride` (`week-board.ts`), plus `reveal.ts` and `week-status.ts` — **all already written.**
- Produces: `getWeekBoardView(ctx, weekId) -> WeekBoardView | null` in its **own file, `src/lib/week-board-view.ts`**. Named `…View` and filed separately on purpose: `getWeekBoard` already exists with other callers, and two functions one letter apart in one file is how a wrong import happens.

- [ ] **Step 1: Open the board**

It is drawn **settled**, because the bid page already covers the open state and the reveal is the half nobody has seen. **The player's own result opens the page**, ahead of the reveal.

- [ ] **Step 2: Preserve the in-page redirect**

This page performs a state-based `redirect()` to `/bid` when the week is still biddable (ADR-108). **It is not in `next.config.ts` and reading that file will not reveal it.** It must survive, and it is what stops this screen and the bid page disagreeing about which one owns a live week.

- [ ] **Step 3: The composer serves every week state**

Open (redirects), closed-and-unscored, settled, and skipped.

- [ ] **Step 4: Build the page**

Your result first. Then the reveal — each film with opening, Tomatometer, score, and its owners with bids. Then corrections and removed films.

**Corrections carry ink, not red.** `--destructive` is for a destructive action, not for a commissioner's correction to a score — and red beside the brand's red reads as one thing (Global Constraints). The owners line states the tie honestly — *"Three distinct amounts — a tie at $9 gives four owners"* — because that is the rule people misread.

- [ ] **Step 5: Give `PosterCard` its destination**

The bid page's card takes an optional `href` that has been unset since it was built, waiting on Task 14's route. Pass `/leagues/${leagueId}/films/${tmdbId}`. If Task 14 has not run yet, leave it unset and **note it in the report** rather than pointing it at the catalog.

- [ ] **Step 6: Add `error.tsx`**

- [ ] **Step 7: Run the gate**

```bash
npm run verify
```

- [ ] **Step 8: Drive every reachable week state**

Open (confirm it redirects to `/bid`), settled, and skipped. **Report which states you could not reach** — if no fixture week is closed-and-unscored, say so rather than implying it was checked.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(week): the week board is rebuilt, and the reveal leads with your own result"
```

---

### Task 13: `/films/[tmdbId]` — the catalog view

**Board:** `2.2  /films/[tmdbId] — catalog`

**Public to members, and it is *not* league-scoped.** ADR-408: the catalog carries the film, never the play.

**Files:**
- Create: `src/app/films/[tmdbId]/page.tsx`, `loading.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/film-catalog.ts`
- Port: `src/lib/film-page.ts`, `src/lib/tmdb.ts`, `src/lib/omdb.ts` — **already present.**

**Interfaces:**
- Produces: `getFilmCatalogPage(ctx, tmdbId) -> FilmCatalogPage | null` — TMDB metadata, OMDb ratings, cast, trailer key. **It carries no bids, no owners and no scores.** That is ADR-408, and a later task adding them here is the mistake this composer's name exists to prevent.

- [ ] **Step 1: Open the board**

Note what it does that a plain detail page does not: where league data *would* be, it says you are looking at the catalog and offers a league to switch to.

- [ ] **Step 2: Write the composer on top of `film-page.ts`**

Take what it returns, minus anything league-scoped. **Import it — do not re-derive it.** It already holds the working queries and is a peer of the composer, not a forbidden layer.

- [ ] **Step 3: Build the page**

Backdrop with the `--scrim` gradient, poster, title, ratings stack with **Tomatometer leading** (it is half the scoring formula), trailer, cast, facts, and the **TMDB/OMDb attribution — a licence obligation, not a courtesy.**

- [ ] **Step 4: Render the foreign-league notice**

Read `?from=league` and render board `2.3`'s foot copy: *"Showing the catalog page. You are not a member of that league, so its bids and scores are not visible to you."* Task 14 redirects here with that parameter; building the reader now means that task has somewhere to land.

- [ ] **Step 5: Add `error.tsx` and `loading.tsx`**

The loading state matters here: two external APIs are on the critical path.

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it**

Open a real film. Confirm the poster and backdrop load from TMDB, the Tomatometer shows, and the attribution renders. Then open `?from=league` directly and confirm the notice.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(films): the catalog page carries the film and never the play"
```

---

### Task 14: `/leagues/[leagueId]/films/[tmdbId]`

**Board:** `2.3  /leagues/[id]/films/[tmdbId] — NEW route`

**Why it exists.** ADR-408 says the film page shows **one scope** — the context league's own record — because commissioner-entered box office and Tomatometer values make play data league-local. The principle is untouched; the carrier changes from `?league=` to a path segment, which makes the league view bookmarkable and lets the trail name which league you are looking from.

**Files:**
- Create: `src/app/(member)/leagues/[leagueId]/films/[tmdbId]/page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/film-league-record.ts`
- Port: `src/lib/film-detail.ts` — **already present.**

**Interfaces:**
- Consumes: `getFilmCatalogPage` from Task 13, for the "About the film" section.
- Produces: `getFilmLeagueRecord(ctx, leagueId, tmdbId) -> FilmLeagueRecord | null` — the score, its two inputs, the week it was on, and the owners with their bids.

- [ ] **Step 1: Open the board**

**The league record leads and the TMDB material is demoted below it.** That ordering is ADR-408 expressed as layout; inverting it makes this a catalog page with a table bolted on.

- [ ] **Step 2: The composer returns `null`, it does not throw**

Step 4's redirect depends on `null` being distinguishable from an error.

- [ ] **Step 3: Build the page**

The score panel spells out the formula: **`Opening ($M) × Tomatometer = Score`**. The owners list shows bid and points-per-dollar per owner, and states that **every owner earns the full score** — the rule people get wrong.

Resolve the tier count from `season_settings.top_n_distinct`. The heading reads "three winning tiers" only if that season says 3.

- [ ] **Step 4: Implement the foreign-league path**

```tsx
const record = await getFilmLeagueRecord(ctx, leagueId, tmdbId);
if (!record) redirect(`/films/${tmdbId}?from=league`);
```

**Not a 404** — the film exists and is readable; only this league's play is not.

- [ ] **Step 5: Point every league-context film link here**

```bash
git grep -n 'films/' -- 'src/**/*.tsx'
```

Every link from inside a league context carries the league. That includes the bid page's `PosterCard` `href` and anything Task 12 left noted.

- [ ] **Step 6: Add `error.tsx`**

- [ ] **Step 7: Run the gate**

```bash
npm run verify
```

- [ ] **Step 8: Drive it — including the redirect**

As `dev-player`, open a film the league owns and confirm the record renders with real owners. **Then, as `dev-outsider`, open the same URL** and confirm you land on the catalog page with the notice — not a 404, and not the league's data. **That second half is the whole point of the task and is the one branch no gate can check.**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(films): the league record gets its own address, and a foreign league lands on the catalog"
```

---

### Task 15: `/players/[profileId]`

**Board:** `2.4  /players/[profileId]`

**Files:**
- Create: `src/app/(member)/players/[profileId]/page.tsx`, `_components/*.tsx`, `actions.ts`, `error.tsx`
- Modify: `src/lib/player-profile.ts` — it already exports `getPlayerProfile` and `getPlayerSeasons`; add the screen composer beside them.

**Interfaces:**
- Consumes: `getPlayerProfile(ctx, profileId) -> PlayerProfile | null` and `getPlayerSeasons` — **both already written.**
- Produces: `getPlayerProfilePage(ctx, profileId) -> PlayerProfilePage | null` in `src/lib/player-profile.ts` — identity, the six career stats, and the season-by-season rows in one read, so the page calls one composer rather than two.
- Produces: `updateBio(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

**The six stats are a ladder, not a row.** The old page's own comment records why: a row gave each label about ninety pixels and every one truncated — "SEASONS W…", "CAREER PO…". Do not re-flatten it.

- [ ] **Step 2: The six stats**

Seasons won, best finish, career points, films owned, total spent, seasons played. Plus the per-season rows.

- [ ] **Step 3: Build the page**

Identity card with the perforation edge, the six stats, and the season table. **The bio form is editable only on your own profile** — that is a real permission, not a display rule, and it is enforced server-side.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive it as two people**

Your own profile — **complete a bio edit and confirm it persisted in the database** — and someone else's, read-only. Report which you could not reach.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(players): the profile is rebuilt, and the six stats stay a ladder"
```

---

### Task 16: `/leagues/[leagueId]/records`

**Board:** `4.3  /leagues/[id]/records`

**Files:**
- Create: `src/app/(member)/leagues/[leagueId]/records/page.tsx`, `_components/*.tsx`, `error.tsx`

**Interfaces:**
- Consumes: `getLeagueRecordBook(ctx, leagueId) -> LeagueRecordBook` from [src/lib/league-records.ts](../../../src/lib/league-records.ts) — **already written, and it is the composer this screen needs. No new one.** It carries the career table (`CareerRow[]`) and the record entries (`RecordEntry`, each with its `marquee` flag).

- [ ] **Step 1: Open the board**

Six record cards; **three are `marquee`** and take the heavier border. The labels are fixed and are not to be renamed: **Best season**, **Biggest single film**, **Steal of the century**, **Priciest whiff**, **Best single week**, and most films owned.

- [ ] **Step 2: Use the composer that is already there**

**Import `getLeagueRecordBook`. Do not rewrite it, and do not re-derive its queries.** The career rows collapse renamed accounts into one career — `league-records.ts:145` explains why — and that behaviour survives for free by not touching the file.

- [ ] **Step 3: Build the page**

Record cards, then the career table with a titles badge.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive it**

Needs a league with completed seasons — **"Dev Closing Credits"** is the fixture with a fully-scored completed season. **If the records come back empty, say so in the report** rather than calling the screen done.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(league): the record book is rebuilt"
```

---

### Task 17: `/leagues/[leagueId]/announcements`

**Board:** `4.5  /leagues/[id]/announcements`

**Announcements keeps all three routes** (IA map §5.4). It is a small CRUD surface, and an individual announcement is a thing you link someone to — which is why it was not folded into tabs.

**Files:**
- Create: `src/app/(member)/leagues/[leagueId]/announcements/page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/announcements.ts`

**Interfaces:**
- Produces: `getAnnouncements(ctx, leagueId) -> Announcement[]` — title, author, timestamp, excerpt, read state.

- [ ] **Step 1: Open the board and build the list**

**Unread posts take the ink left edge and a small vermilion dot.** "Write one" is commissioner-only.

- [ ] **Step 2: Add `error.tsx`**

- [ ] **Step 3: Run the gate**

```bash
npm run verify
```

- [ ] **Step 4: Drive it as both roles**

Confirm "Write one" is **absent** for a player — not present-and-disabled.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(league): the announcements list is rebuilt"
```

---

### Task 18: `/leagues/[leagueId]/announcements/[announcementId]`

**Board:** `4.7  /announcements/[id]`

**Files:**
- Create: the route's `page.tsx`, `_components/*.tsx`, `error.tsx`
- Modify: `src/lib/announcements.ts` — add the single-record read

**Interfaces:**
- Consumes: `getAnnouncements` from Task 17.
- Produces: `getAnnouncement(ctx, leagueId, announcementId) -> Announcement | null`.

- [ ] **Step 1: Build the reading surface**

Title, author with role and timestamp, and the body at 16px on a **`measure`**, not the page frame. Edit and Delete are commissioner-only and sit at the foot, quiet.

- [ ] **Step 2: Preserve the line breaks**

The body is plain text with newlines. It needs `white-space: pre-line` or equivalent, **or every paragraph runs together. This is a real shipped bug class in this repo.**

- [ ] **Step 3: Add `error.tsx`**

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it**

Confirm a **multi-paragraph** body renders as paragraphs.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(league): reading an announcement is rebuilt"
```

---

### Task 19: `/leagues/[leagueId]/announcements/new`

**Board:** `4.6  /announcements/new`

**Files:**
- Create: the route's `page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/app/(member)/leagues/[leagueId]/announcements/actions.ts`

**Interfaces:**
- Produces: `postAnnouncement(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

**This screen carries the only shadow in the league surfaces.** Its sticky action bar overlaps its own form, which is exactly the floating case `--shadow-raised` exists for. Every other league surface is flat.

- [ ] **Step 2: Build the form and the action**

Title (**it becomes the email subject**), body (plain text — line breaks survive, nothing else is interpreted), and the "email this to all N members" switch. **The member count is resolved, never hard-coded.**

- [ ] **Step 3: Add `error.tsx`**

Its copy must say **whether the draft was lost**. If the boundary cannot tell, say so plainly rather than reassuring falsely.

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive the write**

As `dev-commish`, **post a real announcement and confirm the row exists** — and, if the switch was on, that the email actually sent. Then delete the row.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(league): the announcement composer is rebuilt"
```

---

### Task 20: `/account`

**Board:** `4.10  /account`

**Files:**
- Create: `src/app/(member)/account/page.tsx`, `_components/*.tsx`, `actions.ts`, `error.tsx`
- Create: `src/lib/account.ts`
- Port: `src/lib/avatar.ts`, `src/lib/peep-*.ts`, `src/lib/reauth.ts` — **already present.**

**Interfaces:**
- Produces: `getAccount(ctx) -> Account` — profile, sign-in identities, email preferences.
- Produces: `updateProfile`, `updateEmailPreferences` — both returning `ActionResult`.

- [ ] **Step 1: Open the board, and check the registry first**

```bash
npx shadcn@latest search @shadcn -q "settings"
```

The registry ships settings blocks. Read them before designing sections from scratch.

- [ ] **Step 2: Build the four sections**

Profile (display name, bio), Sign-in (email, password, linked Google), Email (four toggles), and sign-out.

**The display-name warning is real and must survive:** changing it re-labels the whole history at once — the standings, every past season, every record held. `src/lib/league-records.ts:145` is why.

- [ ] **Step 3: Name the four email preferences from the real cron**

They are the four notify types in [src/app/api/cron/notify/route.ts](../../../src/app/api/cron/notify/route.ts): **slate up, deadline near, reveal, Monday scores.** Do not invent a fifth.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive the writes**

**Change the display name and confirm it persisted**; toggle a preference and confirm the same. Set both back.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(account): the account page is rebuilt"
```

---

### Task 21: `/leagues/[leagueId]/dues`

**Board:** `4.4  /leagues/[id]/dues`

**Real money, tracked outside the game. The app records who paid whom, never how.**

**Files:**
- Create: `src/app/(member)/leagues/[leagueId]/dues/page.tsx`, `_components/*.tsx`, `actions.ts`, `error.tsx`
- Create: `src/lib/league-dues.ts`

**Interfaces:**
- Consumes: `getSettlement` and `getLeaguePayments(ctx, leagueId) -> LeaguePaymentRow[]` from `src/lib/settlement.ts`, and the ladder types in `src/lib/payout.ts` — **all already written.**
- Produces: `getLeagueDues(ctx, leagueId) -> LeagueDues` in `src/lib/league-dues.ts` — all-time balances and the per-season settlement rows.
- Produces: `markPaymentPaid(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

**A positive balance means the league owes them.** That is the opposite of the intuitive reading, so the board labels it — keep the label.

- [ ] **Step 2: The action goes through an RPC**

Direct table writes are refused at the database, not merely by convention.

- [ ] **Step 3: Build the page**

Balances, the season settlement table with Paid/Owed/Square, and the viewer's own balance panel. **"Mark paid" is commissioner-only.**

- [ ] **Step 4: Add `error.tsx`, and mind its copy**

This screen is about money. **Say that no payment state was changed.**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive the write**

As `dev-commish`, **mark a payment paid and confirm the row changed in the database.** Then set it back.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(league): dues is rebuilt, with the balance sign explained"
```

---

### Task 22: `/leagues/[leagueId]/settings`

**Board:** `4.11  /leagues/[id]/settings  (NEW)`

**Why it exists.** IA map §7.2 — **configuration centralizes, operations distribute.** Four things live here: identity, house rules, member roles, invites. **Nothing operational.** Closing a week, capturing results, generating payouts and starting a season all stay next to the object they act on.

**Files:**
- Create: `src/app/(member)/leagues/[leagueId]/settings/page.tsx`, `_components/*.tsx`, `error.tsx`
- Create: `src/lib/league-settings.ts`
- Modify: `src/lib/actions/league.ts` — the role writes

**Interfaces:**
- Consumes: `getLeagueHome` from Task 9, for the identity facts, and `getSettingsForSeason` from `src/lib/commish.ts` for the house rules.
- Produces: `getLeagueSettingsPage(ctx, leagueId) -> LeagueSettingsPage | null` — **`null` when the caller is not a commissioner.** **Do not name it `LeagueSettings`:** `src/lib/commish.ts` already exports that type for the database row (`league_id`, `fake_bankroll`, `top_n_distinct`, `min_bid`, `bids_due_dow`, `payout_structure`, …), and a second meaning of the same name in the same import graph is a bug waiting to be typed.
- Produces: `promoteLeagueCommissioner`, `demoteLeagueCommissioner`, `handoffLeagueCommissioner`, `removeLeagueMember`, `updateLeagueIdentity`, `updateHouseRules`, `createInvite`, `revokeInvite` — all returning `ActionResult`, all calling their **existing** RPCs.

- [ ] **Step 1: Open the board**

A left rail of four sections; the board draws all four stacked.

- [ ] **Step 2: Gate the route, not just the controls**

A player who types this URL gets `notFound()`. Follow `requireSeasonMember`'s reasoning: **`notFound()` and never a redirect**, because sending someone to `/leagues` tells them the page is real and just not theirs.

- [ ] **Step 3: Wire the role actions to the existing RPCs — write no new ones**

ADR-060's two guarantees are enforced in the database and **must not be re-implemented in the UI**:

- **Never self-granted** — `promote_league_commissioner` requires the caller to already be a commissioner.
- **Never zero** — `demote_league_commissioner` and `remove_league_member` both refuse on the **last** commissioner.

`handoff_league_commissioner` is the one-shot exit for a **sole** commissioner and rejects a handoff to someone who already holds the role. `set_league_member_role` delegates to the promote/demote pair, so each guard has exactly one implementation.

- [ ] **Step 4: Say the never-zero rule on screen**

The board draws it: *"A league always has at least one commissioner."* It is enforced in the RPCs and stated in no UI anywhere. **A settings page is the first place it has somewhere to be explained.**

- [ ] **Step 5: Add `error.tsx`**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it, and try to break the guarantee**

As `dev-commish`: rename the league (**confirm it persisted**), promote a member, then **try to demote the last commissioner and confirm it is refused.** That refusal is the one behaviour on this page nobody can see from the code. Put every change back.

As `dev-player`: confirm the URL **404s**.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(league): settings becomes a route, and the never-zero rule finally has somewhere to be said"
```

---

### Task 23: `/seasons/[seasonId]/payouts`

**Boards:** `5.1a /seasons/[id]/payouts — player` **and** `5.1b — commissioner`. **Two boards, one route.**

**The merge, and the condition it must satisfy** (IA map §2): the player's view opens with **their own result**; the commissioner's controls are **additive and secondary** — *not* the player page with a toolbar bolted on top, and *not* the workbench with the player's summary demoted.

**Files:**
- Create: `src/app/(member)/seasons/[seasonId]/payouts/page.tsx`, `_components/*.tsx`, `actions.ts`, `error.tsx`
- Create: `src/lib/payouts.ts`

**Interfaces:**
- Consumes: `getSettlement(ctx, seasonId) -> Settlement` and the `PayoutSnapshot` / `SettlementLine` types from `src/lib/settlement.ts`, plus `PayoutLadder` from `src/lib/payout.ts` — **already written, and shared with Task 21.**
- Produces: `getPayouts(ctx, seasonId) -> Payouts` in `src/lib/payouts.ts` — the viewer's own result, the awards, the ledger, and — commissioner only — the draft state and blockers.
- Produces: `generateDraft`, `regenerateDraft`, `finalizeSettlement` — all returning `ActionResult`.

- [ ] **Step 1: Open both boards, and read how the merge resolves**

The commissioner's affordances split **by kind**, and that split is the whole answer:

- **Status goes to the top**, as one line — *"Draft — only you can see this"* — because it qualifies the meaning of everything below it.
- **Controls go to the foot**, in a bounded ink-headed block.

The commissioner's own result opens their page **identically to the player's**, because a commissioner is a player too.

- [ ] **Step 2: Build the awards and ledger as shared components**

Both roles render them. They start in this segment's `_components/`; they move to `src/components/` only if a second route needs them.

- [ ] **Step 3: Preserve the friction ladder exactly**

**Weight matches consequence.** Finalize is irreversible and publishes to everyone, so it takes the heavy treatment; Regenerate is routine and recedes.

```
confirmMessage="Finalize the payouts? They become visible to every member and can no longer be regenerated."
confirmMessage="Regenerate the draft payouts from the current standings? The existing draft is replaced."
```

The `finalizeBlocker` disables Finalize until the season is over, **and states its reason on screen.**

- [ ] **Step 4: Keep the email-linked address working**

The season-settled statement links `/seasons/[seasonId]/payouts`. The address does not change; confirm the link resolves.

- [ ] **Step 5: Add `error.tsx`**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it as both roles, and judge the merge**

As `dev-player` on a settled season: your result opens the page, **no controls anywhere.**

As `dev-commish` on "Dev Closing Credits" — the fixture that re-seeds **unsettled** precisely so this flow can be driven repeatedly: the draft banner is one line at the top, your own result still opens the page, the controls are at the foot. **Generate a draft and confirm the rows exist in the database.** Confirm Finalize is disabled and its reason is stated.

**Then make the judgement the IA map asked for.** Does the commissioner's page read as the player's page with an addition, or as a workbench with the player's summary demoted? **If the latter, stop and raise it** — the old two-page version is in the reference repo and the merge is reversible.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(payouts): the two payout pages become one, role-gated"
```

---

## Closing this plan

- [ ] **Step 1: Every route in the map has a page**

```bash
find src/app -name "page.tsx" | sort
```

Expected: **25**, matching IA map §1, plus the six route handlers.

- [ ] **Step 2: Every segment has a boundary**

```bash
diff <(find src/app -name "page.tsx" | xargs -n1 dirname | sort) <(find src/app -name "error.tsx" | xargs -n1 dirname | sort)
```

Expected: no output. A directory on the left only is a segment that will blow its error up to the whole app.

- [ ] **Step 3: Every page renders exactly one `<main>`**

```bash
git grep -c "<main" -- 'src/app/**/page.tsx'
```

Four member pages rendered none in the old repo and nothing caught it.

- [ ] **Step 4: Every composer has a consumer**

```bash
for f in src/lib/*.ts; do
  n=$(git grep -l "$(basename "$f" .ts)" -- src/app src/lib | grep -vc "^$f$")
  [ "$n" -eq 0 ] && echo "ORPHAN: $f"
done
```

`getOverdueWeeks` sat with zero consumers for weeks precisely because nothing looked.

- [ ] **Step 5: Run the whole gate one last time**

```bash
npm run verify
```

- [ ] **Step 6: Write the phase digest**

Record: which screens revealed defects the gates could not see, which states were never driven for want of a fixture, and whether the payouts merge held.

---

## Decisions carried into this plan

- **The route map is 25** — 21 kept, plus `/leagues/[leagueId]/films/[tmdbId]` from the film split, plus `/`, `/login` and `/leagues/[leagueId]/settings`. `/commish/[seasonId]/payouts` folded into `/seasons/[seasonId]/payouts`; `/league` and `/home` both folded into `/leagues`.
- **Every address takes one shape** — [ia-screen-map.md](../../ia-screen-map.md) §7.5, settled 2026-08-28 from documented practice (NN/g's *URL as UI*, Google's AIP-122, Google Search Central on URL structure). Plural collections, singular items, never more than two levels deep, and **every truncation lands on a real page**. Four addresses were renamed; none was live, so nothing is owed. A season is addressed at `/seasons/[seasonId]` rather than under its league because the full chain would be four levels of mostly-uuid.
- **The accent is two tokens, one per ground** — the palette pass of 2026-08-28. No single red is legible on both: paper-legal needs relative luminance ≤ 0.162, ink-legal needs ≥ 0.175, and the windows do not overlap. `--edge` was added in the same pass because a field at `#EDECEA` on `#F5F4F3` is 1.07:1 with a 1.26:1 border — a control identified by nothing at all.
- **The bell shows what is waiting on you, not what has happened.** The schema can answer the first; there is no notification store and no read state on announcements to answer the second. Announcements join the bell the day someone adds a `read_at`, which is a migration and a decision, not a line of UI.
- **Elevation is two tiers:** panels flat with a border, floating layers only carry a shadow.
- **The commissioner Queue is a strip, not a route** — and `getOverdueWeeks` was a composer with no UI, folded into `getSeasonHome` rather than deleted as dead code.
- **Configuration centralizes, operations distribute** — the test that settled the commissioner question and produced `/leagues/[leagueId]/settings` as the one legitimate second commissioner page.
- **`/how-it-works` survives the landing page** — the landing **sells**, how-it-works **explains**.
- **Ruling 78:** desktop-only review at 1440×900 for this phase, with the named reversal conditions.
- **A film is not exclusively scoped to a league**, which is why the hybrid — a top-level catalog resource and a league-scoped one — is the documented right answer rather than a query parameter.
