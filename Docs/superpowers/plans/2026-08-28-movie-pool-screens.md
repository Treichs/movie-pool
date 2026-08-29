# The Movie Pool — Screen Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out the 25-route contract on top of an app shell that did not exist when this plan was written. **Thirteen routes are built and twelve remain** — run `find src/app -name "page.tsx" | wc -l` rather than trusting this sentence. The original order was the path a real person takes through the app; it was re-ordered on 2026-08-29 for the reasons under *Task Order*.

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

**Status at a glance:** <https://claude.ai/code/artifact/3957217c-e687-4adf-adda-44225b68580b> — "Twenty-Five Screens". Every route in build order, built or pending, with each screen's notes and constraints. Its badges are read from the filesystem, not from this plan, so **it is the check on this document rather than a copy of it.**

**Reference repo:** `C:\Dev\Git\movie_pool_app` — the previous implementation. **Read it freely; it is reference, not a base.** Its five component tiers, nine-link governance chain and 1,400-line `tokens.css` are what this rebuild exists to be rid of. Where a task says *port*, it means copy the working logic; where it says *build*, it means search the registry and compose fresh.

---

## Global Constraints

Every task's requirements implicitly include this section.

### The gate

```
npm run verify   →  typecheck · lint · a11y:contrast · types:fresh · build
```

**Never run `npm run build` while `npm run dev` is running** — it corrupts the dev server's chunks and every route 500s. Drive on a second port: `npx next dev -p 3100`.

### Named libraries — standing instruction, 2026-08-29

**Every screen from build order 13 onward checks the registries before writing UI, and adopts a dependency where one fits rather than hand-rolling.** Three are named and settled; do not re-litigate them per screen.

| Concern | Use | State |
|---|---|---|
| **Charts** | **Recharts** | Already in, via `@shadcn/chart`. `bump-chart` is the reference. |
| **Data tables** | **`@tanstack/react-table`** | Adopted at build order 13. **v9**, not v8 — see below. |
| **Dates** | **`date-fns`**, and one date-picker everywhere | `date-fns` installed. The picker is **still owed** — see below. |

**TanStack is v9 and the internet is v8.** v9 renamed `useReactTable` to `useTable` and moved row models behind an explicit `tableFeatures()` call. Every v8 snippet — including shadcn's own data-table documentation page — fails to compile against it. `useLegacyTable` exists as a shim and is deliberately unused: adopting a library through its compatibility layer means writing the migration twice. **[players/[profileId]/_components/seasons-table.tsx](<../../../src/app/(member)/players/[profileId]/_components/seasons-table.tsx>) is the reference implementation** — copy its shape.

**`@reui/data-grid` is also TanStack-based and was considered and rejected**, so nobody has to evaluate it twice: ten files plus `dnd-kit` and virtualisation. Reach for it only if a screen genuinely wants column drag-and-drop or a virtualised thousand rows. The headless library over the vendored `ui/table` keeps every table looking like every other one.

**A sortable column that runs backwards needs two fixes, not one.** `invertSorting` handles a "smaller is better" column such as a finishing place, but it flips the rows and **not** what `getIsSorted()` reports — so `aria-sort` and the arrow will both announce the opposite of what is on screen unless they read from a derived effective direction. The seasons table carries that helper.

**`src/lib/format.ts` stays on `Intl`, deliberately.** Its date formatters parse a date-only column at **UTC noon** — `new Date("2024-01-15")` is midnight UTC, which a browser west of Greenwich renders as the previous day, and in January as the previous *month*. Rewriting them on `date-fns` would reintroduce exactly that for no gain. **date-fns earns its place at the picker**, which is what `@shadcn/calendar` depends on.

**⚠ STILL OWED: one date picker.** `src/components/season-dates-fields.tsx` uses two native `<input type="date">`, and it is shared by `/leagues/new` and `/leagues/[id]/seasons/new` — both already built. Installing `@shadcn/calendar` (`react-day-picker` + `date-fns`) and building one shared `DatePicker` is a small retrofit against two screens, not a new-screen task. **Do it before any screen that needs a date input.**

### The seven conditions — in force for every screen task

1. `page.tsx` renders from a `src/lib` composer, with the authz gate preceding the fetch.
2. Its writes are `'use server'` actions in the segment's own `actions.ts`, returning `ActionResult`, calling `revalidatePath`. A write two routes share moves to `src/lib/actions/`.
3. Route-private components live in the segment's `_components/`. **A component moves to `src/components/` the first time a second screen needs it — never in anticipation.** The cost of getting it wrong is one file move.
4. The segment has an `error.tsx` **built on `ErrorScreen`**, and — if the screen reads anything — a `loading.tsx` **built on `PageSkeleton`**, scoped by a route group if the segment has children. See *What every remaining screen inherits*.
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

## What every remaining screen inherits — added 2026-08-29

**None of this existed when this plan was written.** Two passes over the eleven built screens produced five shared components, a loading convention and one Next.js trap. The per-task steps below still say things like *"add `error.tsx`"* and describe panels and figures as things to build; **they are now things to import.** Read this section before starting any task, or each screen re-derives what already exists — which is the exact failure the passes were run to fix.

### The five components

| Import | What it replaces | Why it exists |
|---|---|---|
| `ErrorScreen` from `@/components/error-screen` | the whole body of an `error.tsx` | Thirteen boundaries carried the same forty lines and had begun to disagree: four restated `type-h1`, one restated `type-body`. A segment's `error.tsx` is now ~15 lines — a headline, the reassurance, and where "back" goes. `console.error` lives inside the component. |
| `Card variant="flat"` from `@/components/ui/card` | `rounded border bg-card p-N` | Written by hand sixteen times, drifted across `p-4`/`p-5`/`p-6`/`p-8` and two radii. `size="sm"` is 16px for a rail panel; the default is 20px for anything spanning the page. It carries **surface only** — no gap, no type size, because callers own both. |
| `Figure` from `@/components/figure` | a stacked eyebrow-over-numeral | Existed three times under three names. `size="lg"` is the reading figure on `/how-it-works`. **Stacked only** — the row-shaped label/value pair has two callers that disagree about their element, and both are called `Fact`, locally. |
| `TextLink` from `@/components/text-link` | `className="text-link underline underline-offset-4"` | Typed out thirteen times in three spellings, one of which underlined on hover only. `size` is `inherit` \| `ui` \| `micro`. **Not `<Button variant="link">`** — that carries the button box and is wrong inside a sentence, though its token is fixed so the two cannot disagree about colour. |
| `useNow(ms)` from `@/hooks/use-now` | `useState(null)` + an interval effect | Four components carried the same "null on the server, tick, clean up" wiring. **The mechanism is shared; every interval, threshold and format stays with the caller** — a per-second clock is right on a bid slate and wrong on a list of leagues. |

### Loading states are now part of a screen's definition

`PageSkeleton`, `SkeletonRow`, `SkeletonPanel`, `SkeletonFigure` and `SkeletonLine` live in `@/components/page-skeleton`. **Every remaining screen that does a real read ships a `loading.tsx`.**

Three rules the existing five follow:

1. **Mirror the page's shape** at the same sizes and positions, so nothing jumps when the data lands. A skeleton is a promise about layout, not a spinner.
2. **Fake nothing that would be a lie.** No grey bar stands in for a number or a name. Row counts are fixed, not guessed. **Nothing role-dependent is drawn** — no commissioner queue, no "You commission" badge — because the role has not been read yet.
3. **One `aria-busy` region and one visually hidden `role="status"` per page**, reading *"Loading &lt;what&gt;"* in the reader's words. Everything beneath is `aria-hidden`: announcing forty empty boxes is worse than announcing nothing.

### ⚠ The route-group trap — two screens hit this

`loading.tsx` **wraps its own page *and every child segment below it*** ([the Next.js file convention](../../../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md): *"It will automatically wrap the `page.js` file and any children below in a `<Suspense>` boundary."*).

Driven, that produced **two `<main>` elements at once** on a hard load of `/leagues/[leagueId]`, with the outer region announcing *"Loading your leagues"* over a league. `/seasons/[seasonId]` had the identical trap over the bid slate.

**The fix is a route group**, which scopes the boundary without touching the URL:

```
leagues/(list)/page.tsx  +  leagues/(list)/loading.tsx   ← scoped to /leagues
leagues/[leagueId]/…                                     ← unaffected
```

`error.tsx` does **not** need this — only the nearest boundary renders when an error propagates.

**Check it on any new page that has child segments.** Of the remaining twelve, the ones with children are `/leagues/[leagueId]/announcements` (Tasks 19 and 20 sit below it) and `/films/[tmdbId]` only if something is ever nested under it. Verify in the served HTML: exactly one `aria-busy` and one `role="status"` per route.

### The seven conditions gain an eighth

Condition 4 — *"the segment has an `error.tsx`"* — now reads: **the segment has an `error.tsx` built on `ErrorScreen`, and a `loading.tsx` built on `PageSkeleton` if it reads anything.**

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
| **5** | How it works — **DONE** | `/how-it-works` | `2.1` |
| **6** | Home — **DONE** | `/leagues` | `4.1` |
| **7** | Accept an invite — **DONE** | `/invites/[token]` | `4.9` |
| **8** | Create a league — **DONE** | `/leagues/new` | `4.8` |
| **9** | League home — **DONE** | `/leagues/[leagueId]` | `4.2` |
| **10** | Start a season — **DONE** | `/leagues/[leagueId]/seasons/new` | `5.2` |
| **11** | Season home — **DONE** | `/seasons/[seasonId]` | `3.1` |
**THE REMAINING TWELVE WERE RE-ORDERED ON 2026-08-29.** The task numbers below are the new build order; **the task numbers in the section headings further down are the original ones and did not move**, because a task's content is unchanged and renumbering twelve headings would break every reference to them. Read this table as the order and the headings as the identity.

| # | Task | Route | Board | Was |
|---|---|---|---|---|
| **12** | Account | `/account` | `4.10` | 20 |
| **13** | A player's profile | `/players/[profileId]` | `2.4` | 15 |
| **14** | Film — catalog | `/films/[tmdbId]` | `2.2` | 13 |
| **15** | Film — league record | `/leagues/[leagueId]/films/[tmdbId]` | `2.3` | 14 |
| **16** | The week board | `/seasons/[seasonId]/weeks/[weekId]` | `3.2` | 12 |
| **17** | The record book | `/leagues/[leagueId]/records` | `4.3` | 16 |
| **18** | Announcements list | `…/announcements` | `4.5` | 17 |
| **19** | Reading one | `…/announcements/[announcementId]` | `4.7` | 18 |
| **20** | Writing one | `…/announcements/new` | `4.6` | 19 |
| **21** | Dues | `/leagues/[leagueId]/dues` | `4.4` | 21 |
| **22** | League settings | `/leagues/[leagueId]/settings` | `4.11` | 22 |
| **23** | Payouts | `/seasons/[seasonId]/payouts` | `5.1a` / `5.1b` | 23 |

**Why the shell is first, ahead of sign-up.** Every auth screen's success path lands inside the app — sign-up confirms to `/leagues`, reset signs you in. Building them first means each drive stops at a 404 and "it worked" cannot be shown. One day of shell buys an honest drive on all 22.

### Why the remaining twelve moved

The original order was **the user's path through the app**, which is the right order for building a coherent story and the wrong one for keeping the app walkable while it is half-built. Two forces override it, and both were found by auditing the built screens rather than by reading the plan.

**1. Eleven links on built screens already point at pages that do not exist.** Every one 404s today.

| Target | Linked from | Sites |
|---|---|---|
| `/account` | the shell's bottom nav, the mobile drawer, the account menu, `/leagues`' right rail | **4** |
| `/players/[profileId]` | every roster name, every leaderboard row, the account menu | **3** |
| `/leagues/[id]/settings` | League Home's header button, the member roster | **2** |
| `…/announcements` and `…/announcements/[id]` | League Home's announcements panel | **2** |
| `/leagues/[id]/records` | League Home's record book panel | **1** |

`/account` is the worst by a distance: **three of its four link sites are in the app shell**, so the dead link is on *every signed-in screen* rather than on one page. `/players/[profileId]` is next. Building those two first is two screens' work and it stops the shell lying.

**2. The week board needs a route that used to come after it.** Task 12's step 5 gives the bid page's `PosterCard` the `href` it has carried unset since it was built, and that destination is `/leagues/[id]/films/[tmdbId]` — created by what was Task 14. The old order handled this by saying "leave it unset and note it", which books a second visit to a finished screen. **The two film routes now come first**, so the poster links get their destination once, inside the task that needs them. Nothing in either film task depends on the week board.

**Task 16 (the week board) must still not be skipped ahead of Task 11.** It redirects to the already-built `/bid` when a week is biddable, and that redirect is the only thing keeping the two screens from disagreeing about which state owns the URL. Task 11 is done, so this is satisfied.

**What did not move, and why.** Announcements stays a block of three consecutive tasks: they share one composer file and one mental model, and splitting them costs a re-read. Dues, settings and payouts stay last — they are the deepest surfaces, two of them are commissioner-only, and none is linked from anywhere a player passes through on the way to something else.

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

**A CLAIM MADE IN THIS TASK WAS WRONG, AND IS CORRECTED HERE.** The first version of this record said `/auth/confirm` sent every recovery link to the landing rule instead of to this screen, "proved by following a real token". What was actually followed was a hand-built URL carrying no `next` — **not the link the app sends.** The live project's recovery template appends it: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=%2Freset-password`, read from the project config on 2026-08-29. The emailed flow was never broken.

**The `/auth/confirm` change stays, re-described as what it is: defence in depth.** A recovery token can still reach the handler without `next` — one minted by the admin API, or a template edited back towards a default — and the landing rule is the wrong answer for every such case. One line, cannot be wrong. **`next` remains the mechanism; this is the floor under it.**

**The lesson is the reusable part:** the destination of an emailed link is dashboard state, invisible from the repo, and `landing.ts`'s own docblock said so — "recovery and email-change pin `next` in the template itself". A comment was treated as stale because a neighbouring one had been; the project config is the source of truth and can be read with the Management API.

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

### Task 5: `/how-it-works` — DONE

**Board:** `2.1  /how-it-works`

**Public route, no gate, no composer.** Seven files: [src/app/how-it-works/](../../../src/app/how-it-works/) — `page.tsx`, `error.tsx`, and five bands in `_components/` (`how-it-works-hero`, `week-beats`, `rules-worth-knowing`, `worked-example`, `how-it-works-close`).

**Three components moved to `src/components/`, each because this was the second route to need it** — rule 1, applied rather than anticipated:

- `landing-nav` → **`public-header`**, renamed for what it is rather than where it was born. The board draws the identical signed-out bar.
- `PerforationEdge`, out of `landing-hero`. It carries the `xl:` reasoning — the columns sit 28–54px in, so below ~1280px the text would paint over them — which must not be re-derived per band.
- `ScoreFormula`, out of `landing-hero`. The subtle part is that `×` and `=` are `aria-hidden` with spoken words beside them, because a screen reader's default punctuation level skips both and would read the rule as three unconnected nouns. It takes `ground="paper" | "ink"` and picks the accent itself; neither red is legible on both grounds.

**THREE CORRECTIONS WHERE THE BOARD AND THE RULEBOOK DISAGREE.** The plan's own instruction is that the rulebook wins.

1. **There is no limited-release setting.** The board says "Some leagues opt limited releases in." The rulebook is explicit — "there is **no eligibility setting**" — wide release is the commissioner's per-film judgement, and the screen-count threshold that once existed was retired. What survives is the refund path, which is what the rule now describes. **This also contradicts Task 8's step 2**, which still lists "include limited releases (off default)" as a house rule to build — see below.
2. **The tier count is a default, not a rule.** The board states "the top three distinct amounts" twice, flat. It is `season_settings.top_n_distinct`, 3 by default, fixed per season, **[Configurable]**. Both mentions now name three as the default.
3. **The $0 bid is legal and never wins.** The board says only "$1 minimum", which is true of non-zero bids and silent about the one people are surprised by — it exists so a player who has spent their bankroll can still take part in a week. Folded into beat 02 rather than added as a sixth rule.

**The worked example uses the rulebook's own numbers, not the board's.** Board 2.1 works through *Wicked: For Good* at $68.2M and 72%. Those figures are invented, and attaching invented box office to a real film on a public page states something untrue about a real release. The rulebook already carries an example built for this — **Backrooms**, bids of $11/$8/$6/$6/$6/$6, opening $81.4M at 89% → 72.45 — so the page uses it. It cannot contradict the rulebook because it *is* the rulebook, and its tie is more emphatic than the board's: **six owners from three tiers.**

**One presentational correction:** the board paints the beat numerals `#EB4B37` on a paper panel, which is 3.42:1. That is the ink-side accent; on paper the same accent is `--primary` at 5.04:1.

**The `#faq` anchor exists and was measured.** `/leagues` will link to `/how-it-works#faq` in Task 6; the rules section carries the id, and following the anchor scrolls to **641px**. If that section is ever renamed or split, the anchor moves with it.

**One thing the board could not draw: a member reading a public page.** Step 7 requires following `#faq` *from `/leagues` as a member*, so members do arrive here — and selling them an account they already have is wrong twice over. The page makes one `getUser` call, for chrome only, and both the header slot and the closing CTA become a way back into the app. **It decides nothing about the content**; the page below is identical either way. Fixing only the header would have looked deliberate in one place and forgotten in the other.

**The drive, at 1440×900.** Console clean, exactly one `<main>`, one `<h1>`, every control named.

| | Signed out | Signed in |
|---|---|---|
| Header right slot | Sign in · Create account | Your leagues |
| `/signup` links on the page | 2 | 0 |
| `/leagues` links on the page | **0** | 2 |

**`/login`'s form reset was fixed in the same pass** (the last screen carrying it): a wrong password now keeps the address and clears only the password. Verified — alert "Invalid login credentials", email retained, password empty.

**Not driven:** nothing on this page fetches or writes, so there is no role it renders differently for beyond the two above.

**RAISED FOR TASK 8:** its step 2 tells the builder to make "include limited releases" a configurable house rule. The rulebook retired that setting. **The two cannot both ship** — that task's copy needs re-deriving from the rulebook before it is built.

---

### Task 6: `/leagues` — DONE

**Board:** `4.1  /home`

**`/leagues` IS the league list** — it absorbed what the IA map called `/home`, and before that a separate `/league` index whose own description was *"`/home`'s empty state wearing a URL"*. One address, three names in its history. **The composer file stays `src/lib/home.ts`** — renaming it would put `leagues.ts` one letter from `league.ts`.

**What it is for, settled 2026-08-29 after comparing route maps with products that share this grain.** A doorway, not a room: the only screen about the viewer's *relationship to leagues* rather than about a league. Three jobs and nothing else — the zero-league state, the two actions that are not about a particular league (accept an invitation, start one), and "what am I part of, and what needs me".

**Why it is not a cross-league dashboard.** Fantasy platforms do aggregate — Yahoo's Home tab is a card per league, reorderable, with a team switcher on long-press — and it works because their players are in many leagues at once bidding on the same players. Real usage here is **one main league and occasionally a second** (ADR-094). At one league an aggregate is a page with one number on it. `src/lib/home.ts` already carried the rule this respects: *"if a statistic ever appears in this file, that is the regression."*

**Files:**
- Create: [src/app/(member)/leagues/](<../../../src/app/(member)/leagues/>) — `page.tsx`, `actions.ts`, `error.tsx`, and five `_components/`: `greeting`, `invite-card`, `league-rows`, `side-panels`, `no-leagues`.
- Modify: `src/lib/home.ts` — `getHome(ctx) -> Home` and `byUrgency`, beside the existing `getHomeLeagues`.

**URGENCY ORDER IS THE ONE THING ADDED BEYOND THE BOARD.** A league with bidding open sorts above one without; among those, the deadline closing soonest first; then a live season above one between seasons; then alphabetical. Alphabetical order answers nothing — it is a filing system, and a filing system is what the spreadsheet was. **Proved in the browser:** with a live deadline seeded, *Dev League* moved from second to first and the other two held their order.

**NO RANK, THOUGH THE BOARD DRAWS ONE.** Board 4.1's rows read "Season 34 · nine players · **you are 2nd**". A per-league rank is still a standing, it costs a leaderboard query per league on the one page built to be thin, and it already has a home on League Home scoped to a season. Raised rather than quietly dropped — **say the word and it goes in.**

**The deadline is time remaining, not a wall clock.** The board draws "Bids due 8pm". Eight o'clock where? One instant, read from many timezones, and the server has none of them. "Bids close in 3 hours" is the same fact, timezone-free, and is what the row is for. Null before mount, per the countdown's own rule.

**The greeting is a client component for the same reason** — "Evening, Dana" and the date are facts about the viewer's clock. The name renders on the server; one word and one line fill in on mount.

**The drive, at 1440×900, in three states.**

- **`dev-player` (3 leagues):** urgency order held, the open-week chip and "bids close in 3 hours" rendered on the right row only.
- **`dev-outsider` (0 leagues, 1 invite):** the landing rule delivered them here, and both states rendered together — the invitation above, the empty state below.
- **The write completed and was confirmed in the database, not from a banner.** Accepting wrote `league_members` (player) and `season_members`, and stamped the invite's `accepted_at`. The league count on the row went 2 → 3 and **the shell's switcher gained the league without a reload**, which is what `revalidatePath("/", "layout")` is there for. All three rows were then reverted and the fixture re-verified at 0 leagues, 0 season memberships, 1 pending invite.

Console clean, one `<main>`, one `<h1>`, every control named.

**One copy defect found by driving it:** the empty state closed with "waiting on an invitation? it will appear here" — reassuring with nothing, a flat contradiction printed directly beneath the invitation `dev-outsider` had just been sent. The line is now conditional.

**A FIXTURE DEFECT WAS FOUND AND FIXED IN `scripts/seed-dev.mts`.** Re-seeding refreshed week 1's deadline but left its `status` at whatever it had become — producing an impossible row, a **closed** week with a deadline three hours in the future. Every reader that asks "is a week taking bids" filters on `status = 'open'`, not on the clock, so the nav countdown, the bell's unbid-week alert and this page's open-week chip were all undrivable from the moment anything closed week 1 — and re-seeding *looked* like it had fixed them, because the deadline moved. The refresh now sets `status: "open"` too.

---

### Task 7: `/invites/[token]` — DONE

**Board:** `4.9  /invites/[token]`

**Files:** [src/app/invites/[token]/](<../../../src/app/invites/>) — `page.tsx`, `error.tsx`, `_components/invite-decision.tsx`. Plus `src/lib/actions/league.ts`, which the invitation writes moved into.

**THE WRITES MOVED, WHICH IS RULE 2 FIRING ON SCHEDULE.** `acceptInvite`/`declineInvite` lived in `(member)/leagues/actions.ts` until this route needed the same RPC; they are now `acceptInviteById`, `acceptInviteByToken` and `declineInvite` in [src/lib/actions/league.ts](../../../src/lib/actions/league.ts), and the segment file is deleted. **Two names rather than one taking either:** `accept_league_invite` accepts exactly one of token or id and raises when given both or neither, so a single wrapper would push that to runtime for no gain. The caller always knows which it holds.

**It sits OUTSIDE `(member)`, which the plan's file list did not say.** Board 4.9 strips the chrome to one line and centres a single decision, and that is right — the shell's switcher and nav invite someone to wander off instead of answering, and for a person joining their *first* league most of that shell is empty. The gate moves into the page, where a composer's gate belongs anyway.

**FIVE STATES, NOT THE THREE THE PLAN NAMED — read off what the RPCs can actually distinguish.** All five were driven.

| State | What it says | Driven as |
|---|---|---|
| Signed out | — proxy carries the destination | no cookie → `/login?next=%2Finvites%2F<token>` |
| Bogus token | "This link isn't valid" | a made-up token |
| Already a member | "You are already in Dev League" | `dev-outsider`, second visit |
| **Wrong account** | "This invitation is for a different account" | `dev-frank`, a non-member |
| Live | the league name and one action | `dev-outsider` |

**`alreadyMember` is checked BEFORE the wrong-account case, and that ordering is a decision.** Someone already in the league gets that answer even when the invitation was addressed to somebody else: it is the more useful of two true statements, and whose invitation they are holding does not change that they need nothing.

**The wrong-account state does NOT print the address the invitation was sent to, though `peek` returns it.** Whoever reads that screen holds a token emailed to someone else — a forwarded message, a shared screen, a link that got loose — and naming the recipient hands that person's email to exactly the reader who should not have it. The viewer's OWN address is shown instead: the person who owns the mailbox knows which account to switch to, and nobody else learns anything. **Verified in the drive that the recipient's address does not appear.**

**The expired copy is worded for two causes on purpose.** `peek` computes `expired` as `expires_at < now() OR accepted_at is not null`, so for a TARGETED invitation it fuses "ran out of time" with "already used" — separable only by changing that function. For an OPEN link the flag is unambiguous, because `accepted_at` is never stamped on one so that a link shared with a group stays usable, and the copy differs rather than hedging in both cases.

**No decline here, though `/leagues` has one.** `decline_league_invite` takes an id and a link carries only a token — and more to the point an open link is shared with a group, so declining it would either do nothing or take it away from everybody.

**The drive, at 1440×900.** Console clean, one `<main>`, one `<h1>`, every control named. **The join completed and was confirmed in the database:** `league_members` (player), `season_members` in the active season, `accepted_at` stamped, and the browser landed on `/leagues/<id>`. All three rows were reverted and `dev-outsider` re-verified at zero leagues.

---

**THE FACTS PANEL COST A MIGRATION, AND IT WAS APPROVED AND SHIPPED.** Board 4.9 draws four league facts, and none was reachable: `leagues`, `league_members`, `seasons` and `season_settings` all gate SELECT on `is_league_member` / `is_season_member` — confirmed against `pg_policies` — so a person holding an invitation can read nothing at all. `peek_league_invite` is the one `SECURITY DEFINER` window through that wall and it returned the league's name and three flags.

[`20260829010000_peek_invite_shows_the_league.sql`](../../../supabase/migrations/20260829010000_peek_invite_shows_the_league.sql) adds `member_count`, `bankroll`, `winning_tiers` and `joins_current_season`. `drop` then `create`, not `create or replace` — Postgres refuses to replace a function whose OUT parameters change. Applied, `npm run types:gen` run, and `types:fresh` now fingerprints **115** migrations with 0 stale.

**Two departures from the board inside that panel.**

1. **The fourth row is not "next season starts".** `seasons` has no start date to report — only `created_at` and `status`. What a person actually needs is whether joining puts them in the season already running, which is the rule `accept_league_invite` applies; the panel now asks it **before** the click rather than leaving it to be discovered after. Rendered from `season_bidding_has_begun`, the same function the write uses, so the screen and the outcome cannot disagree.
2. **The members' avatars are not built.** That is a roster — names and faces of people who never agreed to be shown to whoever holds a link — and the count answers the question the panel exists for.

Every season field is null together when a league is between seasons, and the panel omits those rows rather than printing a bankroll of $0.

**Driven as `dev-outsider`:** Members 2 · Season bankroll $100 · Winning tiers 3 · This season "You are in it". Console clean, one `<main>`, every control named.

---

### Task 8: `/leagues/new` — DONE

**Board:** `4.8  /leagues/new` — the board draws step 2.

**Files:** [src/app/(member)/leagues/new/](<../../../src/app/(member)/leagues/new/>) — `page.tsx`, `error.tsx`, `_components/create-league-wizard.tsx`. Plus `createLeague` in [src/lib/actions/league.ts](../../../src/lib/actions/league.ts).

**Four steps, one submit.** Saving step by step would leave half-built leagues behind every time somebody closed the tab on step three, and there is no draft-league state for them to land in. The write runs three RPCs in an order chosen so each failure leaves something finishable rather than something to unpick: league → season → invites. **A failed invite must never read as "your league was not created"**, so the result carries `failedInvites` instead of throwing.

**THE LIMITED-RELEASES TOGGLE IS NOT BUILT, per the developer's instruction of 2026-08-29 and for two independent reasons.** The rulebook retired the setting — wide release is the commissioner's per-film judgement when they build the slate, not a rule the app enforces — and **`create_season` has no parameter for it**, so the control the board draws could never have changed anything. `include_limited_releases` keeps its column default of `false` and nothing in the app writes it.

**One more control the board draws that nothing can save:** "Results captured — when the weekend gets frozen into points". No parameter exists, and the rulebook describes capture time as fixed rather than per-league. Left out rather than rendered as a control that silently does nothing. In its place the step collects the timing value the RPC does require — `bids_due_dow`, validated to Monday–Thursday — plus the time, whose zone travels with it from the browser.

**AMENDED 2026-08-29 (Task 10):** the hand-rolled step rail is gone. It was a static `<ol>` — steps not focusable, not clickable, no way back but the Back button — and is now [`@reui/stepper`](../../../src/components/reui/stepper.tsx), the one stepper in the configured registries that runs on Base UI rather than radix. The house-rules and first-season steps are now the shared `HouseRulesFields` and `SeasonDatesFields`, and the season length is derived from two dates rather than typed. See Task 10 for the sweep and for the three lint defects the vendored component arrived with.

**Two primitives were nearly rebuilt by hand, which is the documented failure mode.** The first draft wrote a native `<select>` and used a single-line `Input` for the invite list, with comments rationalising both. `ui/select.tsx` and `ui/textarea.tsx` are **both installed**. The rule exists because this is easy to get wrong from memory: *list the folder before composing anything.*

---

**A SECOND MIGRATION WAS NEEDED, AND IT WAS A REAL TRAP RATHER THAN THIS SCREEN'S PROBLEM.**
[`20260829020000_create_season_keeps_its_own_defaults.sql`](../../../supabase/migrations/20260829020000_create_season_keeps_its_own_defaults.sql).

Every settings parameter on `create_season` is `default null`, which reads as "omit it and the column default applies". It did not: the frozen branch named all twelve columns in its INSERT, so an omitted parameter was inserted **as null** — and `buy_in`, `payout_structure`, `bids_due_time`, `bids_due_tz` and `default_season_length` are all NOT NULL with good defaults sitting unused on the table.

Passing `p_fake_bankroll` is what flips that branch on, so **any caller that sets a bankroll had to set all five others or the insert failed.** Found by driving this wizard, which sets bankroll, tiers, minimum bid and the deadline — a sensible set of house rules — and got `null value in column "buy_in" of relation "season_settings" violates not-null constraint`. **Task 10 would have hit it next.**

The fix inserts the row with its defaults and then overwrites only what was supplied, `coalesce(p_x, x)` reading the value the table just defaulted to. **The defaults stay in one place — the column definitions — rather than being copied into the function, or worse into TypeScript, where they would drift the first time one changed.** Nothing else about the function moved.

**The partial-failure path proved itself before the fix landed:** the league was created, the season was not, and the screen said exactly that plus what to do — "Open the league and start the season from there." That is the failure mode the action was designed around, demonstrated by accident.

---

**The drive, at 1440×900, as `dev-outsider`.** Console clean, one `<main>`, one `<h1>`, every control named. All four steps walked, and the league created and read back from the database:

| | |
|---|---|
| role | **commissioner** |
| bankroll · tiers · min bid | 100 · 3 · 1 — from the form |
| **buy_in** | **35 — the column default, untouched.** The migration's whole point |
| bids due | Thursday 20:00, `America/New_York` — the browser's own zone |
| season length · weeks seeded | 20 · **20** |
| `include_limited_releases` | `false`, never written by the app |
| invites created | 1 |

The league, its season, its twenty weeks and its invitation were then deleted and `dev-outsider` re-verified at zero leagues.

**Not driven:** the `failedInvites` path with a genuinely rejected address, and a second season in the same league (`create_season` refuses one while another is under way — that is Task 10's territory).

---

### Task 9: `/leagues/[leagueId]` — DONE

**Board:** `4.2  /league/[leagueId]` — built to the League Home prototype (<https://claude.ai/code/artifact/3db8d4ab-80a3-445f-91d8-aa4a22322818>), which is the approved layout for this screen and supersedes the board where the two differ.

**Files:** [src/app/(member)/leagues/[leagueId]/](<../../../src/app/(member)/leagues/>) — `page.tsx`, `error.tsx`, and five `_components/`: `season-thread`, `seasons-table`, `member-roster`, `record-book-panel`, `announcements-panel`. Composer `getLeagueHome(ctx, leagueId)` added to `src/lib/league.ts`.

**THE REGISTRY SWEEP, AND ITS ANSWER WAS MOSTLY "ALREADY VENDORED".** `badge`, `table`, `empty`, `collapsible`, `breadcrumb`, `avatar`, `item`, `separator` are all installed and were used rather than re-composed.

- **`ui/collapsible` was installed and unused on this screen**, and it closes a real behaviour gap: board 4.2 ends the members list with the words *"Four more members"* and no way to see them. The overflow is now a working disclosure. **A caption became a control for the price of an import.**
- **`@shadcn/progress` was rejected, and the reason is structural.** It would have carried the dues proportion. Its dependency is **`radix-ui`**, and this project is **pure Base UI** — `@base-ui/react` is the only primitive package in `package.json`. Installing it drags a second primitive family into a codebase that deliberately has one, for one bar. `@reui/progress` is the Base-UI alternative and returns **401, licence-gated**, which CLAUDE.md already records. **Verdict: no progress bar.** Moot in the end — see dues below.
- `Badge` gained an **`ink` variant**, edited in place. The app has a filled mark that is not the accent — a standing label like "Commissioner" must not compete with the one thing asking to be acted on — and `button.tsx` already carries an `ink` variant under the same name for the same reason.

**THE COMPOSER REUSES THE CAREER TABLE AS THE ROSTER.** `CareerRow` already carries `name`, `isMe`, `isCommissioner`, `seasons`, `titles` and `points` — every column the members list draws — and `league-records.ts` says so itself: *"the career table can stand in for the roster (ADR-083)"*. Calling `getLeagueRoster` too would be a second query answering a question already answered.

**Four departures from board 4.2, each with its reason:**

1. **The live season leads in a band of its own; the seasons table is the archive.** The board puts the running season in row one and highlights it, which makes the table's first row behave unlike every other row.
2. **No champion column on the seasons table.** Not an omission — a recorded decision. `league-records.ts` notes that a `championsRoll` existed for one review cycle and was *"removed on the developer's review — the champions already read off the career table"*. Titles therefore live where that decision put them: a **Titles** column on the members list.
3. **The H1 is a title, not a switcher.** The shell already carries one in the paper band.
4. **No "Start a season" in the page head.** The thread offers it in exactly the states where it is possible; two identical primary buttons in one viewport is the duplication this layout exists to remove.

**⚠ DUES IS NOT BUILT — AND THE REASON RECORDED HERE WAS WRONG. CORRECTED 2026-08-29.**

The original note said dues was *"an unmodelled domain"* with *"no dues table, no payments table and no composer anywhere in the schema, checked across all 116 migrations"*, and that Task 21 was blocked on designing one. **All of that is false**, and it is kept rather than deleted because of how it was reached: the check was `grep` for the word **dues**, which appears in **zero** migrations. The domain is filed under its engineering name.

What is actually there:

- **`settlement_payments`** — the table (`20260805030000_settlement_payments.sql`). Its header defends why a table with amounts in it does not breach *money is derived, never stored*: a payment is not computable from the game at all.
- **`record_settlement_payment`**, **`clear_settlement_payment`**, **`get_league_payments`** — the RPCs, all in `database.types.ts`.
- **`getLeaguePayments(...) -> LeaguePaymentRow[]`** in `src/lib/settlement.ts`, already written.
- Keyed on `season_member_id`, deliberately, so regenerating a settlement cannot orphan payment history. Recordable only against a **finalised** settlement.

**So Task 21 needs no migration, and this page's dues strip is buildable whenever it is wanted.** The lesson worth keeping: searching the schema for a *product* word missed a domain named for its *engineering* concept. Search for the concept — payments, balances, owed — before declaring anything unmodelled.

**The gate is the read.** `leagues` gates SELECT on `is_league_member`, so a league the viewer does not belong to comes back null and the page 404s — the same answer a non-existent league gives, which is the right one to hand a stranger holding an id. **Driven: an unknown uuid returns 404.**

**Three defects found by driving it, all fixed:**

- **The thread named one champion out of a tie.** `dev-player` and `dev-grace` both hold one title in the seeded league, and sorting by titles announced whichever the sort landed on — the exact error the seasons table refuses to make. A champion is named only when one member holds the most titles.
- **Fixing that produced a copy bug**: a league with a finished season but a tied title was told it *"has not played a season yet"*. Three states, three sentences.
- **"1 hour" for 38 minutes.** `timeUntil` rounds to whole hours — generous everywhere else and wrong in the one window the gate's escalation exists for. Inside the hour the gate does its own arithmetic and reads minutes; the shared helper keeps its coarseness for its other callers.

**The drive, at 1440×900 and 390×844.** Console clean, one `<main>`, one `<h1>`, every control named, no mobile overflow.

| State | Driven as | Result |
|---|---|---|
| Week open | `dev-player`, Dev League | gate reads `3 hours / until bids close` beside the red action |
| **Last hour** | deadline moved to 38 min, then restored | meter takes the ink ground, `38 min / left to bid` in `--nav-primary` |
| Between seasons | `dev-commish`, Dev Closing Credits | "1 season played, and the next one is not started" + Start a season |
| Never played | Dev League before seeding | "This league has not played a season yet" |
| Not a member | unknown uuid | **404** |
| Record book | Dev Closing Credits | real aggregates from 7 scored films |
| Record book, empty | Dev League | "Nothing to average yet" rather than a row of noughts |

**Not driven:** the roster disclosure — **no fixture league has more than five members**, so the overflow never renders. `seed:dev` would need a sixth member in one league to exercise it.

---

### Task 10: `/leagues/[leagueId]/seasons/new` — DONE

**Board:** `5.2  /leagues/[id]/seasons/new`

**Files:** [src/app/(member)/leagues/[leagueId]/seasons/new/](<../../../src/app/(member)/leagues/>) — `page.tsx`, `actions.ts`, `error.tsx`, `_components/new-season-form.tsx`.

**ONE PAGE, NOT A WIZARD, AND THE BOARD IS RIGHT.** The research question was whether a stepper could serve this screen and `/leagues/new` both. It cannot, because **board 5.2 is not a wizard** — it is a single form with two titled sections. `/leagues/new` is four steps because it collects four unrelated things from somebody new; this asks a returning commissioner for two dates and five numbers they have chosen before, and a Next button between them and the thing they came to do is cost without benefit.

**WHAT IS SHARED IS THE FIELDSETS, NOT THE CHROME.** Two new components in `src/components/`:

- **`house-rules-fields.tsx`** — bankroll, tiers, minimum bid, and when bids close. This is the fieldset where drift would hurt most: the hints carry rulebook facts, and *"ties are always honoured, so a film can have more owners than tiers"* is the rule people get wrong. Two copies is two chances to explain it differently.
- **`season-dates-fields.tsx`** — the two Fridays, the derived week count, and `weeksBetween`.

Both routes now ask the same questions with the same words.

**THE WEEK COUNT IS DERIVED, NEVER ASKED — and my first draft got this wrong.** The fieldset originally asked for a length, reasoning that `create_season` takes `p_default_season_length`. Board 5.2 and the plan's step 2 both say otherwise and they are right: a commissioner knows when the season ends, not how many Fridays that is. The two dates are the inputs, `weeksBetween` derives the count, the screen shows it back — *"One week per Friday — 6 weeks, numbered 01 to 06"* — and reversed dates refuse rather than submit.

**The rules are inherited, and the screen says so.** `getNextSeasonDefaults` (ADR-078) was already written and unused; this is the screen it was written for. It opens the form on the previous season's settings, or the rulebook's for a league's first, and the copy says changing one here changes it for this season only.

---

### The registry sweep for a stepper

**Only one fits this stack.** `@reui/stepper` — Base UI, one file, no overwrites, not licence-gated. Installed to `src/components/reui/stepper.tsx` and **Task 8's hand-rolled rail was replaced with it.**

| | Depends on | Overwrites | Verdict |
|---|---|---|---|
| `@reui/stepper` | `@base-ui/react`, already installed | none | **installed** |
| `@shadcnblocks/stepper-*` (24 variants) | **`radix-ui`** | **`ui/button.tsx`** | rejected |
| `@shadcn` | no stepper exists | — | — |
| `@animate-ui` | mostly `primitives-radix-*`, no stepper | — | — |

The `@shadcnblocks` family is the tempting one — it includes *"form wizard with per-step field validation"* — but it is the same trap as `@shadcn/progress` in Task 9: **radix in a codebase whose only primitive package is `@base-ui/react`**, and it wants the button carrying our `ink` variant.

**What it bought, in behaviour Task 8 did not have:** the rail was a static `<ol>` — steps not focusable, not clickable, no way back but the Back button. **Driven:** four tabs, step 2 disabled until the league is named and enabled after, `ArrowDown` moves focus to "House rules", `Enter` activates it, and clicking step 1 returns to it.

**THE VENDORED COMPONENT FAILED THIS PROJECT'S LINT ON ARRIVAL, and was fixed in place** — which is what `src/components/reui/` is for. Three errors and three warnings, all real:

- It read `btnRef.current` from two dependency arrays. `react-hooks/refs` rejects it, and rightly: a ref read during render is not reactive, so the memo computing a trigger's index could hold a stale value after the trigger list changed. Now a **callback ref** registers the node and holds it in state.
- The context memo omitted five of its own dependencies.
- And the four focus helpers it listed were **plain function expressions rebuilt every render**, so that memo could never hold — a memo whose dependencies change every render costs a comparison and saves nothing. They are `useCallback`s now.

---

**The drive, at 1440×900 and 390×844.** Console clean, one `<main>`, one `<h1>`, every control named. **A real season was created and read back from the database, then deleted:**

| | |
|---|---|
| weeks seeded | **6**, numbered 1–6 |
| opening dates | 2026-09-04 → 2026-10-09 — six consecutive Fridays |
| members auto-joined | **5** — the whole league roster (ADR-016) |
| settings inherited | bankroll 100 · tiers 3 · min bid 1 · **buy_in 35** · Thursday |
| reversed dates | submit disabled, "The last weekend has to fall on or after the first." |
| a player opening the URL | redirected to `/leagues` |

The season, its six weeks and its five memberships were deleted afterwards and Dev Closing Credits re-verified at one season, none active.

**Not driven:** `create_season`'s refusal when a league already has a season under way. Reaching it means creating two, and the first one is what the drive deletes.

---

### Task 11: `/seasons/[seasonId]` — DONE

**Board:** `3.1  /seasons/[seasonId]` — and both sticky notes.

**Files:** [src/app/(member)/seasons/[seasonId]/](<../../../src/app/(member)/seasons/>) — `page.tsx`, `error.tsx`, and eight `_components/`: `season-picker`, `standing-strip`, `queue-strip`, `season-tabs`, `weeks-tab`, `leaderboard-tab`, `you-tab`, `bump-chart`. Composer `getSeasonHome(ctx)` in `src/lib/season-home.ts`.

**THE QUEUE RENDERED FOR THE FIRST TIME.** `getOverdueWeeks` has sat in `commish.ts` with **zero consumers** since it was written — a composer with no UI, which is the defect the plan's closing check exists to catch. Driven as `dev-frank`: *"Week 04 results are not captured · Results opened Mon, Aug 10 · 3 of 3 films still to capture"*, linking to the week. `dev-player` on the same season sees **no strip at all** — and never fetches it, because the role gates the READ rather than the render.

**Both sticky notes honoured.** The season picker is a header control beside the H1, not a quarter-width rail — and it hides itself when a league has run only one season, because a picker with one option cannot do anything. The Queue is a strip on this page rather than a route, which is the whole of what the retired commissioner tree becomes.

**`?tab=` is honoured and switching writes nothing back.** Driven: `?tab=leaderboard` lands on Leaderboard (the Monday-scores email links it), and clicking through to You leaves the address untouched. A tab is a view of one page, not a place; pushing history for it would turn Back into a tab cycler.

---

### Components, after the developer's correction mid-task

**Told during this task: "don't hand roll components or behaviour that should be registered or reused."** It landed while I was doing exactly that, and the audit found four:

1. **A second countdown.** I was writing a new `Deadline` while `deadline-countdown.tsx` already existed on the bid page — with a **documented three-hour urgency threshold**. Mine had its own idea of urgent, which is the drift the rule exists to prevent. It moved to [src/components/deadline-countdown.tsx](../../../src/components/deadline-countdown.tsx) with a `size` prop (`hero` for the bid slate's 4.5rem figure, `inline` here); the threshold did not move.
2. **The Queue rows.** Hand-rolled flex rows that re-derived `ui/item` — media, title, description, whole row a link, including the description-aware alignment that stops a media block centring against two lines.
3. **The same mistake already shipped twice.** `/leagues`' league rows (Task 6) and League Home's roster (Task 9) were both hand-rolled flex rows. **Both were rebuilt on `Item` in this task** rather than left as precedent.
4. **The bump chart.** I was about to draw axes and paths in SVG. `@shadcn/chart` installs clean — one file, no overwrites — and its only dependency is **recharts**, a charting library rather than a competing primitive family. That is a different trade from the radix rejections: recharts duplicates nothing the project has, and hand-drawn axis arithmetic only ever works for the data in front of you.

**The series hues are the app's own.** `--series-1` … `--series-10` are handed to the chart through `ChartConfig`, which is the wrapper's own mechanism for exactly that. **The Y axis is reversed**, because a rank of 1 is the best position and the smallest number — plotted normally, leading would look like losing. The viewer's line is thicker and nothing else distinguishes it; a second colour channel would fight ten hues that already carry identity.

---

**Two defects of my own, found by driving it:**

- **A dead `invert` prop on the delta figures.** `HubDeltas.rank` is already documented "places CLIMBED, positive is up" — the composer did the inversion, so the prop never changed the output and a second flip would have shown a promotion as a fall. Removed rather than left as configurability nobody asked for.
- **A status map keyed on the wrong enum.** I wrote it against the schema's six-value `week_status`; `WeekStatus` in `commish.ts` is five and deliberately omits `locked`. Mirroring the app type is what lets TypeScript prove the map exhaustive.

**Per-week scores are derived from `myFilms`, not fetched.** `SeasonHub` has no per-week total and adding a read for one would duplicate what the films list already carries. Summing by week costs nothing and cannot disagree with the You tab, because it **is** that list. **A week with no owned film shows a dash, not a zero** — zero is a real score a player can earn.

**The drive, at 1440×900.** Console clean, one `<main>`, one `<h1>`, every control named.

| | |
|---|---|
| Tabs | Weeks · Leaderboard · You, Weeks leading |
| Standing (`dev-player`) | 4th of 5 · 106.26 points · $66 left · 4 films |
| Weeks tab | per-week scores 21.95 / 51.45 / 32.86, then a dash for the unscored week |
| Leaderboard | five real rows, both provisional awards, **5 chart lines** rendered |
| `?tab=leaderboard` | lands on Leaderboard; switching leaves the URL alone |
| Queue (`dev-frank`, commissioner) | one overdue week, correct link |
| Queue (`dev-player`) | **absent, and never fetched** |

**Not driven:** the two-open-weeks state, and a season with ten or more players — the seeded leagues have five, so only five of the ten series hues were exercised.

---

### Task 12: `/seasons/[seasonId]/weeks/[weekId]` — **BUILD ORDER 16**

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

The bid page's card takes an optional `href` that has been unset since it was built, waiting on the league-scoped film route. Pass `/leagues/${leagueId}/films/${tmdbId}`.

**Under the 2026-08-29 re-order that route is already built when this task runs** — it is build-order 15, this is 16 — so the escape hatch the original plan offered is gone and the `href` is set here, for real. If for any reason it is not, leave it unset and **note it in the report** rather than pointing it at the catalog, which carries no pool history.

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

### Task 13: `/films/[tmdbId]` — the catalog view — **BUILD ORDER 14**

**Why it moved ahead of the week board** (2026-08-29): the week board's step 5 gives the bid page's `PosterCard` a destination that Task 14 creates. Building both film routes first means that `href` is set once, in the task that needs it, instead of being left unset with a note.

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

### Task 14: `/leagues/[leagueId]/films/[tmdbId]` — **BUILD ORDER 15**

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

### Task 15: `/players/[profileId]` — **BUILD ORDER 13**

**Why it moved forward** (2026-08-29): three built screens link here and all three 404 — every name in a league roster, every row of the season leaderboard, and the account menu. Second only to `/account` for dead links.

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

### Task 16: `/leagues/[leagueId]/records` — **BUILD ORDER 17**

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

### Task 17: `/leagues/[leagueId]/announcements` — **BUILD ORDER 18**

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

### Task 18: `/leagues/[leagueId]/announcements/[announcementId]` — **BUILD ORDER 19**

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

### Task 19: `/leagues/[leagueId]/announcements/new` — **BUILD ORDER 20**

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

### Task 20: `/account` — **BUILD ORDER 12, THE NEXT ONE**

**Board:** `4.10  /account`

**Why it moved to the front** (2026-08-29): it is the most-linked unbuilt page in the app, and **three of its four link sites are in the shell itself** — the bottom nav's "You" tab, the mobile drawer and the account menu. The dead link is therefore on *every signed-in screen*, not on one page. `/leagues`' right rail is the fourth.

```bash
git grep -n '"/account"' -- src/app src/components   # expect 4 sites
```

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

### Task 21: `/leagues/[leagueId]/dues` — **BUILD ORDER 21**

**Board:** `4.4  /leagues/[id]/dues`

**Real money, tracked outside the game. The app records who paid whom, never how.**

**NOT BLOCKED, and an earlier note in this plan said it was.** Task 9's DONE record claimed dues had no data model and that this task needed one designed first. That was wrong — see the correction there. `settlement_payments`, its three RPCs and `getLeaguePayments` all exist. **This task needs no migration.**

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

### Task 22: `/leagues/[leagueId]/settings` — **BUILD ORDER 22**

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

### Task 23: `/seasons/[seasonId]/payouts` — **BUILD ORDER 23**

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

**Strip route groups before comparing**, or this check lies. A `(list)` or `(overview)` group holds the `page.tsx` while its `error.tsx` sits in the parent — correct, and a naive `dirname` comparison reports it as a missing boundary. Two such groups exist already.

```bash
strip() { sed -E 's#/\([^)]*\)##g' | sort -u; }
diff <(find src/app -name "page.tsx"  | xargs -n1 dirname | strip) \
     <(find src/app -name "error.tsx" | xargs -n1 dirname | strip)
```

Expected: no output. A directory on the left only is a segment that will blow its error up to the whole app.

- [ ] **Step 3: Every reading screen has a loading state, and only one fires**

```bash
find src/app -name "loading.tsx" | sort
```

Then, signed in, for each route: fetch the served HTML and count. **Exactly one `aria-busy="true"` and one `role="status"` per route.** Two means a `loading.tsx` is wrapping a child segment it should not — the route-group trap, which `/leagues` and `/seasons/[seasonId]` both hit before it was found.

- [ ] **Step 4: Every page renders exactly one `<main>`**

```bash
git grep -c "<main" -- 'src/app/**/page.tsx'
```

Four member pages rendered none in the old repo and nothing caught it.

- [ ] **Step 5: Every composer has a consumer**

```bash
for f in src/lib/*.ts; do
  n=$(git grep -l "$(basename "$f" .ts)" -- src/app src/lib | grep -vc "^$f$")
  [ "$n" -eq 0 ] && echo "ORPHAN: $f"
done
```

`getOverdueWeeks` sat with zero consumers for weeks precisely because nothing looked.

- [ ] **Step 6: Run the whole gate one last time**

```bash
npm run verify
```

- [ ] **Step 7: Write the phase digest**

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
