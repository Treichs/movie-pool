# Handoff — what to build, in order

Read `CLAUDE.md` first. It has the two rules that replace this project's old
architecture, and they are not optional.

**Do these one at a time. Stop after each and report before starting the next.**
This is a deliberate pace, not caution — the developer is calibrating how long a
screen takes before committing to a strategy for the remaining 23.

The old repo is at `C:\Dev\Git\movie_pool_app`. It is **reference, not a base.**
Read from it freely. Do not copy its structure: it has five component tiers, a
nine-link governance chain and 1,400 lines of `tokens.css` that this rebuild
exists to be rid of.

---

## Task 1 — Install the starting components

```bash
npx shadcn@latest add button card input label field textarea select table badge \
  dialog sheet drawer dropdown-menu avatar separator skeleton spinner sonner \
  tooltip empty input-group item alert alert-dialog tabs --dry-run
```

Read what it reports, then run it again without `--dry-run`.

Then put the Toaster back in `src/app/layout.tsx` — it was removed while
`ui/sonner` did not exist:

```tsx
import { Toaster } from "@/components/ui/sonner";
// ...inside <body>, after {children}:
<Toaster />
```

**Done when** `npm run verify` is green.

---

## Task 2 — Port the data layer

From `C:\Dev\Git\movie_pool_app`:

- Copy `supabase/` whole — migrations and config, unchanged.
- Copy `src/lib/*.ts` — the typed composers.
- Move `src/infrastructure/schema/*` to `src/lib/supabase/`. Keep the bound
  `SupabaseClient` re-export and `asEnum`.
- Flatten `src/domain/` and `src/infrastructure/clients/` into `src/lib/`.
  **Do not recreate them as folders** — the boundary plugin that made the split
  meaningful is deleted.
- Copy `scripts/a11y/contrast.mjs` to `scripts/a11y/contrast.mjs`.
- Copy `scripts/governance/check-db-types.mjs` to `scripts/types-fresh.mjs`.
- Point both at `src/app/globals.css` instead of `src/styles/tokens.css`.
- Copy the type generator to `scripts/gen-types.mjs`.
- Nothing else from `scripts/`. No governance checks, no spikes.

Copy into `Docs/`:

- `Docs/reference/movie_pool_official_rules.md` → `Docs/movie_pool_official_rules.md`
- `Docs/design/ia-screen-map.md` → `Docs/ia-screen-map.md`
- `Docs/superpowers/plans/2026-08-23-frontend-rebuild-phase-6.md` → `Docs/rebuild-phase-6.md`

Then extend the gate in `package.json`:

```json
"a11y:contrast": "node scripts/a11y/contrast.mjs",
"types:fresh": "node scripts/types-fresh.mjs",
"types:gen": "node --env-file=.env.local scripts/gen-types.mjs",
"verify": "npm run typecheck && npm run lint && npm run a11y:contrast && npm run types:fresh && npm run build"
```

**Done when** `npm run verify` is green with all five checks, and a server
component can read a league and a season, typed, with no UI.

**Expect `a11y:contrast` to fail the first time.** `--radius` changed from `0`
to `0.25rem` and the palette moved into `globals.css`; if it reports a failing
pair, report it rather than adjusting a colour to make it pass. Those values
were contrast-validated and three of them are counterintuitive on purpose —
`CLAUDE.md` says which.

---

## Task 3 — The six route handlers

`Docs/ia-screen-map.md` has a **Route handlers (6)** section. Build all six.
They are unchanged from the old repo — copy them.

Also bring `vercel.json`'s cron schedule. The three `/api/cron/*` routes are
Vercel cron targets and authenticate with `CRON_SECRET`; without that variable
every scheduled run returns 401 **silently**, which is how the app stops sending
mail with nothing in the logs.

**Done when** all six exist, `vercel.json` has the schedule, and `CRON_SECRET`
is confirmed present in `.env.local`.

---

## Task 4 — The bid page

`/season/[seasonId]/weeks/[weekId]/bid`.

**Open its board on the design canvas before writing anything:**
<https://claude.ai/code/artifact/224e174f-ce5d-4490-8995-004408f7c4bf>

The task's mechanics are in `Docs/rebuild-phase-6.md`. Note that plan's own
warning: **band 1's board numbers run one behind its task numbers.** Bands 2–5
line up. Read each task's `Board:` line rather than assuming.

The old repo's version of this page is the reference for **behaviour** — the
blind-bid rules, the budget ceiling, the deadline — and not for structure.

Two things this screen must get right, both from the rulebook:

- The total of all open bids can never exceed the bankroll. The system blocks it.
- `$0` is not a legal bid and equals null. The per-season minimum is set by the
  commissioner and is never below `$1`.

**Before you build any part of the UI, search the registries.** The shadcn MCP
server is configured. `src/components/ui/` is what is *installed*, not what is
*available* — concluding "not there, so I'll compose it" from a directory
listing is the specific failure this rebuild is meant to end.

**Done when** the page renders from a `src/lib` composer that gates before it
reads, its writes are `'use server'` actions in the segment's `actions.ts`, the
segment has an `error.tsx`, `npm run verify` is green, and you have driven it in
a browser at 1440×900 with a clean console.

**Then stop.** Report what you built, which components came from a registry and
which you wrote by hand, and how long it took.
