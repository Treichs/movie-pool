# The Movie Pool — Screen Build Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining 22 screens of the 25-route contract, in the order a real person meets them, on top of an app shell that does not exist yet.

**Architecture:** Next.js App Router with React Server Components. Every page is a *placer*: it gates, calls one composer from `src/lib/`, and hands the result to components. Writes are `'use server'` actions colocated in the segment's own `actions.ts`. Authorization precedes every fetch, enforced by the type system rather than by memory — a composer takes an authenticated context, and the only way to obtain one is a `require*` helper that has already checked.

**Tech Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 · shadcn/ui on Base UI, plus `@reui` · Supabase (Postgres, Auth, RLS, `SECURITY DEFINER` RPCs) · Vercel.

**Spec:** [Docs/ia-screen-map.md](../../ia-screen-map.md) is the route contract. [Docs/movie_pool_official_rules.md](../../movie_pool_official_rules.md) is the rulebook and outranks every screen. The design canvas holds one board per screen, and **the board is the approved layout**.

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

- **`MIN_PAIRS` is 137.** It rises as screens put more tokens into use. Raise it in the same commit as the screen that raises the count; lowering it needs a reason.
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
| `/login` | [src/app/(auth)/login/](../../../src/app/(auth)/login/) | Board `1.1`. **The pattern every auth screen copies** — its page comment explains why `<main>` wraps the whole shell rather than the form. |
| `/seasons/[seasonId]/weeks/[weekId]/bid` | [src/app/seasons/](../../../src/app/seasons/) | **The template every screen copies.** Its board is the app itself; the canvas has none. |
| The six route handlers | `src/app/auth/`, `src/app/api/` | OAuth exchange, token-hash confirm, three crons, avatar composition. |
| `src/proxy.ts` | [src/proxy.ts](../../../src/proxy.ts) | Next 16's renamed middleware: session refresh, signed-out bounce to `/login`, last-league cookie. |

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
| **1** | The app shell | `(member)/layout.tsx` | see task |
| **2** | Sign up | `/signup` | `1.2` |
| **3** | Forgot password | `/forgot-password` | `1.3` / `1.3b` |
| **4** | Reset password | `/reset-password` | `1.4` |
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

### Task 1: The app shell

**Board:** the canvas has no board for the signed-in chrome. **Open the canvas first and confirm that.** If one exists, it wins. If not, this task's first output is a shape to approve before any code — do not build a shell nobody has looked at.

**What it is.** The frame every signed-in screen renders inside: the league switcher, the season-scoped nav, the live bid countdown, the account menu, and the breadcrumb trail. ADR-023 settled the model: **a vertical sidebar with one league in focus at a time, the rest reachable through a switcher.**

**Files:**
- Create: `src/app/(member)/layout.tsx`
- Create: `src/app/(member)/_components/*.tsx` — the shell's own pieces
- Move: `src/app/seasons/` → `src/app/(member)/seasons/` (the bid page; the URL does not change)
- Modify: `src/lib/nav.ts:105-120` — see Step 6

**Interfaces:**
- Consumes: `getNavLeagues(supabase, userId) -> NavLeague[]` and `leagueLandingPath(supabase, leagueId) -> string`, both already in [src/lib/nav.ts](../../../src/lib/nav.ts). **They exist and have zero consumers. Import them; do not re-derive.**
- Produces: the layout every task from 6 onward renders inside. Its pieces stay in `(member)/_components/` unless a route outside the group needs one.

`NavLeague` carries, per league: `id`, `name`, `avatarPair`, `avatarGlyph`, `isCommissioner`, `currentSeason` (`{ id, name, status, number }` or null), `seasonIds`, and `openWeek` (`{ id, number, seasonId, bidDeadline }` or null).

- [ ] **Step 1: Read the reference, then decide what to keep**

The old repo's chrome is `C:\Dev\Git\movie_pool_app\src\components\blocks\chrome\`: `app-topnav`, `league-switcher`, `account-menu`, `nav-drawer`, `nav-bid-timer`, `page-breadcrumbs`, `page-header`. Read them for the *behaviour* they encode. **Do not port them wholesale** — they are the five-tier structure this rebuild is rid of.

- [ ] **Step 2: Search the registries before composing anything**

```bash
npx shadcn@latest search @shadcn -q "sidebar"
npx shadcn@latest add sidebar --dry-run
npx shadcn@latest search @shadcnblocks -q "dashboard shell"
```

A sidebar with a switcher in its header is a solved shape in every registry configured here. **`--dry-run` first.** A `~ overwrite` on `src/lib/utils.ts` or `ui/button.tsx` is a stop-and-read, never an accept.

- [ ] **Step 3: Build the layout**

```tsx
// src/app/(member)/layout.tsx
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  const leagues = await getNavLeagues(ctx.supabase, ctx.user.id);
  return <AppShell leagues={leagues}>{children}</AppShell>;
}
```

**The layout does not render `<main>`.** Each page owns its own landmark, and two would fail condition 7 on every screen at once.

- [ ] **Step 4: The countdown is the shell's one vermilion element**

`openWeek.bidDeadline` is fetched eagerly by `getNavLeagues` precisely because a countdown cannot be lazy — it must be right before the first click. A null deadline renders **nothing**, never a count to an invented moment.

- [ ] **Step 5: Move the bid page into the group**

```bash
git mv "src/app/season" "src/app/(member)/season"
```

The URL is unchanged — `(member)` is a group, not a segment. Confirm with `npm run build` that `/seasons/[seasonId]/weeks/[weekId]/bid` still appears in the route list.

- [ ] **Step 6: Delete the deploy-window fallback in `nav.ts`**

`getNavLeagues` retries its select without the avatar columns if the first attempt fails, because migration `20260803060000` once lagged a deploy and every member's league list silently vanished. That migration is applied everywhere. The file's own comment says *"Delete this once applied everywhere — it is a bridge, not a design."* Delete the retry; keep the `?? null` reads.

- [ ] **Step 7: Run the gate**

```bash
npm run verify
```

- [ ] **Step 8: Drive it**

The shell has no page of its own, so drive it through the bid page. As `dev-player`: the sidebar lists both fixture leagues, the switcher changes focus, the countdown ticks against a real deadline. As `dev-commish`: the commissioner entries appear. As `dev-outsider`: **the zero-league state renders an honest empty shell, not a broken one** — that account belongs to no league and is the state most likely to throw.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(shell): the signed-in frame, and nav.ts finally has a consumer"
```

---

### Task 2: `/signup`

**Board:** `1.2  /signup`

**Files:**
- Create: `src/app/(auth)/signup/page.tsx`, `signup-form.tsx`, `error.tsx`

**Interfaces:**
- Consumes: `signUp` and `resendConfirmation`, **already exported from [src/app/(auth)/actions.ts](<../../../src/app/(auth)/actions.ts>) and currently unused. Do not rewrite them.**
- Consumes: `AuthSplitShell` with `variant="field"` and **`inkLayout="strip"`**; `PasswordInput`, `SubmitButton`, `GoogleMark` from `src/components/`.

- [ ] **Step 1: Open the board, then check the registry**

```bash
npx shadcn@latest add signup-05 --dry-run
```

- [ ] **Step 2: Copy the shape of `/login`**

[src/app/(auth)/login/](<../../../src/app/(auth)/login/>) is `page.tsx` + `sign-in-form.tsx` + `sign-in-ink.tsx` + `error.tsx`. Same split here.

- [ ] **Step 3: The right half carries the game in three beats**

Not the scoring rule — that is `/login`'s. **This is the one place a new player is told what they have joined**, and it is onboarding, not decoration.

- [ ] **Step 4: Three fields, and the hint is real copy**

`display_name` (placeholder *"What the standings will call you"*), `email`, `password`. The password hint states the actual requirement; it is not filler text.

- [ ] **Step 5: Keep the confirmation state**

On success the form renders an `Alert role="status"`. **It is the only thing that tells someone to go and check their email** — it must survive whatever the rebuild does to the form.

- [ ] **Step 6: Add `error.tsx`**

- [ ] **Step 7: Run the gate**

```bash
npm run verify
```

- [ ] **Step 8: Drive it**

**Complete a real signup** with a throwaway address and confirm the row exists in the database — not that the banner appeared. Follow the confirmation email through `/auth/confirm` and confirm you land inside the shell. Then delete the row you created.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): signup is rebuilt, and its right half explains the game"
```

---

### Task 3: `/forgot-password`

**Board:** `1.3  /forgot-password` **and** `1.3b  /forgot-password — sent`. Two boards, one route: **the sent state is a real state, not a toast.**

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`, `forgot-password-form.tsx`, `error.tsx`

**Interfaces:**
- Consumes: `requestPasswordReset` from `(auth)/actions.ts` — already written.
- Consumes: `AuthSplitShell` with **`variant="rail"`** — a 96px perforated ink strip, no `ink` slot. Passing `ink` to it is a compile error, by design.

- [ ] **Step 1: Open both boards**

The treatment differs from the front door deliberately: this is **an interruption reached from an email, not a place you arrive**, so it gets the rail rather than the half-page field.

- [ ] **Step 2: Build the form state to board `1.3`**

- [ ] **Step 3: Build the sent state to board `1.3b`**

It carries **ink, not green** — the board draws it that way and the 2026-08-28 palette ruling keeps it: a state colour is reached for deliberately, and "we sent an email" is not a state worth spending one on. It names the address it sent to and says the link expires in one hour.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive both states**

Submit a real address for a seeded account and confirm the email actually sends — `pool@moviepool.app` is live. Then confirm the sent state renders. **Report whether you tested the resend path**; if the fixture makes it unreachable, say so rather than claiming it works.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): forgot-password gets the rail treatment and a real sent state"
```

---

### Task 4: `/reset-password`

**Board:** `1.4  /reset-password`

**Files:**
- Create: `src/app/(auth)/reset-password/page.tsx`, `reset-password-form.tsx`, `error.tsx`

**Interfaces:**
- Consumes: `completePasswordReset` from `(auth)/actions.ts` — already written.
- Consumes: `AuthSplitShell` with `variant="rail"`.

- [ ] **Step 1: Open the board**

The strength meter is **four ink steps with a word, not a red-amber-green ramp.** There is no amber in this palette, so a traffic light cannot be built from it honestly — and the red that does exist is the brand's, which would make a weak password look like a feature.

- [ ] **Step 2: Two fields**

`password` and `confirm`, with the confirm field showing a check when they match.

- [ ] **Step 3: Add `error.tsx`, and mind its copy**

A reset link is single-use, so a failure here needs to say whether the link is spent. **If the boundary cannot tell, say what to do — request a new link — rather than guessing.**

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it end to end**

Request a reset for a seeded account, **open the real link from the real email**, set a new password, and confirm you can sign in with it. **Then set it back to `dev-Passw0rd!`** so every later task's fixtures still work. That restoration is why this task closes the auth run.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): reset-password is rebuilt, with an ink strength meter"
```

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
- Create: `src/app/(member)/home/page.tsx`, `_components/*.tsx`, `error.tsx`
- Modify: `src/lib/home.ts` — it already exports `getHomeLeagues(supabase, userId) -> HomeLeague[]`; add the screen composer beside it.

**Interfaces:**
- Consumes: `getHomeLeagues` from `src/lib/home.ts` and `getMyInvites(supabase) -> MyInvite[]` from `src/lib/invites.ts`. **Both already written — import them.**
- Produces: `getHome(ctx) -> Home` in `src/lib/home.ts` — the viewer's leagues with their live state, pending invites, and the zero-league flag.

- [ ] **Step 1: Open the board**

**The pending invite is the one vermilion element on this surface.** Not "Start a league", not the open-week chip on a league card. The invite is the only thing asking you to act.

- [ ] **Step 2: Confirm nothing still points at `/leagues`**

```bash
git grep -n '"/leagues"' -- 'src/*.ts' 'src/*.tsx'
```

Expected: nothing. `resolveLandingPath`'s zero-leagues case is the one to check by eye — it must return `/leagues`.

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

- **The route map is 25** — 21 kept, plus `/leagues/[leagueId]/films/[tmdbId]` from the film split, plus `/`, `/login` and `/leagues/[leagueId]/settings`. `/commish/[seasonId]/payouts` folded into `/seasons/[seasonId]/payouts`; `/leagues` folded into `/leagues`.
- **Elevation is two tiers:** panels flat with a border, floating layers only carry a shadow.
- **The commissioner Queue is a strip, not a route** — and `getOverdueWeeks` was a composer with no UI, folded into `getSeasonHome` rather than deleted as dead code.
- **Configuration centralizes, operations distribute** — the test that settled the commissioner question and produced `/leagues/[leagueId]/settings` as the one legitimate second commissioner page.
- **`/how-it-works` survives the landing page** — the landing **sells**, how-it-works **explains**.
- **Ruling 78:** desktop-only review at 1440×900 for this phase, with the named reversal conditions.
- **A film is not exclusively scoped to a league**, which is why the hybrid — a top-level catalog resource and a league-scoped one — is the documented right answer rather than a query parameter.
