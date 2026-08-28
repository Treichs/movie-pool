@AGENTS.md

# CLAUDE.md

## What this is

**The Movie Pool** — a season-long, fake-money game. Players submit blind sealed
bids to own films opening each weekend; owned films score
`opening box office ($M) × (Tomatometer / 100)`. It replaces a per-season Excel
workbook run by hand by one commissioner.

**The rulebook is the source of truth for how the game works:**
[Docs/movie_pool_official_rules.md](Docs/movie_pool_official_rules.md). If a rule
question is not answered there, surface it — do not invent an answer.

## Working with Chris

- **No coding background**, strong agentic-workflow experience. Explain concepts
  and vernacular in plain language before asking him to decide.
- **Do not assume.** Check the codebase or ask. A guess that compiles is still a guess.

## Stack

Next.js App Router · React Server Components · TypeScript · Tailwind v4 ·
shadcn/ui on Base UI · Supabase (Postgres + Auth + RLS) · Vercel.

```
npm run dev        localhost:3000
npm run verify     typecheck · lint · a11y:contrast · types:fresh · build
npm run seed:dev   the persistent dev fixtures — idempotent, safe to re-run
npm run types:gen  regenerate the schema type after a migration
```

## The two rules that replace an architecture

**1. Components have two tiers** (registry code, and everything else)**.**

- `src/components/ui/` — shadcn and registry code. **Edited in place** when the
  app needs a different shape. There is one `button`, one `card`, one `table`;
  differences are variants on that file, never a second file.
- `src/components/reui/` — where `@reui` items install themselves. Left where
  the CLI puts them so their update path keeps working; treated exactly like
  `ui/`, edited in place, never forked.
- Everything else starts in the route's `_components/` and moves to
  `src/components/` **the first time a second route needs it** — never in
  anticipation. The cost of getting it wrong is one file move.

**2. Reads live in `src/lib/`, writes colocate.**

- A page imports its composer from `src/lib/` directly. Reuse what is there;
  do not re-derive a query that already exists.
- `'use server'` actions live in the segment's own `actions.ts`, return
  `ActionResult`, and call `revalidatePath`. A write two routes share moves to
  `src/lib/actions/`.
- **Authz precedes the fetch, always.** Every composer takes an authenticated
  context and gates before it reads. This is a review point, not a lint rule.

## Before writing any UI, search the registries

`src/components/ui/` is what is **installed**, not what is **available**.
Listing that folder tells you nothing.

```bash
npx shadcn@latest search @shadcn -q "<thing>"   # does it exist?
npx shadcn@latest add <name> --dry-run          # what would it touch?
npx shadcn@latest add <name>
```

The shadcn MCP server is configured — ask it rather than running the search by
hand. Configured namespaces: `@shadcn`, `@shadcnblocks`, `@reui`,
`@animate-ui`, `@8bitcn`.

**`--dry-run` first, every time. `-o/--overwrite` is the flag that can lose
work** — it is the only one that skips the "already exists" prompt. That prompt
defaults to **No**, so a bare `add` cannot silently replace a file you adapted;
in a non-interactive context a conflict is skipped outright rather than written.
`-y` gates the new-style/new-theme confirmation and does not touch file
overwrites, so it is not the dangerous flag it was once described as.

Read `~ overwrite` in a dry run as **"this file differs from the registry
copy"**, not "this file is about to be taken": identical files are classified
`skip` silently, so the flagged paths are exactly the ones already customised
here. Any of them is a stop-and-read — `--diff <path>` before deciding.

Reach for the registry whenever you are about to write a styled `div`, a button
inside a field, a callout, an empty state, a loading placeholder or a
confirmation. Those all have primitives (`alert`, `input-group`, `empty`,
`skeleton`, `spinner`, `alert-dialog`). "Not installed, so I'll compose it"
reached from an `ls` is the documented failure mode.

## Theming

`src/app/globals.css` is the whole theming system: values in `:root`, the same
names inverted in `.dark`, and `@theme inline` mapping each to a Tailwind
utility. To recolour the app, edit the values — never the components.

- **`--radius` drives every corner.** No component hardcodes one.
- **`--color-*: initial`** deletes Tailwind's stock palette, so `bg-blue-500`
  emits no CSS at all. Raw palette classes are impossible, not forbidden.
- **The accent is two tokens, one per ground.** `--primary` (`#C52F1B`) is the
  paper-side red at 5.04:1 — legal as a ground and as text, one per surface;
  `--nav-primary` (`#EB4B37`) is the ink-side red at 5.59:1 and appears
  **nowhere but an ink surface**. No red is legible on both.
- **`--edge` (`#84827E`) draws control boundaries**, `--border` (`#DCDBD9`)
  draws panels. A field needs 3:1; a panel edge is decoration.
- **Dark is wired but not switched on.** Keep both blocks in sync anyway;
  registry components read them and `a11y:contrast` sweeps both.
- Three values are counterintuitive and must not be "unified" —
  `--muted-foreground` differs per mode, and `--link` is lifted in dark. The
  reasons are in the file's own header.

## Database

All writes go through `SECURITY DEFINER` SQL RPCs in `supabase/migrations/`.
Blind-bid secrecy and read access are enforced by RLS. **Money and standings are
derived, never stored.**

`src/lib/supabase/database.types.ts` is generated by `npm run types:gen` and
committed. Nothing hand-edits it. Import the client through `@/lib/supabase`,
which re-exports `SupabaseClient` already bound to the schema. Narrow a form
value to a database enum with `asEnum` from the same module.

**Push migrations before deploying the code that needs them, then run
`npm run types:gen`** — `types:fresh` fingerprints `supabase/migrations/`
against the generated file, so a pushed migration without a regeneration is a
red build rather than a wrong number.

## Building a screen

The route set is settled: **25 pages plus 6 route handlers**, in
[Docs/ia-screen-map.md](Docs/ia-screen-map.md). Every address takes one shape
(§7.5): **plural collections, singular items, never more than two levels deep,
and every truncation lands on a real page** — chop `/bid` and you get the week,
chop the week and you get the season, chop the season and you get `/leagues`.
A season is addressed at `/seasons/[seasonId]`, not under its league, because
the full chain would be four levels of mostly-uuid. Every screen has a drawn board
on the design canvas, and one task in
[Docs/superpowers/plans/2026-08-28-movie-pool-screens.md](Docs/superpowers/plans/2026-08-28-movie-pool-screens.md).
**Open the board before writing the screen** — the board is the approved
layout, the task is the approved mechanics.

The drive that closes a screen is the **`ui-review` skill**, not a harness you
invent.

A screen is done when:

1. `page.tsx` renders from a `src/lib` composer that gates before it reads.
2. Its writes are `'use server'` actions in the segment's `actions.ts`.
3. Route-private components are in `_components/`.
4. The segment has an `error.tsx`.
5. `npm run verify` is green.
6. It has been driven in a browser at 1440×900, console clean, exactly one
   `<main>`, every control with an accessible name.

## Environment

Windows, PowerShell primary. Prefer cross-platform npm scripts over
shell-specific commands.
