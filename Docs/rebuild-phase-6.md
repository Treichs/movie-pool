---
status: working
mode: decision-log
owns: The Phase 6 frontend rebuild task sequence
supersedes: none
---

# Frontend Rebuild — Phase 6: The Screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild all 24 remaining screens of the Movie Pool app against the approved 25-route map and the published design canvas, in place, with every gate green on every commit.

**Architecture:** Screen-by-screen build in a clean repo. Each screen is one commit that adds `page.tsx`, its `_components/` and its `error.tsx`. Pages render from a `src/lib` composer that gates before it reads; writes are `'use server'` actions in the segment's own `actions.ts`, returning `ActionResult`. A component moves out of `_components/` the first time a second screen needs it.

**Tech Stack:** Next.js App Router · React Server Components · TypeScript · shadcn/ui on Base UI · Tailwind v4 · Supabase (Postgres + RLS) · Playwright MCP for the browser drive.

**Spec:** [Docs/superpowers/specs/2026-08-21-frontend-rebuild-design.md](../specs/2026-08-21-frontend-rebuild-design.md) — §10.1 (build order), §10.2 (the seven conditions), §11 Phase 6.

**IA:** [Docs/design/ia-screen-map.md](../../design/ia-screen-map.md) — 25 page routes plus **six** route handlers. The headline correction Task 0.1 owed has landed.

**Design canvas:** <https://claude.ai/code/artifact/224e174f-ce5d-4490-8995-004408f7c4bf> — 27 artboards. Every screen task below names the board it builds. **Open the board before writing the screen.** The board is the approved layout; this plan is the approved mechanics.

> ### ⚠ Band 1's board numbers are one behind its task numbers
>
> `/` became a landing page after the canvas was drawn, and every band 1 board shifted. **Bands 2 through 5 line up exactly; band 1 does not.** Read the `Board:` line on each task rather than assuming the numbers match.
>
> | Task | Screen | Board on the canvas |
> |---|---|---|
> | 1.1 | `/` | **0.1** `/ — landing` |
> | 1.2 | `/login` | **1.1** `/login — sign in (was /)` |
> | 1.3 | `/signup` | **1.2** `/signup` |
> | 1.4 | `/forgot-password` | **1.3** + **1.3b** (sent state) |
> | 1.5 | `/reset-password` | **1.4** `/reset-password` |
>
> Task 5.1 is the other non-1:1 case, and deliberately so: one route, two boards (**5.1a** player, **5.1b** commissioner).

**Predecessor:** [Plan 1 — Phases 0–5](2026-08-21-frontend-rebuild-phase-0-5.md) (18 tasks, complete). The bid page it built is this plan's template.
**Successor:** none. Plan 3's scope — `registry.json` publishing, `src/lib` retirement, the Vitest migration — is **cancelled** by the simplification below.

---

> ## Rewritten 2026-08-26 for the two-tier rebuild
>
> This plan was written against the five-tier architecture (`domain` / `orchestration` / `infrastructure` over `ui` / `primitive` / `layout` / `blocks`) and the nine-link governance chain. **Both are being deleted.** The route list, the boards, the interfaces and the reasoning in each task are unchanged and still correct; the file paths and gate conditions have been rewritten. What moved:
>
> | Was | Now | Why |
> |---|---|---|
> | `src/orchestration/read/<x>.ts` | `src/lib/<x>.ts` | The composer and the helper it was re-deriving are now the same file |
> | `src/orchestration/actions/<x>.ts` | `src/app/(member)/<segment>/actions.ts` | Colocated; `src/lib/actions/` only when a second route shares the write |
> | `@/infrastructure/schema` | `@/lib/supabase` | Same bound client, one fewer folder |
> | `primitive/` · `layout/` · `blocks/` | `src/components/` or the route's `_components/` | Two tiers: shared, or not yet shared |
> | `Panel` | `Card` | Panel's own justification no longer holds — see the radius note in Global Constraints |
> | nine-link `governance` | `a11y:contrast` + `types:fresh` | The only two checks guarding a rule that still exists |
> | Storybook · `test:stories` · `registry.json` | — | Dropped |
>
> **Three prep tasks are cancelled** and marked as such below: 0.4 (Panel elevation), 0.5 (stories for PENDING components), 0.7 (the cross-board manifest). Tasks 0.1, 0.2, 0.3 and 0.6 survive.
>
> **Three tasks said "port this logic, do not import it."** That instruction existed only to satisfy the boundaries DAG. All three are now "import it" — see Tasks 2.2, 3.1 and 4.3.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec and from `tokens.css`.

### The gate

**`npm run verify` is created by Task 0.1 and is the only gate command any later task names.** Until Task 0.1 lands, the gate is the seven commands it wraps. The spec's §10.2 condition 6 already names `npm run verify`; today no such script exists, which is why it is the first task rather than an assumption.

```
npm run verify   →  typecheck · lint · a11y:contrast · types:fresh · build
```

**The nine-link `npm run governance` chain is gone**, along with Storybook and `test:stories`. Two of its checks survive on their own merits and are folded into `verify` above: `a11y:contrast`, which measures WCAG AA on every ground the app paints, and `types:fresh`, the fingerprint that fails the build when a Supabase migration is pushed without regenerating types. Nothing else in the chain guards a rule that still exists.

### §10.2 — the seven conditions, in force for every screen task

1. The new `page.tsx` renders from a `src/lib` composer, with the authz gate preceding the fetch.
2. Its writes are `'use server'` actions in the segment's own `actions.ts`, returning `ActionResult`, using `revalidatePath`. A write two routes share moves to `src/lib/actions/`.
3. Route-private components live in `_components/`. **A component moves to `src/components/` the first time a second screen needs it — never in anticipation.** No story, no registry entry, no promotion ceremony: the cost of getting it wrong is one file move.
4. The segment has an `error.tsx`.
5. The old page and its now-unreferenced components are **deleted in the same commit**.
6. `npm run verify` is green.
7. **The screen has been driven in a browser at 1440×900** — desktop only (Ruling 78).

### Condition 7 — the drive, exactly

Use the **`ui-review` skill**. Do not invent a harness.

- Sign in as the role the screen is for, using `npm run seed:dev` fixtures (`dev-commish|dev-player|dev-outsider@moviepool.local`). Use `npm run mock:season` when the screen needs richer data.
- Exercise the screen's own behaviour. For a write surface, complete the write and confirm the result came back from the database, not that a banner appeared.
- Capture at **1440×900 only**. Mobile capture is suspended for Phase 6.
- **Console must be clean** — zero errors.
- **Check landmarks and labels by hand:** exactly one `<main>`, every control with an accessible name. This repo has **no rendered-page axe** (Ruling 74) — axe runs over stories only — so this bullet is manual by necessity.
- **Report what was NOT driven** — roles not signed in as, states with no fixture, branches not reachable.
- Clean up anything the drive wrote to the shared dev database.

**Ruling 78's reversal condition:** the moment a screen is built with a fixed width, a horizontal-scroll container that assumes desktop, or a `min-width` that would force a phone to pan, restore the 390×844 capture for that screen. The six layout primitives stay fluid; only the *review* is desktop-only.

### The route contract (25 addresses)

**No further IA change without a redirect.** This window closed when Task 0.1 published the corrected map. If a screen turns out to need a different address, stop and raise it — do not change it inside a screen task.

### Authoring rules — `npm run lint` is the gate

- **No raw palette classes.** `--color-*: initial` in `tokens.css` means `bg-blue-500` emits no CSS at all. It is not a lint rule; the class does not exist.
- **No hand-written native form elements** — `<input> <select> <textarea> <table> <details> <button>`. Use the vendored primitive.
- **No arbitrary Tailwind values** (disable-able with cause; the colour namespace is not).
- **Never pass `-y` to `shadcn add`.** Always `--dry-run` first.
- **ONE SHAPE, ONE FILE.** There is one `button`, one `table`, one `sheet`. When the app needs a different shape you **modify the primitive in place**. Wrapping is what produced two badges, two empty states and three buttons.
- **Sourcing runs in a strict order: EXISTS → INSTALL → BUILD.** Search the configured registries before writing UI; install what exists; build only what does not. The cross-board manifest and its INTAKE gate are dropped with Task 0.7 — the shadcn MCP server makes the search a question you ask rather than a document you maintain.
- **Search the registry before writing UI.** `src/components/ui/` is what is INSTALLED, not what is AVAILABLE. Invoke the **`shadcn` skill**; reaching a "not vendored, so I'll compose it" conclusion from an `ls` is the documented failure mode.

### The layer contract — two tiers, no plugin

The `domain` / `orchestration` / `infrastructure` split and the `eslint-plugin-boundaries` DAG that enforced it are **deleted**. What replaces them is short enough to remember:

- **Components:** `src/components/ui/` is shadcn and registry code, edited in place. Everything else starts in the route's `_components/` and moves to `src/components/` the first time a second route needs it.
- **Reads:** composers live in `src/lib/`. A page imports its composer directly. **The old rule forbidding a composer from importing `src/lib` is gone** — `src/lib` *is* where composers live now, so an existing helper is reused, not re-derived.
- **Writes:** `'use server'` actions colocate in the segment's `actions.ts`, moving to `src/lib/actions/` only when a second route needs the same write.
- **Authz still precedes the fetch.** This was the one rule the boundary plugin was genuinely buying, and deleting the plugin does not repeal it: every composer takes an authenticated context and gates before it reads. It is now a review point rather than a lint error.
- Import the Supabase client through **`@/lib/supabase`**, which re-exports `SupabaseClient` already bound to the generated schema. Narrow a form value to a database enum with `asEnum` from the same module.

### The design system

| Token | Value | Rule |
|---|---|---|
| `--background` (paper) | `#F5F4F3` | the ground |
| `--card` | `#FFFFFF` | panels |
| `--foreground` (ink) | `#000000` | 19.12:1 on paper |
| `--primary` (vermilion) | `#EB4B37` | **background only** — 3.42:1, fails as text. **One per surface.** |
| `--link` (cobalt) | `#14567A` | links, and the past tense |
| `--muted` / `--input` | `#EDECEA` | field ground |
| `--border` | `#DCDBD9` | |
| `--radius` | `0.25rem` | drives the whole scale: `rounded-lg` 4px, `rounded-2xl` 7.2px, `rounded-4xl` 10.4px. **Changed from `0` on 2026-08-26.** No component hardcodes a corner. |
| `--spacing-pitch` | `32px` | the perforation pitch |
| `--container-measure-page` | `72rem` | the page frame |

**Width is the hierarchy.** One family (Archivo, `wdth` 62–125 × `wght` 100–900). Display is `wdth 62`, h1 `64`, h2 `70`, body `100`, numerals `78`. A display line and a body line differ by 38 units of *width* before a single pixel of size. Use the `type-*` utilities paired with their `text-*` sizes — never one without the other.

**Elevation is two tiers** (settled 2026-08-23, Task 0.4): a panel sits **on** the page and carries a 1px `--border` and no shadow; only something that **overlaps content** — dropdown, popover, sheet, sticky action bar — carries `--shadow-raised`.

**Never hard-code the number of winning tiers.** It is `season_settings.top_n_distinct`, default 3, marked **[Configurable]** in the rulebook. The drawer hard-coded "3" while three other surfaces resolved it per season; do not add a fourth offender.

### Commit discipline

One screen, one commit. Message form: `feat(<surface>): <what the screen now does>` — or `refactor`/`fix` where that is honest. Every commit ends with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Branch: `frontend/rebuild-ground`. Do not merge to `main` inside this plan.

---

## File Structure

**Created per screen** (the shape every screen task follows):

```
src/app/(member)/<segment>/page.tsx          the route: gate → read → place. No className.
src/app/(member)/<segment>/error.tsx         the segment's own boundary, carrying <main>
src/app/(member)/<segment>/_components/*.tsx route-private pieces
src/lib/<screen>.ts                          the composer, if the screen needs a new one
src/app/(member)/<segment>/actions.ts        the write, if the screen has one
                                             (src/lib/actions/<entity>.ts only if a
                                             second route needs the same write)
```

**Deleted per screen:** the old `page.tsx`, and every component under `src/app/(member)/**/components/` (the un-underscored legacy folders) that no surviving screen imports.

**Shared work, created once, in the pre-screen tasks:**

```
package.json                                 npm run verify                    (Task 0.1)
Docs/design/ia-screen-map.md                 corrected to 25 routes            (Task 0.1)
src/components/ui/field.tsx                  the consolidated field shape      (Task 0.3)
src/components/ui/card.tsx   elevated prop deleted             (Task 0.4)
src/styles/tokens.css                        --shadow-raised retuned; --series-* real  (0.4, 0.6)
scripts/seed-dev.mts                         a week with a live bid deadline   (Task 0.2)
```

---

## Task Order

| # | Task | Blocks |
|---|---|---|
| **0.1** | `npm run verify`, and the corrected route map | everything |
| **0.2** | A fixture week with a live bid deadline | 3.1, 3.2, and any countdown |
| **0.3** | The field shape consolidation — seven files to one | every form screen (1.x, 4.x, 5.x) |
| ~~0.4~~ | ~~Elevation: delete `Panel.elevated`~~ | **CANCELLED** — Panel is deleted |
| ~~0.5~~ | ~~Stories for the ten `PENDING` components~~ | **CANCELLED** — no Storybook |
| **0.6** | `--series-1..10` real hues | 3.1 only |
| ~~0.7~~ | ~~The cross-board component manifest~~ | **CANCELLED** — the MCP server replaces it |
| **1.1–1.5** | Band 1 — landing and auth (5 screens) | |
| **2.1–2.4** | Band 2 — read-only (4 screens) | |
| **3.1–3.2** | Band 3 — season core (2 screens) | |
| **4.1–4.11** | Band 4 — league (11 screens) | |
| **5.1–5.2** | Band 5 — commissioner (2 screens) | |

**24 screen tasks, 4 unblockers.** `/season/[seasonId]/weeks/[weekId]/bid` was built by Plan 1 Task 18 and is the template, not a task.

A fifth prep task is added: **0.8 — carry the six route handlers across.** `/auth/callback` and `/auth/confirm` are the OAuth and token-hash exchanges; `/api/cron/notify` sends every deadline, settlement and season-end email; `/api/cron/tomatometer` polls RT scores; `/api/cron/automate` runs week automation; `/api/peep-head` serves avatar composition. **None of them is a screen, none appears in a screen task, and all six are load-bearing.** They move unchanged, with `vercel.json`'s cron schedule.

---

## Task 0.1: `npm run verify`, and the corrected route map

**Why first.** Spec §10.2 condition 6 says "`npm run verify` is green". No such script exists — the gate is seven commands. Twenty-four tasks are about to cite that condition, and a condition naming a mechanism nobody has is one nobody follows. This is the same defect class Ruling 74 caught in the same paragraph.

The second half is a documentation correction that cannot wait: `ia-screen-map.md`'s headline still reads "**28 routes become 23**" and its route list omits `/`, `/login` and `/league/[leagueId]/settings`. Twenty-four tasks are about to be built against it.

**Files:**
- Modify: `package.json` — add `verify`
- Modify: `Docs/design/ia-screen-map.md` — headline, §1 verdict tables, §6, new §7
- Modify: `.github/workflows/ci.yml` — collapse the gate steps to `npm run verify`

**Interfaces:**
- Produces: `npm run verify` — the single gate command every later task names.

- [ ] **Step 1: Confirm the script is genuinely absent**

```bash
node -e "console.log(Object.keys(require('./package.json').scripts).filter(k=>k==='verify'))"
```

Expected: `[]`. If it prints `verify`, someone added it since this plan was written — read it and reconcile rather than overwriting.

- [ ] **Step 2: Add the script**

In `package.json` scripts, after `verify:ui`:

```json
"verify": "npm run typecheck && npm run lint && npm run a11y:contrast && npm run types:fresh && npm run build",
```

Order is deliberate: cheap checks that fail most often go first, and the slow one — `build` — goes last. `a11y:contrast` sweeps `:root` and `.dark` against every ground the app paints; `types:fresh` fingerprints `supabase/migrations/` against the generated schema type, so a pushed migration without a regeneration is a red build rather than a wrong number.

**Prerequisite:** none. The browser drive of condition 7 needs Chromium — run `npx playwright install --with-deps chromium` once — but it is a review step, not part of the gate.

- [ ] **Step 3: Run it and read the whole output**

```bash
npm run verify
```

Expected: PASS, seven sections. **If `build` fails with every chunk 500ing, `npm run dev` is running** — stop it first. Both own `.next/`.

- [ ] **Step 4: Correct the IA map's headline**

In `Docs/design/ia-screen-map.md`, replace the line under `## The headline`:

```markdown
**28 routes become 25**, and there is no longer a commissioner **route tree** — but there are now two commissioner-only *pages*, which is a change from this document's first version and is explained in §7.
```

- [ ] **Step 5: Add §7, recording all three changes**

Append to `ia-screen-map.md` the section below. It is long on purpose: it is the record that stops these three being re-litigated.

```markdown
---

## 7. Three routes changed after this map was approved (2026-08-23)

Decided on the Phase 6 design canvas, after the developer reviewed the addresses rather than the layouts. **The map is 25, not 23.**

### 7.1 `/` becomes a landing page; sign-in moves to `/login`

This **reverses ADR-121**, and legitimately. ADR-121 deleted `/login` because it rendered the identical `SignInPanel` as `/` — a duplicate. Under this change it is not a duplicate: `/` is a different page. Signed-in behaviour is unchanged (`resolveLandingPath`).

**It costs a re-point sweep, not a redirect** — `/login` was never a live URL, so nothing is owed. Five things currently target `/` as the sign-in screen and must move, and the list is `src/app/page.tsx`'s own header comment:

| What | Where |
|---|---|
| `requireUser` | `src/lib/auth.ts:36` |
| Sign-out | `src/app/(auth)/actions.ts:192` |
| The proxy's signed-out bounce | `src/proxy.ts` |
| The OAuth error path | `src/app/auth/callback/route.ts` |
| The links on signup and forgot-password | `(auth)/signup/page.tsx`, `(auth)/forgot-password/page.tsx` |

`/how-it-works` survives, and the split is deliberate: the landing **sells**, how-it-works **explains**. `/home` links to `/how-it-works#faq`, so that anchor is load-bearing.

### 7.2 `/league/[leagueId]/settings` becomes a real route

This is the **second commissioner-only page**, which is exactly the condition §2 named as reopening "commissioner is a permission, not a place". Reopened deliberately; the answer holds, on a test worth keeping:

> **Configuration centralizes. Operations distribute.**

Configuration is changed rarely, applies broadly, and you go looking for it — it has no natural home on any one screen, so it needs an address. An operation acts on a specific object at a specific moment and is usually prompted; its home is next to the object, and giving it an address means having to remember to go there.

That test is also why §2.1's three-for-three against us does not transfer: what ESPN, Sleeper and Yahoo centralize is *configuration* — scoring rules, roster limits, playoff seeding.

The six commissioner powers split 4/2:

| Power | Kind | Home |
|---|---|---|
| Overdue-week queue | operational | strip on Season Home — **not a route** |
| Payouts draft / finalize | operational | `/season/[id]/payouts`, role-gated |
| Building a week's slate | operational | the week page |
| Starting a season | configuration, one-shot | `/league/[id]/season/new` |
| League identity + house rules | **configuration** | **`/league/[id]/settings`** |
| Member roles + invites | **configuration** | **`/league/[id]/settings`** |

A dialog is for a decision finished in ten seconds — not for renaming a league, changing the bankroll and promoting a co-commissioner.

### 7.3 `/films/[tmdbId]` keeps its route, and a defect was found proving it needs one

After ADR-407 retired `/releases`, the catalog route has no entry point that is not already inside a league. Five link sites exist; three carry `?league=` when a league is in scope, and two are bare despite both rendering inside league contexts:

| Site | Carries league? |
|---|---|
| `league/components/hall-of-records.tsx:152` | yes |
| `season/[seasonId]/page.tsx:521` | yes |
| `blocks/overlay/reveal-sheet.tsx:152` | yes |
| `season/[seasonId]/weeks/[weekId]/components/release-browser.tsx:471` | **no** |
| `blocks/detail/film-drawer.tsx:108` | **no** |

**The defect:** `film-drawer.tsx:108`'s link text reads *"Full details, trailer & pool history →"* and points at the bare catalog route — a page ADR-408 defines as carrying **no pool history**. It promises exactly what the destination cannot show. No gate can see this, and a browser drive would not catch it either, because the page renders correctly.

The route survives because a film page you can send to someone outside your league is real, and because it is the landing target for §7.4's redirect. Both bare links gain league scope in Tasks 2.2 and 3.2.

### 7.4 The foreign-league path, decided

§3 left this owed. **Decided: redirect to the catalog view with a notice, not a 404.** The film exists and is readable; only the league record is out of reach, and a 404 would claim otherwise.
```

- [ ] **Step 6: Update §6, "What Phase 6 inherits"**

Replace its first bullet:

```markdown
- **25 screens** across 25 addresses, in the build order given by the rebuild spec §10.1: landing and auth → read-only → season core → league → commissioner surfaces. 24 are rebuilt by Plan 2; the bid page was built by Plan 1 Task 18.
```

Replace its "Two designs owed" bullet:

```markdown
- **Both owed designs are settled** and drawn on the canvas: the merged role-gated payouts page (boards 5.1a/5.1b) and the league-scoped film page's not-found path (§7.4, board 2.3).
```

- [ ] **Step 7: Collapse CI to the one command**

`.github/workflows/ci.yml` has **one job**, `lint-and-build`, whose steps are Lint → Governance → Typecheck → Unit → Playwright install → Story tests → Registry → Build. Replace the seven gate steps with one, keeping the Playwright install (the script cannot install its own browser) and any step that is not part of `verify`:

```yaml
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium

      - name: Verify
        run: npm run verify
```

**Read the whole file before editing it.** If a step does something `verify` does not — a deploy, an artifact upload, an env check — it stays.

- [ ] **Step 8: Run the gate**

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json .github/workflows/ci.yml Docs/design/ia-screen-map.md
git commit -m "chore(gate): npm run verify exists, and the IA map says 25"
```

Full message body:

```
Spec 10.2 condition 6 has named `npm run verify` since it was written; no
such script existed. Twenty-four screen tasks were about to cite it.

The map's headline still read '28 routes become 23' five route decisions
later. Section 7 records all three changes and the test that settled the
commissioner question.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

## Task 0.2: A fixture week with a live bid deadline

**Why.** The countdown has **never rendered**. No fixture week carries `bid_deadline`, so vermilion-on-the-clock, the final-hour threshold and the XL numeral's real home are untested — on the one component the design system reserves its accent for. Two screens (3.1, 3.2) and the already-built bid page all show it, and none can be driven honestly until a fixture has one.

`npm run mock:season` has an open week, but it is bound to the developer's own account, so it cannot be driven as `dev-player`.

**Files:**
- Modify: `scripts/seed-dev.mts`

**Interfaces:**
- Produces: a seeded season whose open week has `bid_deadline` set ~3 hours ahead, reachable by `dev-player@moviepool.local`.

- [ ] **Step 1: Find where the open week is seeded**

```bash
grep -n "bid_deadline\|week_of\|status" scripts/seed-dev.mts
```

- [ ] **Step 2: Set a deadline three hours out, computed at seed time**

A fixed timestamp is in the past the next day and the week stops being biddable.

```ts
// THREE HOURS, not one and not a day. The bid page's final-hour threshold
// flips the countdown to vermilion inside 60 minutes, so a 3h seed exercises
// the ordinary state and leaves room to test the threshold by editing the row.
const bidDeadline = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
```

Pass it wherever the open week row is created.

- [ ] **Step 3: Re-seed**

```bash
npm run seed:dev
```

Expected: no error, and the summary names the open week.

- [ ] **Step 4: Verify in the database, not in the script's output**

```bash
npm run spike:phase5
```

Expected: PASS. Then confirm the row directly — a seed script that prints success and writes nothing is the failure this step exists to catch:

```bash
node --env-file=.env.local -e "const {createClient}=require('@supabase/supabase-js');const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);c.from('weeks').select('number,status,bid_deadline').eq('status','open').then(r=>console.log(r.data));"
```

Expected: at least one row with a non-null `bid_deadline` in the future.

- [ ] **Step 5: Drive the bid page and confirm the countdown renders**

Start the dev server, sign in as `dev-player@moviepool.local`, open the open week's `/bid`, and confirm with the `ui-review` skill that the countdown shows a ticking figure rather than nothing. **This is the first time this component has ever been seen.** Note anything wrong and fix it in this task.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-dev.mts
git commit -m "fix(fixtures): the open week gets a bid deadline, so the countdown can render"
```

---

## Task 0.3: The field shape consolidation — seven files to one

**Why.** ~~The field shape lives in **seven files**.~~ **CORRECTED 2026-08-23 during execution: it lives in ONE.** `src/components/ui/field.tsx` is the only file that defines it, byte-identical to upstream, and the other 20 files that mention `FieldLabel` are consumers. The "seven files" figure came from a session digest that nobody re-derived, and the census in Step 1 is what caught it. The task's INTENT still held and was served: two files were hand-rolling the shape instead of importing it (`announcement-form.tsx`, `confirm-picks.tsx`) and were re-pointed. Every form screen in Bands 1, 4 and 5 lands on it, so consolidating after them means seven divergent shapes have been copied into a dozen screens. ONE SHAPE, ONE FILE applied before the copies exist rather than after.

**Files:**
- Modify: `src/components/ui/field.tsx` — the surviving shape
- Delete: the six emulations found in Step 1
- Modify: their call sites

- [ ] **Step 1: Find the seven**

```bash
git grep -ln "FieldLabel\|FieldError\|field-label" -- 'src/*.tsx' | sort
```

Record the list in the commit message. Do not guess which survives: `src/components/ui/field.tsx` is the registered shape and the others are the emulations, by definition of the rule.

- [ ] **Step 2: Diff each emulation against the registered shape**

For each file from Step 1 that is not `ui/field.tsx`, list what it does that `field.tsx` does not. Those differences become **variants or props on `field.tsx`**, never a second file.

- [ ] **Step 3: Check the registry before adding anything**

```bash
npx shadcn@latest add field --dry-run
```

If upstream `field` already carries the variant an emulation was hand-rolling, take upstream's. **Never pass `-y`.**

- [ ] **Step 4: Modify `field.tsx` in place to absorb the differences**

Add the props the emulations needed. Keep the existing anatomy — `Field`, `FieldLabel`, `FieldError` — and their `data-slot` attributes.

- [ ] **Step 5: Re-point every call site, then delete the emulations**

```bash
git rm <each emulation>
```

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

Expected: PASS. A failure here is most likely `typecheck` — a call site still passing a prop the consolidated field shape no longer takes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(ui): the field shape was in seven files; now it is in one"
```

---

## ~~Task 0.4: Elevation — delete `Panel.elevated`, retune the shadow~~ — CANCELLED

> **Cancelled 2026-08-26.** `Panel` itself is deleted; `Card` is the container. Its elevation decision was already applied at source in `ui/card.tsx`. Retune `--shadow-raised` only if a surface still needs it after the radius change. The reasoning below is kept because it explains why panels carry a border rather than a shadow.

**Why.** `tokens.css` quotes the design system's rule verbatim: **"No shadows, gradients or radius."** Radius is enforced by `--radius: 0`. The gradient was deleted on 2026-08-22. Shadows were never enforced — `--shadow-raised` is live at **42 sites across 33 files**, and `Panel` defaults `elevated` to `true`, so all 20 `Panel` call sites paint one. Exactly one opts out.

The values are worse than merely present: `rgb(0 0 0 / 0.45)` and `rgb(0 0 0 / 0.35)` were tuned against the retired near-black ground and now sit on paper at `#F5F4F3`. The token's own comment concedes it — *"the redesign's token pass owns the final value"* — and that pass is this phase.

**Decision A, 2026-08-23:** a panel sits **on** the page and carries no shadow; only something that **overlaps content** carries one, retuned. All 33 files are ones Phase 6 rewrites, so the cost is near zero now and rises with every screen that keeps it.

**Files:**
- Modify: `src/components/ui/card.tsx` — delete the `elevated` prop
- Modify: `src/styles/tokens.css` — retune `--shadow-raised` in both modes
- Modify: the ~35 non-floating `shadow-raised` call sites

- [ ] **Step 1: Enumerate, and split the list by kind**

```bash
git grep -n "shadow-raised" -- 'src/*.tsx'
```

Classify each site: **floating** (it overlaps page content — dropdown, popover, sheet, drawer, dialog, sticky bar) or **on-page** (everything else). Only floating sites keep the class.

- [ ] **Step 2: Retune the token in both modes**

G3-5 requires every `:root` custom property to be declared in `.dark` and vice versa. In `:root`:

```css
    /* RETUNED FOR PAPER (2026-08-23). The old value — .45 and .35 black — was
       carried unchanged from the retired near-black palette, which its own
       comment conceded. On #F5F4F3 it read as a smudge rather than a lift.
       ONLY FLOATING LAYERS MAY USE IT. A panel sits ON the page and carries a
       1px --border plus the 1.10:1 paper-to-card step; elevation by value is
       why that step is asymmetric between modes in the first place. */
    --shadow-raised: 0 1px 2px -1px rgb(0 0 0 / 0.12), 0 8px 24px -8px rgb(0 0 0 / 0.18);
```

In `.dark`, heavier — value discrimination is lower at low luminance:

```css
    --shadow-raised: 0 1px 2px -1px rgb(0 0 0 / 0.5), 0 8px 24px -8px rgb(0 0 0 / 0.45);
```

- [ ] **Step 3: Delete the `elevated` prop**

In `panel.tsx`, remove `elevated` from the signature, the destructure and the `cn()` call. The class list loses `elevated && "shadow-raised"`.

- [ ] **Step 4: Remove the class from every on-page site**

Including `season-table.tsx`'s now-meaningless `elevated={false}`.

- [ ] **Step 5: Verify the count moved, and that floating sites survived**

```bash
git grep -n "shadow-raised" -- 'src/*.tsx'
```

Expected: only the floating files from Step 1 remain. If a dialog or sheet lost its shadow, that is a regression — restore it.

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

Expected: PASS. `a11y:contrast` is unaffected — a shadow carries no text.

- [ ] **Step 7: Drive one panel-heavy page and one floating layer**

Sign in as `dev-player`, open the season page (panels) and open any dropdown (floating). Confirm panels read as surfaces without the shadow, and that the dropdown still reads as above the page.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(design): elevation is two tiers, and panels leave the shadow behind"
```

---

## ~~Task 0.5: Stories for the ten `PENDING` components~~ — CANCELLED

> **Cancelled 2026-08-26.** Storybook is dropped, so there are no stories and no `PENDING` list. The ten components named below are still the ones bands 1, 4 and 5 need — read the list as an install checklist, not a story backlog.

**Why.** Ten vendored components have no story: `button-group`, `command`, `drawer`, `field`, `input-group`, `item`, `select`, `slider`, `sonner`, `switch`. Condition 3 requires a story for anything a second screen uses, and Bands 1, 4 and 5 will use most of these. They were deliberately left on `PENDING` rather than landed with a suppression — this is the task that clears the list.

A story is also how a component gets run through **axe**, which is the only axe this repo has (Ruling 74).

**Files:**
- Create: `src/components/ui/<name>.stories.tsx` × 10
- Modify: whichever file holds the `PENDING` list

- [ ] **Step 1: Find the pending list and confirm the ten**

```bash
git grep -rn "PENDING" -- 'scripts/governance/*.mjs' 'src/*.ts'
```

- [ ] **Step 2: Read the Storybook conventions before writing one**

Call the Storybook MCP `get-storybook-story-instructions`. It is the source of truth for imports, CSF Factory shape and test conventions. Do not infer the pattern from an existing story file.

- [ ] **Step 3: Write a story per component, one at a time**

Follow the pattern the MCP returned. Every story needs a `Default`. Add a `Dark` export **only** where the component carries colour — the `theme-sensitive` tag defaults on for `blocks/`, and these are `ui/`.

Do not invent props. Call `get-documentation` for the component and use only what it documents. **If a prop is not documented, it does not exist** — report it rather than guessing.

- [ ] **Step 4: Run the story tests after each one**

```bash
npm run test:stories
```

Expected: PASS, including axe. **Expect failures.** `button.stories` found a WCAG failure the moment it was written; assume these will too. Fix the component, not the story.

- [ ] **Step 5: Remove each name from `PENDING` as its story lands**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(ui): the last ten components get stories, and axe gets to see them"
```

---

## Task 0.6: `--series-1..10` real hues

**Why.** Ten chart hues in `tokens.css` are flagged **PROVISIONAL — NOT from the sheet**: ten evenly spaced hues at the cluster family's character (S 45%, L 62%), generated because the Sprocket sheet supplies three cluster hues and the bump chart needs ten. Their own comment says they "need a design decision when the bump chart is rebuilt in Phase 6." Task 3.1 rebuilds it.

**Blocks Task 3.1 only.** It can run any time before it.

**Files:**
- Modify: `src/styles/tokens.css` — `--series-1` … `--series-10`, both modes

- [ ] **Step 1: Read the current values and the constraint they must keep**

```bash
grep -n -A 14 "PROVISIONAL" src/styles/tokens.css
```

The constraint stated there: **all carry ink text at 5.5:1 or better.** Whatever replaces them must hold that, because a bump chart labels its lines.

- [ ] **Step 2: Derive ten hues from the sheet's three cluster hues**

Keep the cluster family's character rather than inventing a tenth colour system. Space the ten around the wheel anchored on the three real cluster hues, so three of the ten are the sheet's own values and seven are interpolations between them.

- [ ] **Step 3: Measure, do not assert**

```bash
npm run a11y:contrast
```

Expected: PASS, zero text-pair failures in both modes. If a hue fails, adjust lightness before hue — the family's character is the hue.

- [ ] **Step 4: Replace the PROVISIONAL comment with what was actually done**

It must stop saying "needs a design decision" and start saying which three came from the sheet and how the other seven were derived.

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

Expected: PASS. CFG+G3 checks that both modes declare the same slot set — all ten must exist in `:root` and `.dark`.

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat(tokens): the ten series hues stop being provisional"
```

---

## ~~Task 0.7: The cross-board component manifest~~ — CANCELLED

> **Cancelled 2026-08-26.** The manifest existed to make "we searched the registry" reviewable. The shadcn MCP server makes the search a question you ask mid-build, so the document has no reader. The EXISTS → INSTALL → BUILD ordering survives as an authoring rule; the INTAKE gate and the manifest do not.

**Why this is the last thing before Band 1.** The rule "search the registry before you build" exists in three places and was still not followed on 2026-08-14, when a button was hand-positioned over an input while `input-group` was one command away. The rule was never missing — the **step** was. This task produces the artifact that makes the rule checkable: one table, one row per component, with a source decision and the evidence for it.

**Why across all boards at once rather than per screen.** The spec's promotion rule is *"promotion on second use."* Per screen, the second use is something you discover by accident after writing the component twice. Across boards, the `Boards` column tells you in advance — so a component with four consumers is built once, in the right tier, the first time. This is the same arithmetic that promoted `Eyebrow` at eighty sites and `PageHeader` before its second consumer existed.

**Read first:** [Docs/design/design-to-build.md](../../design/design-to-build.md) — this task is its stages 4 and 5.

**Files:**
- Create: `Docs/design/component-manifest.md`
- Modify: `src/components/ui/**` — whatever the INSTALL rows bring in
- Modify: `registry.json` — entries for anything vendored that lands in `blocks/` or `layout/`

**Interfaces:**
- Produces: `Docs/design/component-manifest.md` — consumed by all 24 screen tasks. Every screen task checks its board's components against it before writing anything.

- [ ] **Step 1: Inventory every board**

Open all 27 artboards on the canvas. For each, list every distinct component it needs — not every element, every *component*: a thing with a shape that would live in `ui/`, `primitive/`, `layout/` or `blocks/`.

Write them into `Docs/design/component-manifest.md` with the `Boards` column filled in. Do not decide sources yet. Getting the inventory complete first is what makes the dedup meaningful.

- [ ] **Step 2: Mark what already exists**

```bash
git grep -l "export function <Name>" -- 'src/components/**/*.tsx'
npx shadcn@latest search @moviepool -q "<thing>"
```

Fill the `Source decision` column with **EXISTS** and the path. Expect this to be the largest group — 42 vendored primitives, six layout components, and the blocks Phase 5 built.

- [ ] **Step 3: Search the registry for everything left, and search it properly**

```bash
npx shadcn@latest search @shadcn -q "<thing>"
npx shadcn@latest view @shadcn/<name>
```

**Search by shape, not by domain.** There is no `stat-tile` in the registry, but there is `item`; no `slate`, but there is `card` and `carousel`. Record every term you tried in the `Evidence` column — "we searched" and "we searched for the word we already had in mind" are different claims, and only one of them is evidence.

- [ ] **Step 4: Dry-run every candidate before deciding**

```bash
npx shadcn@latest add <name> --dry-run
```

**Never pass `-y`.** Read what it would touch. A candidate that would overwrite a modified primitive is not an INSTALL — it is a MODIFY decision on the file we already have, and the row says so.

- [ ] **Step 5: Install what fits, through the intake lane it belongs to**

Per [spec §7](../specs/2026-08-21-frontend-rebuild-design.md): Lane 1 for a registry item, Lane 2 for a copy-paste snippet, Lane 3 for an npm utility. Every Lane 1 install still owes: read every added file, fix hardcoded `@/components/ui/...` imports, swap the icon library to lucide, write a story, add a registry entry if it lands in `blocks/` or `layout/`.

Run the shadcn MCP's `get_audit_checklist` and follow it — it is maintained upstream, which is why it is the checklist this lane uses rather than a hand-written one.

**Commit each install separately.** One component per commit, with its story and its `PENDING` removal, per `registry-pattern.md` §8.

- [ ] **Step 6: Everything remaining is BUILD, and each row must justify it**

A BUILD row is legitimate and will be common — most domain-shaped things in this app are one. A BUILD row with an empty `Evidence` cell is not a decision, it is a skipped one. Every BUILD row carries the search terms that came back empty.

Do **not** build them in this task. This task decides sources; the screen tasks build. The exception is a component wanted by four or more boards — build those here, so four screens do not each invent it.

- [ ] **Step 7: Run the gate**

```bash
npm run verify
```

Expected: PASS. Anything installed brings a story with it, so `test:stories` grows.

- [ ] **Step 8: Report the shape of the answer**

In the commit message, state four numbers: how many distinct components the 27 boards need, and how they split across EXISTS / INSTALL+INTAKE / BUILD. If the INSTALL count is zero, say so plainly — that is either a real finding about the registry's fit for this app, or a sign the search was too narrow, and the next reader needs to know which you think it is.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(design): the component manifest — what 27 boards need, and where each piece comes from"
```

---

# Band 1 — Landing and auth

**Why first (§10.1):** the registry ships `login-01..05` and `signup-05`, so the canonical composition is near-free, and it exercises forms before anything else does.

**Conditions 1 and 2 do not apply as written to Band 1.** These pages are public: there is no member to gate and no `src/lib` composer to call. The auth writes already live in `src/app/(auth)/actions.ts` and stay there for this band — moving them to a colocated `actions.ts` is Plan 3's re-filing job, and a Band 1 task that moved them would be doing Phase 8's work under a screen's diff. What *does* apply: conditions 3, 4, 5, 6 and 7, in full.

---

## Task 1.1: `/` — the landing page (NEW ROUTE)

**Board:** `0.1  /  — landing`

**Why it exists.** Decided 2026-08-23 (IA map §7.1). `/` was a two-audience Mode — sign-in when signed out, `resolveLandingPath` redirect when signed in. It becomes a marketing landing page, and sign-in moves to `/login`. **This is the task that performs the re-point sweep**, so Task 1.2 has somewhere to land.

**Files:**
- Modify: `src/app/page.tsx` — becomes the landing page
- Create: `src/app/_components/landing-hero.tsx`, `landing-beats.tsx`, `landing-close.tsx`
- Create: `src/app/error.tsx` if the root segment has none
- Modify: `src/lib/auth.ts:36`, `src/app/(auth)/actions.ts:192`, `src/proxy.ts`, `src/app/auth/callback/route.ts`, `(auth)/signup/page.tsx`, `(auth)/forgot-password/page.tsx`

**Interfaces:**
- Produces: `/login` as the sign-in address. Task 1.2 creates the page; this task creates every reference to it.

- [ ] **Step 1: Open the board**

Read board `0.1` on the canvas. Note what it does **not** do: it carries four beats, not five, and it does not repeat the worked example. That belongs to `/how-it-works`, and duplicating it here creates two places to maintain the rules.

- [ ] **Step 2: Find every reference to `/` as the sign-in screen**

```bash
git grep -n 'redirect("/")' -- 'src/*.ts' 'src/*.tsx'
git grep -n 'href="/"' -- 'src/app/(auth)/*.tsx'
git grep -n '"/"' -- src/proxy.ts src/app/auth/callback/route.ts
```

Expect at least the five in IA map §7.1. **If you find a sixth, add it to §7.1's table** — the list came from a code comment, and a comment can be stale.

- [ ] **Step 3: Re-point them all to `/login`**

Every hit from Step 2. `requireUser` is the important one: it is what bounces an unauthenticated request, and leaving it pointed at `/` sends people to a marketing page instead of a sign-in form.

- [ ] **Step 4: Rewrite `src/app/page.tsx` as the landing page**

Keep the signed-in redirect — a member does not need the pitch:

```tsx
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (user) redirect(safeNextPath(next) ?? (await resolveLandingPath(supabase, user.id)));
```

Then render the landing. The route places; it does not style — every piece of type or colour lives in a `_components/` file that can be looked at on its own. **The page must render `<main>`**: `(member)/layout.tsx` does not, and neither does the root layout.

- [ ] **Step 5: Add `error.tsx` for the root segment if absent**

Copy the shape from the bid page's boundary: `"use client"`, it renders its own `<main>`, and it names what is safe. For the landing page nothing is at risk, so the copy is simply that the page failed to load.

- [ ] **Step 6: Delete what no longer has an owner**

`SignInPanel` moves to Task 1.2 — do not delete it here. Delete only what the old root page used and the landing does not.

- [ ] **Step 7: Run the gate**

```bash
npm run verify
```

Expected: PASS. A `check-legacy` failure means `src/lib` grew; the landing page needs no composer, so it should not have.

- [ ] **Step 8: Drive it — signed out and signed in**

Both audiences, because this route has two. Signed out: the landing renders, the "I have an invite" and "Create account" actions go where they claim. Signed in: you are redirected and never see it. Console clean, one `<main>`, every control named.

**Note in the report:** `/login` does not exist yet, so the "Sign in" link 404s until Task 1.2. That is expected and is the one acceptable broken link in this plan.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(landing): the root becomes a landing page, and sign-in moves to /login"
```

---

## Task 1.2: `/login` — sign in

**Board:** `1.1  /login — sign in  (was /)`

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/error.tsx`
- Modify: `src/app/(auth)/components/sign-in-panel.tsx` — rebuilt to the board
- Modify: `src/app/(auth)/components/login-form.tsx`, `google-sign-in.tsx`

- [ ] **Step 1: Open the board and search the registry first**

Read board `1.1`. Then, **before writing any composition**:

```bash
npx shadcn@latest search @shadcn -q "login"
npx shadcn@latest add login-02 --dry-run
```

The board is a two-column split — form left, ink field right — which is `login-02`'s shape. Take upstream's composition and re-skin it rather than hand-building the split. **Never pass `-y`.**

- [ ] **Step 2: Move the route**

Create `(auth)/login/page.tsx` rendering `SignInPanel`. It reads the same `searchParams` the root did (`error`, `next`).

- [ ] **Step 3: Rebuild `sign-in-panel.tsx` to the board**

The right half is the ink field: perforated both edges, `TMP` in paper, wordmark in vermilion beneath, and the scoring rule as its one line of copy. The perforation geometry is the mark's own — `26×34` at `rx 7`, pitch `75.3` in the mark's viewBox — do not invent a different rhythm.

The left half is the form. `AUTH_ERRORS` survives unchanged; it is a real behaviour, not styling.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Delete the old root's sign-in path**

The root no longer renders `SignInPanel`. Confirm nothing else imports it:

```bash
git grep -n "SignInPanel"
```

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it**

Sign in as `dev-player@moviepool.local` and **complete the sign-in** — confirm you land on the season, not that a spinner appeared. Then sign out and confirm you land on `/login`, not `/`. Then hit `/login?error=oauth` and confirm the alert renders and is announced.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): sign-in gets its own address at /login"
```

---

## Task 1.3: `/signup`

**Board:** `1.2  /signup`

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx`, `signup-form.tsx`
- Create: `src/app/(auth)/signup/error.tsx`

- [ ] **Step 1: Open the board, then check the registry**

```bash
npx shadcn@latest add signup-05 --dry-run
```

- [ ] **Step 2: Rebuild the page to the board**

Same split as `/login`, but the right half carries **the game in three beats** rather than the scoring rule — this is the one place a new player is told what they have joined, and it is onboarding, not decoration.

Fields are unchanged: `display_name` (placeholder *"What the standings will call you"*), `email`, `password`. The password hint is real copy, not filler.

- [ ] **Step 3: Keep the confirmation state**

`signup-form.tsx` already renders an `Alert role="status"` on success. It must survive: it is the only thing that tells someone to go and check their email.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive it**

**Complete a real signup** with a throwaway address and confirm the row exists in the database, not that the banner appeared. Then delete the row you created — condition 7's cleanup bullet.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): signup is rebuilt, and its right half explains the game"
```

---

## Task 1.4: `/forgot-password`

**Board:** `1.3  /forgot-password` and `1.3b  /forgot-password — sent`

**Files:**
- Modify: `src/app/(auth)/forgot-password/page.tsx`, `forgot-password-form.tsx`
- Create: `src/app/(auth)/forgot-password/error.tsx`

**Two boards, one route.** The sent state is a real state, not a toast.

- [ ] **Step 1: Open both boards**

Note the treatment difference from Band 1's front door: this route gets a **96px ink rail**, not the half-page field. It is an interruption reached from an email, not a place you arrive.

- [ ] **Step 2: Rebuild the form state to board 1.3**

- [ ] **Step 3: Build the sent state to board 1.3b**

The confirmation carries **ink, not green** — `--success` *is* `#000000` in this palette, and reaching for a green would be inventing a colour the system deleted. It also names the address it sent to and says the link expires in one hour.

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

## Task 1.5: `/reset-password`

**Board:** `1.4  /reset-password`

**Files:**
- Modify: `src/app/(auth)/reset-password/page.tsx`, `reset-password-form.tsx`
- Create: `src/app/(auth)/reset-password/error.tsx`

- [ ] **Step 1: Open the board**

The strength meter is **ink steps, not a red-amber-green ramp** — `--destructive` is `#000000` here, so a traffic-light meter would be inventing three colours the palette does not have. Four bars, filled in ink, with a word.

- [ ] **Step 2: Rebuild to the board**

Two fields — `password`, `confirm` — with the confirm field showing a check when they match.

- [ ] **Step 3: Add `error.tsx`**

This one's copy matters: a reset link is single-use, so a failure here needs to say whether the link is spent. If the boundary cannot tell, say what to do (request a new link) rather than guessing.

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it end to end**

Request a reset for a seeded account, **open the real link from the real email**, set a new password, and confirm you can sign in with it. Then set it back to the fixture password in `scripts/seed-dev.mts` so the fixtures still work for every later task. **This step is why this task is last in the band** — it changes a fixture credential and must be put back.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(auth): reset-password is rebuilt, with an ink strength meter"
```

---

# Band 2 — Read-only

**Why here (§10.1):** low branching. It proves the read path at low risk before the high-traffic core.

---

## Task 2.1: `/how-it-works`

**Board:** `2.1  /how-it-works`

**Public route.** No gate, no composer. `/home` links to `#faq`, so **that anchor is load-bearing** and must survive.

**Files:**
- Modify: `src/app/how-it-works/page.tsx`
- Create: `src/app/how-it-works/_components/*.tsx`, `error.tsx`

- [ ] **Step 1: Open the board, and read the rulebook**

Read [Docs/reference/movie_pool_official_rules.md](../../reference/movie_pool_official_rules.md). **This page is the rulebook's public face and must not contradict it.** If the board and the rulebook disagree, the rulebook wins and the board is wrong.

- [ ] **Step 2: Rebuild to the board**

Hero, the five beats, "the rules worth knowing", and the worked example. The worked example does the arithmetic in real numbers **including the tie that produces four owners from three tiers** — that is the rule people get wrong, and showing it beats stating it.

- [ ] **Step 3: Do not hard-code the tier count in prose**

The rulebook marks it **[Configurable]** and the drawer already got this wrong once. This page is public and has no season in scope, so it may say "three" **only** where it is explicitly describing the default. Word it as the default, not as the rule.

- [ ] **Step 4: Keep the `#faq` anchor**

```bash
git grep -n "how-it-works#faq"
```

Whatever id that resolves to must still exist.

- [ ] **Step 5: Add `error.tsx`**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it, signed out**

This page is public — drive it in a session with no cookie, not just as a member. Confirm the signed-out chrome renders and `/home` is not linked. Then follow `/how-it-works#faq` from `/home` as a member and confirm it scrolls.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(public): how-it-works is rebuilt, and the worked example shows the tie"
```

---

## Task 2.2: `/films/[tmdbId]` — the catalog view

**Board:** `2.2  /films/[tmdbId] — catalog`

**This task also fixes the defect IA map §7.3 records.**

**Files:**
- Modify: `src/app/(member)/films/[tmdbId]/page.tsx`, `loading.tsx`
- Create: `src/app/(member)/films/[tmdbId]/_components/*.tsx`, `error.tsx`
- Create: `src/lib/film-catalog.ts`
- Modify: `src/components/film-drawer.tsx:108`

**Interfaces:**
- Produces: `getFilmCatalogPage(ctx, tmdbId) -> FilmCatalogPage | null` in `lib/film-catalog.ts`. Carries TMDB metadata, OMDb ratings, cast and the trailer key. **It carries no bids, no owners and no scores** — that is ADR-408, and a later task adding them here is the mistake this composer's name exists to prevent.

- [ ] **Step 1: Open the board**

Note what the board does that the current page does not: it says, where the league data would be, that you are looking at the catalog and offers a league to switch to.

- [ ] **Step 2: Write the composer**

Take what `src/lib/film-page.ts` returns, minus anything league-scoped. **Import it — do not re-derive it.** The DAG that refused this is deleted; `film-page.ts` already holds the working queries and is now a peer of the composer, not a forbidden layer.

- [ ] **Step 3: Rebuild the page**

Backdrop with the `--scrim` gradient, poster, title, ratings stack with Tomatometer leading (it is half the scoring formula), trailer, cast, facts, and the TMDB/OMDb attribution — which is a licence obligation, not a courtesy.

- [ ] **Step 4: Fix the film-drawer defect**

`blocks/detail/film-drawer.tsx:108` links to the bare route with the text *"Full details, trailer & pool history →"*. The catalog page has no pool history. Two changes:

1. The drawer takes a `leagueId` prop and links to `/league/${leagueId}/films/${tmdbId}` when it has one.
2. When it has none, the link text drops "pool history" — it must not promise what the destination cannot show.

`film-drawer` is used by `season/[seasonId]/page.tsx`, `bid/_components/bid-form.tsx`, `poster-card.tsx`, `poster-stack.tsx` and `removed-film-card.tsx`. All five are league contexts, so all five pass the prop.

- [ ] **Step 5: Add `error.tsx`**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it**

Open a real film from the catalog. Confirm the poster and backdrop load from TMDB, the Tomatometer shows, and the attribution renders. Then open the drawer from the bid page and confirm its link now carries the league.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(films): the catalog page is rebuilt, and a link stops promising pool history it cannot show"
```

---

## Task 2.3: `/league/[leagueId]/films/[tmdbId]` (NEW ROUTE)

**Board:** `2.3  /league/[id]/films/[tmdbId] — NEW route`

**Why it exists.** ADR-408 says the film page shows **one scope** — the context league's own record — because commissioner-entered box office and Tomatometer values make play data league-local. The principle is untouched; the carrier changes from `?league=` to a path segment, which makes the league view bookmarkable and lets the trail name which league you are looking from.

**Files:**
- Create: `src/app/(member)/league/[leagueId]/films/[tmdbId]/page.tsx`, `error.tsx`, `_components/*.tsx`
- Create: `src/lib/film-league-record.ts`
- Modify: `hall-of-records.tsx:152`, `season/[seasonId]/page.tsx:521`, `reveal-sheet.tsx:152` — `?league=` becomes the path

**Interfaces:**
- Consumes: `getFilmCatalogPage` from Task 2.2, for the "About the film" section.
- Produces: `getFilmLeagueRecord(ctx, leagueId, tmdbId) -> FilmLeagueRecord | null`. Carries the score, its two inputs, the week it was on, and the owners with their bids.

- [ ] **Step 1: Open the board**

The **league record leads** and the TMDB material is demoted below it. That ordering is ADR-408 expressed as layout, and inverting it makes the page a catalog page with a table bolted on.

- [ ] **Step 2: Write the composer**

It returns `null` when the caller cannot read the league. **Do not throw** — the redirect in Step 4 depends on `null` being distinguishable from an error.

- [ ] **Step 3: Build the page**

The score panel spells out the formula: `Opening ($M) × Tomatometer = Score`. The owners list shows bid and points-per-dollar per owner, and states that **every owner earns the full score** — the rule people get wrong.

**Never hard-code three tiers.** The heading reads "three winning tiers" only if `season_settings.top_n_distinct` says 3; resolve it per season.

- [ ] **Step 4: Implement the foreign-league path (IA map §7.4)**

```tsx
const record = await getFilmLeagueRecord(ctx, leagueId, tmdbId);
if (!record) redirect(`/films/${tmdbId}?from=league`);
```

The catalog page reads `from=league` and renders the notice on board 2.3's foot: *"Showing the catalog page. You are not a member of that league, so its bids and scores are not visible to you."* **Not a 404** — the film exists and is readable.

- [ ] **Step 5: Re-point the three `?league=` link sites**

```bash
git grep -n 'league=' -- 'src/*.tsx'
```

Each becomes `/league/${leagueId}/films/${tmdbId}`.

- [ ] **Step 6: Add `error.tsx`**

- [ ] **Step 7: Run the gate**

```bash
npm run verify
```

- [ ] **Step 8: Drive it — including the redirect**

As `dev-player`, open a film the league owns and confirm the record renders with real owners. **Then, as `dev-outsider@moviepool.local`, open the same URL** and confirm you land on the catalog page with the notice — not a 404, and not the league's data. That second half is the whole point of the task and is the one branch a gate cannot check.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(films): the league record gets its own address, and a foreign league lands on the catalog"
```

---

## Task 2.4: `/players/[profileId]`

**Board:** `2.4  /players/[profileId]`

**Files:**
- Modify: `src/app/(member)/players/[profileId]/page.tsx`, `bio-form.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/player-profile.ts`

**Interfaces:**
- Produces: `getPlayerProfile(ctx, profileId) -> PlayerProfile | null` — identity, six career stats, and the season-by-season rows.

- [ ] **Step 1: Open the board**

The six stats are a **ladder, not a row**. The current page's own comment records why: a row gave each label about ninety pixels and every one truncated — "SEASONS W…", "CAREER PO…". Do not re-flatten it.

- [ ] **Step 2: Write the composer**

Six stats: seasons won, best finish, career points, films owned, total spent, seasons played. Plus the per-season rows.

- [ ] **Step 3: Build the page**

Identity card with the perforation edge, the six stats, and the season table. The bio form stays editable **only on your own profile** — that gate is a real permission, not a display rule.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive it as two people**

Your own profile (bio editable — **complete an edit and confirm it persisted in the database**) and someone else's (bio read-only). Report which you could not reach.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(players): the profile is rebuilt, and the six stats stay a ladder"
```

---

# Band 3 — Season core

**Why here (§10.1):** the high-traffic core, and where most block discovery happens.

**Blocked by Task 0.2** (the countdown fixture) and **Task 0.6** (the series hues, for 3.1's bump chart).

---

## Task 3.1: `/season/[seasonId]`

**Board:** `3.1  /season/[seasonId]`

**The largest read screen in the app.** Three tabs, a role-gated strip, and the bump chart.

**Files:**
- Modify: `src/app/(member)/season/[seasonId]/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/season-home.ts`
- Delete: the un-underscored `components/` folder's members that no surviving screen imports

**Interfaces:**
- Produces: `getSeasonHome(ctx, seasonId) -> SeasonHome` — the header facts, the viewer's own standing, the weeks rows, the leaderboard, and (when `ctx.role === "commissioner"`) the overdue-week queue.

- [ ] **Step 1: Open the board and read the two sticky notes beside it**

Two decisions are drawn there rather than described here: the **season picker is a header control**, not the quarter-width left rail `SeasonRail` renders today; and the **commissioner Queue is a strip on this page, not a route**.

- [ ] **Step 2: Write the composer, and fold the Queue into it**

`getOverdueWeeks` / `OverdueWeek` live in `src/lib/commish.ts` with **zero consumers in `src/`** — a composer with no UI. Call it from `getSeasonHome` behind a role check. **Import it; do not port it.** The DAG that refused this is deleted, and the logic is already correct.

The overdue rule, from the original's own comment: a week whose opening weekend has passed, whose status is neither `final` nor `skipped`, and whose eligible films still have no `captured_at`. **A week still marked `open` past its opening weekend counts** — that combination is a deadline that did not fire, and surfacing it is the point.

- [ ] **Step 3: Fix the open-week lookup while you are here**

`page_type_map.md` records it: the current hub finds the open week over a list ordered by `created_at`. Order by week number. Harmless with one open week, wrong in principle with two.

- [ ] **Step 4: Build the page**

Header with the picker and the status chip; the viewer's own standing strip; the Queue strip when commissioner; then the three tabs — **Weeks leads**, because it is the only tab with a deadline in it.

The countdown is **the one vermilion element on this surface**. Not the "Place bids" button, not the status chip.

- [ ] **Step 5: Rebuild the bump chart on the real series hues**

Task 0.6 replaced the provisional ten. Consume them as `var(--series-N)`.

- [ ] **Step 6: Keep the tab-from-URL behaviour**

`?tab=leaderboard` must still land on Leaderboard — the Monday-scores email links it (`api/cron/notify/route.ts:189`). Switching a tab writes nothing to the URL; arriving at one that names a tab must honour it.

- [ ] **Step 7: Add `error.tsx`**

- [ ] **Step 8: Run the gate**

```bash
npm run verify
```

- [ ] **Step 9: Drive it as both roles**

As `dev-player`: three tabs, the countdown ticking, no Queue strip. As `dev-commish`: the Queue strip renders and its two actions go where they claim. **The Queue has never been seen by anyone** — this is its first render, so look at it properly.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(season): season home is rebuilt, and the commissioner queue finally renders"
```

---

## Task 3.2: `/season/[seasonId]/weeks/[weekId]`

**Board:** `3.2  /season/[id]/weeks/[weekId] — settled`

**Files:**
- Modify: `src/app/(member)/season/[seasonId]/weeks/[weekId]/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Modify: `components/release-browser.tsx:471` — the second bare `/films/` link
- Create: `src/lib/week-board.ts`

**Interfaces:**
- Produces: `getWeekBoardView(ctx, weekId) -> WeekBoardView | null`. Named `…View` deliberately: `getWeekBoard` still exists in `src/lib` with other callers, and two functions one letter apart is how a wrong import happens.

- [ ] **Step 1: Open the board**

It is drawn **settled**, because the bid page already covers the open state and the reveal is the half nobody has seen. **The player's own result opens the page**, ahead of the reveal.

- [ ] **Step 2: Know about the third redirect mechanism**

IA map §5.1: this page performs an in-page state-based `redirect()` to `/bid` when the week is still biddable (ADR-108). It is not in `next.config.ts` and reading that file will not reveal it. **It must survive.**

- [ ] **Step 3: Write the composer**

It must serve every week state: open (redirects), closed-and-unscored, settled, and skipped.

- [ ] **Step 4: Build the page**

Your result first. Then the reveal — each film with opening, Tomatometer, score and its owners with bids. Then corrections and removed films.

**Corrections carry ink, not red.** `--destructive` is `#000000` in this palette; a red callout would invent a colour the system deleted.

The owners line must state the tie honestly — "Three distinct amounts — a tie at $9 gives four owners" — because that is the rule people misread.

- [ ] **Step 5: Fix the second bare film link**

`components/release-browser.tsx:471` links to `/films/${tmdbId}` with no league, from inside a league context. Give it the league.

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

# Band 4 — League

**Why here (§10.1):** the second write surface, and heavy tables.

**This is the long pole — 11 of the 24 screens.** Two known findings apply across it:

1. **51 vermilion elements on the league page**, measured 2026-08-22. The system's rule is one per surface. It is pre-existing component styling, and Band 4 is where it is paid down. Every task in this band ends by counting.
2. **`league/components/` is not `_components/`.** The un-underscored folder is shared by several league screens, so a screen task may only delete a member of it once no surviving screen imports that member. Check before deleting.

---

## Task 4.1: `/home`

**Board:** `4.1  /home`

**`/home` absorbs the deleted `/league`.** IA map §1: `/league` "was `/home`'s empty state wearing a URL." Two callers point at it and must move.

**Files:**
- Modify: `src/app/(member)/home/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/home.ts`
- Modify: `src/lib/landing.ts:169`, `src/components/app-topnav.tsx:105`
- Delete: `src/app/(member)/league/page.tsx` and anything only it used

**Interfaces:**
- Produces: `getHome(ctx) -> Home` — the viewer's leagues with their live state, pending invites, and the zero-league flag.

- [ ] **Step 1: Open the board**

**The pending invite is the one vermilion element on this surface.** Not the "Start a league" button, not the open-week chip on a league card. The invite is the only thing asking you to act.

- [ ] **Step 2: Re-point the two `/league` callers**

```bash
git grep -n '"/league"' -- 'src/*.ts' 'src/*.tsx'
```

Both go to `/home`. `resolveLandingPath`'s zero-leagues case is the important one — its unit tests are explicit that the rule must never return `/home`, so read `scripts/unit/` before changing it and update the tests in the same commit if the rule genuinely changes.

- [ ] **Step 3: Write the composer and build the page**

Greeting, invites, the league list, and the getting-started links. The zero-league case renders the creation prompt — that is the state `/league` used to own.

- [ ] **Step 4: Delete `/league`**

```bash
git rm "src/app/(member)/league/page.tsx"
```

Confirm nothing imports what it used.

- [ ] **Step 5: Add `error.tsx`**

- [ ] **Step 6: Run the gate**

```bash
npm run verify
```

- [ ] **Step 7: Drive it, in three states**

With leagues, with a pending invite (**accept one and confirm the membership row exists**), and as a user with none. `dev-outsider@moviepool.local` is the zero-league fixture.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(home): /home absorbs /league, and the invite takes the accent"
```

---

## Task 4.2: `/league/[leagueId]`

**Board:** `4.2  /league/[leagueId]`

**Files:**
- Modify: `src/app/(member)/league/[leagueId]/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/league-home.ts`

**Interfaces:**
- Produces: `getLeagueHome(ctx, leagueId) -> LeagueHome` — identity, seasons, members with career figures, the record-book aggregates, and the announcements rail.

- [ ] **Step 1: Open the board, and know about the uppercase trap**

**The title is the league switcher**, and it sits inside a `<button>`. Last session's finding: the league `<h1>` computed `text-transform: uppercase` correctly and rendered title-case, because the UA rule on form controls beats inheritance. `getComputedStyle` reported the rule as applied while the pixels disagreed. **The case must come from a class on the element, not from the base `h1` rule.**

- [ ] **Step 2: Write the composer**

The record-book aggregates are **the league's own numbers with no member in any of them** (ADR-085): average winning bid, average points per film, league points-per-dollar, films ever owned.

- [ ] **Step 3: Build the page**

Seasons table, members with a role badge, the record-book panel linking to `/records`, the announcements rail, and the dues summary. Settings moves to Task 4.11's route — this page links to it and no longer opens a dialog.

- [ ] **Step 4: Count the vermilion**

```bash
npm run dev
```

Then in the browser console on this page:

```js
[...document.querySelectorAll("*")].filter(e => {
  const s = getComputedStyle(e);
  return [s.backgroundColor, s.color, s.borderColor].some(v => v.includes("235, 75, 55"));
}).length
```

Expected: **1**. It was 51. If it is higher, find which shared component is painting it and fix the component.

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

## Task 4.3: `/league/[leagueId]/records`

**Board:** `4.3  /league/[id]/records`

**Files:**
- Modify: `src/app/(member)/league/[leagueId]/records/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/league-records.ts`

**Interfaces:**
- Produces: `getLeagueRecords(ctx, leagueId) -> LeagueRecords` — the career table and the record entries, each `{ label, entry, marquee }`.

- [ ] **Step 1: Open the board**

Six record cards; three are `marquee` and take the heavier border. The labels are the existing ones and are not to be renamed: **Best season**, **Biggest single film**, **Steal of the century**, **Priciest whiff**, **Best single week**, plus most films owned.

- [ ] **Step 2: Use the composer already in `src/lib/league-records.ts`**

**Import it. Do not rewrite it.** The earlier instruction to re-derive these queries existed only to satisfy the boundaries DAG, which is deleted. The career rows collapse renamed accounts into one career — `league-records.ts:145` explains why, and that behaviour survives for free by not touching the file.

- [ ] **Step 3: Build the page**

Record cards, then the career table with a titles badge.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive it**

Needs a league with completed seasons — use `npm run mock:season` if the dev fixtures have none, and say so in the report if the records come back empty.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(league): the record book is rebuilt"
```

---

## Task 4.4: `/league/[leagueId]/dues`

**Board:** `4.4  /league/[id]/dues`

**Real money, tracked outside the game.** The app records who paid whom, never how.

**Files:**
- Modify: `src/app/(member)/league/[leagueId]/dues/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/league-dues.ts`
- Create or modify: `src/app/(member)/league/[leagueId]/dues/actions.ts`

**Interfaces:**
- Produces: `getLeagueDues(ctx, leagueId) -> LeagueDues` — all-time balances and the per-season settlement rows.
- Produces: `markPaymentPaid(prev, formData) -> Promise<ActionResult>` — `'use server'`, `revalidatePath`.

- [ ] **Step 1: Open the board**

A **positive** balance means the league owes them. That is the opposite of the intuitive reading, so the board labels it — keep the label.

- [ ] **Step 2: Write the composer and the action**

The action goes through an RPC. Direct table writes are refused by `DB-ONEWAY` in governance, not merely by convention.

- [ ] **Step 3: Build the page**

Balances, the season settlement table with Paid/Owed/Square, and the viewer's own balance panel. "Mark paid" is commissioner-only.

- [ ] **Step 4: Add `error.tsx`**

Its copy matters: this screen is about money. Say that no payment state was changed.

- [ ] **Step 5: Run the gate**

```bash
npm run verify
```

- [ ] **Step 6: Drive the write**

As `dev-commish`, **mark a payment paid and confirm the row changed in the database** — a banner is not evidence. Then set it back.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(league): dues is rebuilt, with the balance sign explained"
```

---

## Task 4.5: `/league/[leagueId]/announcements`

**Board:** `4.5  /league/[id]/announcements`

**Announcements keeps its three routes** (IA map §5.4). It is a small CRUD surface, and an individual announcement is a thing you link someone to — which is why it was not folded into tabs the way CH-02 folded three season routes.

**Files:**
- Modify: `src/app/(member)/league/[leagueId]/announcements/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/announcements.ts`

**Interfaces:**
- Produces: `getAnnouncements(ctx, leagueId) -> Announcement[]` — title, author, timestamp, excerpt, read state.

- [ ] **Step 1: Open the board, write the composer, build the list**

Unread posts take the ink left edge and a small vermilion dot. "Write one" is commissioner-only.

- [ ] **Step 2: Add `error.tsx`**

- [ ] **Step 3: Run the gate**

```bash
npm run verify
```

- [ ] **Step 4: Drive it as both roles**

Confirm "Write one" is absent for a player.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(league): the announcements list is rebuilt"
```

---

## Task 4.6: `/league/[leagueId]/announcements/new`

**Board:** `4.6  /announcements/new`

**Files:**
- Modify: `src/app/(member)/league/[leagueId]/announcements/new/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create or modify: `src/app/(member)/league/[leagueId]/announcements/actions.ts`

**Interfaces:**
- Produces: `postAnnouncement(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

**This screen carries the band's only shadow.** Its sticky action bar overlaps its own form, which is exactly the floating case Task 0.4 kept `--shadow-raised` for. Every other surface in Band 4 is flat.

- [ ] **Step 2: Build the form and the action**

Title (it becomes the email subject), body (plain text — line breaks survive, nothing else is interpreted), and the "email this to all N members" switch. The member count is resolved, never hard-coded.

- [ ] **Step 3: Add `error.tsx`**

Its copy must say whether the draft was lost. If the boundary cannot tell, say so plainly rather than reassuring falsely.

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive the write**

As `dev-commish`, **post a real announcement and confirm the row exists**, and — if the switch was on — that the email actually sent. Then delete the row.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(league): the announcement composer is rebuilt"
```

---

## Task 4.7: `/league/[leagueId]/announcements/[announcementId]`

**Board:** `4.7  /announcements/[id]`

**Files:**
- Modify: the route's `page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Modify: `src/lib/announcements.ts` — add the single-record read

**Interfaces:**
- Consumes: `getAnnouncements` from Task 4.5.
- Produces: `getAnnouncement(ctx, leagueId, announcementId) -> Announcement | null`.

- [ ] **Step 1: Open the board and build the page**

A reading surface: the title, the author with role and timestamp, and the body at 16px on a `measure` — not the page frame. Edit and Delete are commissioner-only and sit at the foot, quiet.

- [ ] **Step 2: Preserve the line breaks**

The body is plain text with newlines. It needs `white-space: pre-line` or equivalent, or the paragraphs run together. This is a real shipped bug class in this repo.

- [ ] **Step 3: Add `error.tsx`**

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it**

Confirm a multi-paragraph body renders as paragraphs.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(league): reading an announcement is rebuilt"
```

---

## Task 4.8: `/league/new`

**Board:** `4.8  /league/new`

**Files:**
- Modify: `src/app/(member)/league/new/page.tsx`
- Modify: `src/app/(member)/league/components/create-league-wizard.tsx`
- Create: `error.tsx`
- Create or modify: `src/lib/actions/league.ts`

**Interfaces:**
- Produces: `createLeague(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

Four steps in a left rail: Name it · House rules · Invite people · First season. The board draws step 2.

- [ ] **Step 2: Build the house-rules step against the rulebook**

Every value here is marked **[Configurable]** in the rulebook and must live in the rules engine, never hard-coded: season bankroll ($100 default), winning tiers (3 default), include limited releases (off default), results capture time (Monday morning default).

**The winning-tiers copy must explain the tie**, because "3" alone is what makes people expect three owners: *"Ties are always honoured, so a film can have more owners than tiers."*

- [ ] **Step 3: Add `error.tsx`**

A wizard's boundary should say which step's data survived, if any.

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it end to end**

**Create a real league** and confirm it exists with you as commissioner. Then delete it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(league): the creation wizard is rebuilt on configurable rules"
```

---

## Task 4.9: `/join/[token]`

**Board:** `4.9  /join/[token]`

**Email-linked (IA map §4).** The address does not change, and it is reached from `commish/actions.ts:1217`.

**Files:**
- Modify: `src/app/(member)/join/[token]/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/invite.ts`
- Create or modify: `src/lib/actions/league.ts` — `acceptInvite`

**Interfaces:**
- Produces: `getInvite(token) -> Invite | null` — **no `ctx`**, because this is the one read reached before membership exists. It resolves the league's public facts and nothing member-scoped.
- Produces: `acceptInvite(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board and build the page**

League name, what the invite is for, the four league facts (members, bankroll, tiers, next season), the member avatars, and one action.

- [ ] **Step 2: Handle the three failure states explicitly**

Expired, already used, and already a member. Each needs its own copy — a single "invalid invite" for all three is the lazy answer and it strands people.

- [ ] **Step 3: Add `error.tsx`**

- [ ] **Step 4: Run the gate**

```bash
npm run verify
```

- [ ] **Step 5: Drive it, including a failure**

**Generate a real invite, accept it as `dev-outsider`, confirm the membership row.** Then re-open the same token and confirm the already-used copy renders. Remove the membership afterwards.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(invites): the join screen is rebuilt, with three distinct failure states"
```

---

## Task 4.10: `/account`

**Board:** `4.10  /account`

**Files:**
- Modify: `src/app/(member)/account/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/account.ts`
- Create or modify: `src/app/(member)/account/actions.ts`

**Interfaces:**
- Produces: `getAccount(ctx) -> Account` — profile, sign-in identities, email preferences.
- Produces: `updateProfile`, `updateEmailPreferences` — both `ActionResult`.

- [ ] **Step 1: Open the board, and check the registry first**

```bash
npx shadcn@latest search @shadcn -q "settings"
```

The registry ships settings blocks; read them before designing sections from scratch.

- [ ] **Step 2: Build the four sections**

Profile (display name, bio), Sign-in (email, password, linked Google), Email (four toggles), and sign-out.

**The display-name warning is real and must survive:** changing it re-labels the whole history at once — the standings, every past season, every record held. `src/lib/league-records.ts:145` is why.

- [ ] **Step 3: Name the four email preferences from the real cron**

They are the four notify types in `api/cron/notify/route.ts`: slate up, deadline near, reveal, Monday scores. Do not invent a fifth.

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

## Task 4.11: `/league/[leagueId]/settings` (NEW ROUTE)

**Board:** `4.11 /league/[id]/settings  (NEW)`

**Why it exists.** IA map §7.2 — configuration centralizes, operations distribute. Four things move out of the modal dialog: identity, house rules, member roles, invites. **Nothing operational moves.**

**Files:**
- Create: `src/app/(member)/league/[leagueId]/settings/page.tsx`, `error.tsx`, `_components/*.tsx`
- Create: `src/lib/league-settings.ts`
- Create or modify: `src/lib/actions/league.ts` — the role RPCs
- Delete: `src/app/(member)/league/components/league-settings-dialog.tsx` and its call site

**Interfaces:**
- Consumes: `getLeagueHome` from Task 4.2, for the identity facts.
- Produces: `getLeagueSettings(ctx, leagueId) -> LeagueSettings | null` — `null` when the caller is not a commissioner.
- Produces: `promoteLeagueCommissioner`, `demoteLeagueCommissioner`, `handoffLeagueCommissioner`, `removeLeagueMember`, `updateLeagueIdentity`, `updateHouseRules`, `createInvite`, `revokeInvite` — all `ActionResult`, all through their existing RPCs.

- [ ] **Step 1: Open the board**

Left rail of four sections; the board draws all four stacked.

- [ ] **Step 2: Gate the route, not just the controls**

A player who types this URL gets `notFound()`. Follow `requireSeasonMember`'s reasoning: `notFound()` and never a redirect, because sending someone to `/home` tells them the page is real and just not theirs.

- [ ] **Step 3: Wire the role actions to their existing RPCs — do not write new ones**

ADR-060's two guarantees are enforced in the RPCs and must not be re-implemented in the UI:

- **Never self-granted** — `promote_league_commissioner` requires the caller to already be a commissioner.
- **Never zero** — `demote_league_commissioner` and `remove_league_member` both refuse on the **last** commissioner.

`handoff_league_commissioner` is the one-shot exit for a **sole** commissioner and rejects a handoff to someone who already holds the role. `set_league_member_role` delegates to the promote/demote pair, so each guard has one implementation.

- [ ] **Step 4: Say the never-zero rule on screen**

The board draws it: *"A league always has at least one commissioner."* It is enforced in the RPCs and stated in no UI today. A settings page is the first place it has somewhere to be explained.

- [ ] **Step 5: Delete the dialog**

```bash
git rm "src/app/(member)/league/components/league-settings-dialog.tsx"
git grep -n "LeagueSettingsDialog"
```

Re-point the call site on League Home to a link.

- [ ] **Step 6: Add `error.tsx`**

- [ ] **Step 7: Run the gate**

```bash
npm run verify && npm run spike:settings
```

`spike:settings` is the contract test for this surface's RPCs. It must stay green.

- [ ] **Step 8: Drive it, and try to break the guarantee**

As `dev-commish`: rename the league (**confirm it persisted**), promote a member, then **try to demote the last commissioner and confirm it is refused**. That refusal is the one behaviour on this page nobody can see from the code. Then put every change back.

As `dev-player`: confirm the URL 404s.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(league): settings becomes a route, and the never-zero rule finally has somewhere to be said"
```

---

# Band 5 — Commissioner

**Why last (§10.1):** highest complexity, and it benefits most from blocks that have settled.

---

## Task 5.1: `/season/[seasonId]/payouts` — merged and role-gated

**Boards:** `5.1a /season/[id]/payouts — player` **and** `5.1b — commissioner`

**Two boards, one route.** IA map §2 merged `/commish/[seasonId]/payouts` into this page and stated the condition the merge must satisfy:

> the player's view opens with **their own result**; the commissioner's controls are **additive and secondary** — not the player page with a toolbar bolted on top, and not the workbench with the player's summary demoted.

**If it reads badly when built, this decision is the one to revisit** — `/commish/[seasonId]/payouts` at 282 lines is in git as the reference.

**Files:**
- Modify: `src/app/(member)/season/[seasonId]/payouts/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create: `src/lib/payouts.ts`
- Create: `src/app/(member)/season/[seasonId]/payouts/actions.ts`
- Delete: `src/app/(member)/commish/[seasonId]/payouts/page.tsx`
- Modify: the commissioner bar's link — it points at the deleted route

**Interfaces:**
- Produces: `getPayouts(ctx, seasonId) -> Payouts` — the viewer's own result, the awards, the ledger, and (commissioner only) the draft state and blockers.
- Produces: `generateDraft`, `regenerateDraft`, `finalizeSettlement` — all `ActionResult`.

- [ ] **Step 1: Open both boards, and read how the merge resolves**

The commissioner's affordances split **by kind**, and that split is the whole answer:

- **Status** goes to the **top**, as one line — *"Draft — only you can see this"* — because it qualifies the meaning of everything below it.
- **Controls** go to the **foot**, in a bounded ink-headed block.

The commissioner's own result opens their page **identically to the player's**, because a commissioner is a player too.

- [ ] **Step 2: Reuse the shared rendering components**

`SettlementAwards` and `SettlementLedger` already live under `season/components/` and are imported by both old pages. That shared rendering is half the argument the merge rested on. Promote them properly per condition 3 — story always, `registry.json` entry only if they land in `blocks/` or `layout/`.

- [ ] **Step 3: Preserve the friction ladder exactly**

None of this came from the URL, so all of it survives the merge:

- **Weight matches consequence.** Finalize is irreversible and publishes to everyone, so it takes the heavy treatment; Regenerate is routine and recedes.
- `confirmMessage="Finalize the payouts? They become visible to every member and can no longer be regenerated."`
- `confirmMessage="Regenerate the draft payouts from the current standings? The existing draft is replaced."`
- The `finalizeBlocker` disables Finalize until the season is over.

- [ ] **Step 4: Keep the email-linked address working**

`commish/actions.ts:867` links `/season/[seasonId]/payouts` in the season-settled statement. The address does not change; confirm the link still resolves after the merge.

- [ ] **Step 5: Re-point the commissioner bar and delete the old route**

```bash
git grep -n "commish/\[seasonId\]/payouts\|commish/.*payouts"
git rm "src/app/(member)/commish/[seasonId]/payouts/page.tsx"
```

**Do not delete `src/app/(member)/commish/` itself.** It holds `actions.ts`, imported by 13 files outside it, and 15 shared components imported by 5 more. What ends is the commissioner *route tree* — five `page.tsx` files. The directory survives until Plan 3 relocates its writes.

- [ ] **Step 6: Add `error.tsx`**

- [ ] **Step 7: Run the gate**

```bash
npm run verify && npm run spike:phase9 && npm run spike:e2e
```

`spike:e2e` is the full two-week mini-season gate and it exercises settlement. It must stay green.

- [ ] **Step 8: Drive it as both roles, and judge the merge**

As `dev-player` on a settled season: your result opens the page, no controls anywhere.

As `dev-commish` on a live season: the draft banner is one line at the top, your own result still opens the page, and the controls are at the foot. **Generate a draft and confirm the rows exist in the database.** Confirm Finalize is disabled and that its disabled reason is stated.

**Then make the judgement the IA map asked for.** Does the commissioner's page read as the player's page with an addition, or as a workbench with the player's summary demoted? If the latter, stop and raise it — the old route is in git and the merge is reversible.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(payouts): the two payout pages become one, role-gated"
```

---

## Task 5.2: `/league/[leagueId]/season/new`

**Board:** `5.2  /league/[id]/season/new`

**Files:**
- Modify: `src/app/(member)/league/[leagueId]/season/new/page.tsx`
- Create: `_components/*.tsx`, `error.tsx`
- Create or modify: `src/app/(member)/league/[leagueId]/season/new/actions.ts`

**Interfaces:**
- Consumes: `getLeagueSettings` from Task 4.11, for the inherited house rules.
- Produces: `createSeason(prev, formData) -> Promise<ActionResult>`.

- [ ] **Step 1: Open the board**

Two dates, a derived week count, and the inherited rules. **All league members auto-join** (ADR-016) — the board says so, because nobody should wonder whether they need to invite people again.

- [ ] **Step 2: Derive the week count, do not ask for it**

One week per Friday between the two dates, numbered `01`…`NN` — two digits, per the canvas decision. Show the derived count so the commissioner can sanity-check the dates.

- [ ] **Step 3: Inherit the rules, and allow the override**

Defaults come from the league; changing one here changes it **for this season only**. Say that on screen — the board does.

- [ ] **Step 4: Add `error.tsx`**

- [ ] **Step 5: Run the gate**

```bash
npm run verify && npm run spike:lifecycle
```

- [ ] **Step 6: Drive it end to end**

**Create a real season** in a throwaway league, confirm the weeks were created with the right numbers and dates, and confirm every member joined. Then delete the season.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(season): the season wizard is rebuilt, and week numbers are two digits"
```

---

## Closing this plan

- [ ] **Step 1: Confirm every composer has a consumer**

```bash
# every src/lib/*.ts should be imported by at least one page or action
for f in src/lib/*.ts; do
  n=$(git grep -l "$(basename "$f" .ts)" -- src/app src/lib | grep -vc "^$f$")
  [ "$n" -eq 0 ] && echo "ORPHAN: $f"
done
```

The old legacy ratchet is retired with `governance:legacy`. `src/lib` is no longer a holding pen to be drained — it is where composers live. What replaces the ratchet is the check above: a composer nothing imports is dead code, and `getOverdueWeeks` sat there with zero consumers for weeks precisely because nothing looked.

- [ ] **Step 2: Confirm every route in the map has a page**

```bash
find src/app -name "page.tsx" | sort
```

Expected: 25 page routes, matching IA map §1 as corrected by Task 0.1. Plus the two route handlers, `/auth/callback` and `/auth/confirm`.

- [ ] **Step 3: Confirm every segment has a boundary**

```bash
diff <(find src/app -name "page.tsx" | xargs -n1 dirname | sort) <(find src/app -name "error.tsx" | xargs -n1 dirname | sort)
```

Expected: no output. Any directory listed on the left only is a segment that will blow its error up to the whole app.

- [ ] **Step 4: Count the `<main>` landmarks**

```bash
git grep -c "<main" -- 'src/app/**/page.tsx' | wc -l
```

Four member pages rendered no `<main>` before this plan and nothing caught it. Every page must render exactly one.

- [ ] **Step 5: Run the whole gate one last time**

```bash
npm run verify && npm run spike:e2e && npm run spike:adr
```

- [ ] **Step 6: Write the phase digest and hand off to Plan 3**

Record: which screens revealed defects the gates could not see, which states were never driven for want of a fixture, and whether the payouts merge held. Plan 3 opens with `registry.json` publishing and the `src/lib` retirement by entity.

---

## Decisions to capture

- **`npm run verify` did not exist**, though §10.2 condition 6 has named it since the spec was written. Task 0.1 creates it. Same defect class as Ruling 74 — a condition naming a mechanism nobody has — found in the same paragraph, twice.
- **The route map is 25, not 23**, and `ia-screen-map.md`'s published headline was stale by three decisions. Task 0.1 corrects it and adds §7 as the record.
- **Elevation is two tiers** (Decision A): panels flat, floating layers only, retuned for paper. `Panel.elevated` is deleted rather than defaulted off.
- **The commissioner Queue is a strip, not a route**, and `getOverdueWeeks` had zero consumers — it is a composer with no UI, folded into `getSeasonHome` by Task 3.1 rather than deleted by Plan 3 as dead code.
- **Configuration centralizes, operations distribute** — the test that settled the commissioner question and produced `/league/[leagueId]/settings` as the one legitimate second commissioner page.
- **`film-drawer.tsx:108` promised "pool history" on a page ADR-408 defines as having none.** Found by reading routes, not by any gate and not by a browser drive, because the page renders correctly.
