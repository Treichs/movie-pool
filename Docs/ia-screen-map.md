---
status: canon
mode: decision-log
owns: Which routes exist in v2 and which were deleted
amended: 2026-08-30 — two handlers retired; four remain
supersedes: none
---

# IA Screen Map — the v2 route set

**Date:** 2026-08-21
**Status:** approved by the developer
**Produced by:** Task 6 of [the frontend rebuild plan](../superpowers/plans/2026-08-21-frontend-rebuild-phase-0-5.md)
**Consumed by:** Plan 2 (Phases 6–8). Phase 6's task list is one task per surviving screen, derived from this document rather than from the current tree.
**Inputs:** the live route list, `page_type_map.md`, `user-flow-and-domain-map.md`, `next.config.ts`'s redirect table, and `src/lib/email-templates.ts`'s callers. Full working brief: `.superpowers/sdd/2026-08-21-frontend-rebuild-phase-0-5/task-6-inputs.md`.

---

## The headline

**28 routes become 25**, and there is no longer a commissioner **route tree** — but there are now two commissioner-only *pages*, which is a change from this document's first version and is explained in §7.

The commissioner is a **permission, not a place** — uniformly, with no remaining exception. That answers a question `page_type_map.md` has carried as *"Status: undecided"* since 2026-08-03 and that ADR-095 answered only partially on 2026-08-16.

> **Precision, because an earlier draft of this document overstated it.** `src/app/(member)/commish/` does **not** disappear. It holds `actions.ts` — imported by **13** files outside it — and 15 shared components imported by 5 more, including `create-league-wizard`, `season/new`, `weeks-panel`, the bid page and `CommissionerWeekPanel`. What ends is the commissioner **route tree**: five `page.tsx` files. The directory survives as a shared actions-and-components home until Task 17 relocates its writes to `orchestration/actions`. Phase 6 must not read "commish ceases to exist" as licence to delete the folder.

**No redirects are owed.** None of the seven email-linked routes moves. The two disappearing destinations are reached from code, not from mail.

---

## 1. Verdicts

### Deleted (5)

| Route | Verdict | Why |
|---|---|---|
| `/commish/[seasonId]` | delete, no redirect | Redirect stub since ADR-095 stage 2. Still compiles and bundles. |
| `/commish/[seasonId]/picker` | delete, no redirect | Redirect stub since ADR-095/121 stage 3. |
| `/commish/[seasonId]/weeks/[weekId]` | delete, no redirect | Redirect stub since ADR-095. |
| `/leagues/[leagueId]/commish` | delete, no redirect | Redirect stub since ADR-095 stage 3. |
| `/leagues` | **fold into `/leagues`** | It was `/leagues`'s empty state wearing a URL. Both were signposts, both rendered pending invites. |

The four stubs' own comments propose deleting them *"once the link sweep confirms nothing points here."* The app is not live, so that sweep finds zero by construction. This is the cheapest it will ever be.

### Merged (1)

| Route | Verdict | Why |
|---|---|---|
| `/commish/[seasonId]/payouts` | **merge into `/seasons/[seasonId]/payouts`**, role-gated | See §2 — this reverses ADR-095's one preserved exception. |

### Split (1)

| Route | Verdict | Why |
|---|---|---|
| `/films/[tmdbId]?league=<id>` | **two routes**: `/films/[tmdbId]` and `/leagues/[leagueId]/films/[tmdbId]` | See §3 — the carrier changes, the ADR-408 principle does not. |

### Added (3)

| Route | Verdict | Why |
|---|---|---|
| `/` | **repurposed** as a landing page | See §7.1 — sign-in moves to `/login`, reversing ADR-121. |
| `/login` | **added** (restores what ADR-121 deleted) | See §7.1. Not a duplicate of `/` any more, because `/` is a different page. |
| `/leagues/[leagueId]/settings` | **added** | See §7.2 — configuration centralizes, operations distribute. |

### Kept (21)

Everything else, unchanged in address:

`/how-it-works` · `/signup` · `/forgot-password` · `/reset-password` · `/leagues` · `/account` · `/leagues/new` · `/leagues/[leagueId]` · `/leagues/[leagueId]/dues` · `/leagues/[leagueId]/records` · `/leagues/[leagueId]/announcements` · `/leagues/[leagueId]/announcements/new` · `/leagues/[leagueId]/announcements/[announcementId]` · `/leagues/[leagueId]/seasons/new` · `/seasons/[seasonId]` · `/seasons/[seasonId]/payouts` · `/seasons/[seasonId]/weeks/[weekId]` · `/seasons/[seasonId]/weeks/[weekId]/bid` · `/players/[profileId]` · `/invites/[token]` · `/films/[tmdbId]`

### Route handlers (6) — added 2026-08-26

This section is an **amendment**. Until now this document named two route handlers and stopped there, which was wrong by four. Every one of the four that remain is load-bearing, none is a screen, none appears in any Phase 6 screen task, and a rebuild driven off the page list alone would ship without them. They move across unchanged.

| Handler | What it does | What breaks without it |
|---|---|---|
| `/auth/callback` | Google OAuth exchange | Google sign-in |
| `/auth/confirm` | Token-hash exchange | Every signup-confirmation and password-reset link in the mail |
| `/api/cron/notify` | Scheduled mail — 24h bid warning, week settled, season ends | **All outbound notification email.** The failure is silent: no error, players simply stop being told |
| `/api/cron/tomatometer` | Polls OMDb for Tomatometer suggestions | The commissioner's score capture loses its suggested value and goes fully manual |

The two `/api/cron/*` handlers are **Vercel cron targets**, so `vercel.json`'s schedule block is part of the move and is as load-bearing as the routes themselves. They also authenticate with `CRON_SECRET`, which must exist in the new project's environment before the first deploy or every scheduled run returns 401 — again silently.

**Why they were missed.** This document was produced from a screen inventory, and a route handler is not a screen. The omission is worth naming rather than quietly fixing: the same blind spot would drop them again the next time the route set is re-derived from the design canvas.

**25 page routes** (plus the four route handlers above): the 21 kept above, plus the one new address the split adds (`/leagues/[leagueId]/films/[tmdbId]` — `/films/[tmdbId]` itself is already one of the 21), plus the 3 added routes (`/`, `/login`, `/leagues/[leagueId]/settings`). The merge contributes no new address: `/commish/[seasonId]/payouts` folds into `/seasons/[seasonId]/payouts`, which was already among the 21 kept.

**AMENDED 2026-08-30 — the handler count is 4, not 6.** Two were retired the
same day. `/api/peep-head` composed the Open Peeps avatars and went when avatars
became derived colour and initials. `/api/cron/automate` was a second door into
`run_bidding_automation` — the pg_cron job `bidding-automation` calls that
function directly every minute, so the route was scheduled by nothing and
duplicated work already being done. Neither had a caller. The remaining four are
unchanged and still load-bearing.

**AMENDED 2026-08-30 — the count is 26.** `/leagues/[leagueId]/announcements/[announcementId]/edit` was added when editing an announcement was decided on: the table had shipped with only post and delete, so fixing a typo meant deleting and reposting, which loses the post's place in the list and its date. The address is a verb leaf for §7.5's own reasons — the carrier is a path segment rather than a query string, the nesting is no deeper than `/bid` and `/new`, and both truncations land on a real page (chop `/edit` for the post, chop the post for the list). §7.5's closing rule says no further IA change without a redirect; nothing is public yet, so there was nothing to redirect.

---

## 2. The commissioner tree dissolves completely

ADR-095 dissolved three of four commissioner routes on 2026-08-16 and deliberately kept the settlement workbench. That page's own comment argues for the split:

> *"the player page opens with **your** result, it is not the workbench with buttons removed."*

That framing is real. It is not worth a route.

**The counter-argument that won:** the week page already solves this exact problem the other way. Commissioner powers there arrive as a role-gated inline component (`CommissionerWeekPanel`), not a second URL. And the two payouts pages *already share their rendering components* — `SettlementAwards` and `SettlementLedger` live under `season/components/` and are imported by both. Same guts, two shells.

Keeping one exception to a pattern the app otherwise applies consistently costs a whole route tree to express a framing difference a role gate can express inside one page.

**What Phase 6 must preserve when it merges them:** the player's view opens with their own result. The commissioner's controls are additive and secondary on the same page — not the player page with a toolbar bolted on top, and not the workbench with the player's summary demoted. If that reads badly when built, this decision is the one to revisit, and `/commish/[seasonId]/payouts` at 282 lines is in git as the reference.

### 2.1 The industry pattern is against this, and the reason it does not transfer

Checked after the decision, on 2026-08-21. **All three major fantasy platforms separate commissioner tools into a dedicated surface:** ESPN ships an "LM Tools" tab; Sleeper routes you to league settings → **Commissioner Control**, and puts even operational powers like *Edit Lineups and Matchups* inside it; Yahoo has its own commissioner section. On its face that is three-for-three against this decision.

**Why it does not transfer.** What those platforms separate is a *large* surface — scoring rules, roster limits, playoff structure, divisional seeding, dozens of settings. A dedicated area earns its place by mass. Movie Pool's equivalent configuration already lives apart: `/leagues/[leagueId]/seasons/new` and the league settings dialog. What remained was **one operational page**, and a section containing exactly one item is a worse pattern than either alternative. ADR-095 had already reached that conclusion for three of the four.

**The destructive-action objection also fails on inspection**, and this is the part worth recording. The literature's answer for irreversible actions is a *ladder of friction* delivered at the control — confirmation naming what will be lost, visual weight matched to consequence, disabled state when preconditions fail — not a separate address. The existing workbench already implements exactly that, well:

> `Weight matches consequence: Finalize is irreversible and publishes to everyone, so it takes the accent; Regenerate is routine and recedes. Both keep their confirm copy.`

with `confirmMessage="Finalize the payouts? They become visible to every member and can no longer be regenerated."` and a `finalizeBlocker` that disables it until the season is over. **None of that guarding comes from the URL.** All of it survives the merge unchanged.

**The standing risk, and the condition that would reverse this.** If Phase 6's redesign *grows* the commissioner surface — a season-configuration workbench, a bulk results editor, anything that makes it two or three pages rather than one — the mass argument flips and a commissioner area re-earns its place. This decision is correct for a surface of one. It is not a principle about commissioners in general, and it should be re-examined the moment a second commissioner-only page is proposed.

---

## 3. The film page splits, and ADR-408 survives

ADR-408 ruled that the film page shows **one scope** — the context league's own record — because commissioner-entered box office and Tomatometer values make play data league-local. **That principle is untouched.** What changes is the carrier: a query parameter becomes a path segment.

| | Today | v2 |
|---|---|---|
| Catalog view | `/films/[tmdbId]` | `/films/[tmdbId]` |
| League's own record | `/films/[tmdbId]?league=<id>` | `/leagues/[leagueId]/films/[tmdbId]` |

**What this buys:** the league-scoped view becomes bookmarkable and shareable as its own address, and breadcrumbs can name which league you are looking from.

**What this costs, and it must be designed rather than inherited:** today an unreadable or foreign league id *silently degrades to the catalog view*, because RLS is the fallback gate. Under two routes that becomes an explicit not-found path. Phase 6 owes that screen a decision — 404, or redirect to the catalog view with a notice.

**Checked against URL-design practice on 2026-08-21, and it holds.** The documented rule is: nest a child resource when it is *exclusively* scoped to its parent, and use a query parameter when listing across all parents is a valid case. A film is **not** exclusively scoped to a league — the catalog view is a real, first-class use — which is precisely the case the literature says calls for the **hybrid**: *"provide both a top-level collection resource and a collection resource scoped to a parent, as the two collections may serve different use cases and involve different authorizations or representations."* Different authorizations is literally what separates these two: the catalog is public-to-members, the league view is RLS-scoped. Nesting depth is two levels, which is the recommended maximum, not past it.

---

## 4. Redirects for `next.config.ts`

**None.**

Verified against `src/lib/email-templates.ts`'s callers. All seven email-linked routes survive at their current addresses:

| Route | Linked from |
|---|---|
| `/seasons/[seasonId]/weeks/[weekId]` | slate-up + reveal emails (`api/cron/notify/route.ts:103`, `:160`) |
| `/seasons/[seasonId]/weeks/[weekId]/bid` | deadline-near reminder (`:133`) |
| `/seasons/[seasonId]?tab=leaderboard` | Monday-scores email (`:189`) |
| `/seasons/[seasonId]/payouts` | season-settled statement (`commish/actions.ts:867`) |
| `/invites/[token]` | league invite (`commish/actions.ts:1217`) |
| `/auth/confirm` | signup confirmation + password reset (`lib/landing.ts:115-117`) |
| `/forgot-password` | "your password was reset" notification (`(auth)/actions.ts:270`) |

The two disappearing destinations are reached from **code**, not from mail, so their callers are updated rather than redirected. Verified by grep on 2026-08-21 — these are the only two references, and there are no others:

- `/leagues` — `src/lib/landing.ts:169` (`resolveLandingPath`, the zero-leagues case) and `src/components/blocks/chrome/app-topnav.tsx:105`. Point both at `/leagues`.
- `/commish/[seasonId]/payouts` — the commissioner bar. Point it at `/seasons/[seasonId]/payouts`.

**Is "zero redirects" a smell — a sign the map was not ambitious enough?** No, and the reason is worth stating so nobody re-opens it. The three standard arguments for a redirect are search engines, external inbound links, and user bookmarks. This app is auth-gated (no crawler ever sees a route), has no external inbound links except the seven emails audited above (all of which survive), and is not live (no bookmark exists). Every condition that makes a redirect necessary is absent. The map is ambitious — it removes five routes and re-shapes two — and it still owes nothing, because pre-launch is the one window where URL changes are free.

**That window closes with Phase 6.** Once screens are built against these addresses and the app has users, any further IA change owes a redirect. Change the map now if it is going to change.

---

## 5. Other findings, recorded so Phase 6 does not rediscover them

1. **There is a third redirect mechanism the config does not show.** `/seasons/[seasonId]/weeks/[weekId]` performs an in-page state-based `redirect()` to `/bid` when a week is still biddable (ADR-108). Reading `next.config.ts` alone will not reveal it.
2. **`/` is a two-audience Mode at the root** — sign-in when signed out, `resolveLandingPath` redirect when signed in. `/login` was deleted as a duplicate of it (ADR-121). The page-type vocabulary's Mode examples do not anticipate this happening at the root; it works, and it is worth naming.
3. **The season is the front door**, not `/leagues`. `page_type_map.md` (2026-08-03) says Home; `user-flow-and-domain-map.md` (2026-08-11, ADR-094) says the season; the live code follows the later one. **`page_type_map.md` gets corrected, not the code.**
4. **Announcements keeps its three routes** and is explicitly not folded the way CH-02 folded three season routes into tabs. The distinction: CH-02 folded three *views of the same data* into one page's tabs. Announcements is a small CRUD surface, and an individual announcement is a thing you link someone to.
5. **Two design documents describe the commissioner-portal question as open** when ADR-095 closed it five days earlier, and this document closes the remainder. Both docs need a correction pass — the same defect class this project keeps finding elsewhere: a document asserting a state that no longer holds.

---

## 6. What Phase 6 inherits

- **26 screens** across 26 addresses (25 as first mapped, plus `…/announcements/[announcementId]/edit` — see §4's amendment), in the build order given by the rebuild spec §10.1: landing and auth → read-only → season core → league → commissioner surfaces. 24 are rebuilt by Plan 2; the bid page was built by Plan 1 Task 18.
- **Zero redirect obligations**, which is unusual and worth not squandering: any *further* IA change made during Phase 6 will owe one, because by then the screens will have been built against these addresses.
- **Both owed designs are settled** and drawn on the canvas: the merged role-gated payouts page (boards 5.1a/5.1b) and the league-scoped film page's not-found path (§7.4, board 2.3).

---

## 7. Routes changed after this map was approved (2026-08-23)

Decided on the Phase 6 design canvas, after the developer reviewed the addresses rather than the layouts. **The map is 25, not 23.**

### 7.1 `/` becomes a landing page; sign-in moves to `/login`

This **reverses ADR-121**, and legitimately. ADR-121 deleted `/login` because it rendered the identical `SignInPanel` as `/` — a duplicate. Under this change it is not a duplicate: `/` is a different page. Signed-in behaviour is unchanged (`resolveLandingPath`).

**It costs a re-point sweep, not a redirect** — `/login` was never a live URL, so nothing is owed.

**TABLE CORRECTED 2026-08-24, when Task 1.1 performed the sweep.** The first version of this table said *five things*, and its source was `src/app/page.tsx`'s own header comment. A comment can be stale, and this one was: the sweep found **nine** sites, and it named one of the five in the wrong file. Both defects are recorded rather than quietly fixed, because "the list came from a code comment" is the reason to re-derive rather than to trust.

**READ THE `Where` COLUMN AS THE PRE-SWEEP STATE, NOT AS CURRENT STATE** (noted 2026-08-25, Task 1.2 fix round 1). Every address in it — `/?error=oauth`, `/?error=link`, `landing.ts` returning `/`, and `SignInPanel`'s `AUTH_ERRORS` reading them — is what the site looked like BEFORE Task 1.1 re-pointed it. All nine target `/login` now, and `SignInPanel` is deleted: its error map lives in `src/app/(auth)/login/page.tsx`, which Task 1.2 built. The rows are the audit that produced the sweep, and rewriting them to their post-sweep values would turn the table into a list of sites pointing at `/login` that needed re-pointing to `/login`.

| What | Where | In the original five? |
|---|---|---|
| `requireUser` | `src/lib/auth.ts:36` | yes |
| Sign-out | `src/app/(auth)/actions.ts:192` | yes |
| The proxy's signed-out bounce | `src/infrastructure/clients/supabase-proxy.ts` — `PUBLIC_PATHS`, and `url.pathname` in `updateSession` | **filed as `src/proxy.ts`, which is wrong**: that file only sequences the two per-request steps and carries a comment. The bounce is one file down |
| The OAuth **callback** error path | `src/app/auth/callback/route.ts` | yes |
| The links on signup and forgot-password | `(auth)/signup/page.tsx`, `(auth)/forgot-password/page.tsx` | yes (two sites, one row) |
| The OAuth **start** error path | `src/app/(auth)/actions.ts:185` — `signInWithGoogle` redirects `/?error=oauth` when Supabase refuses to mint the provider URL | **no** — a second, separate site in the same file as sign-out |
| The dead-email-link path | `src/app/auth/confirm/route.ts:54` — `/?error=link`, read by `SignInPanel`'s `AUTH_ERRORS.link` | **no** |
| The unreadable-session fallback | `src/lib/landing.ts:237` — `landingPathForCurrentUser` returns `/` when `getUser()` comes back empty | **no** |
| **The baseline suite's fall-to-sign-in detector** | `scripts/baseline/route-smoke.mts:131-137` | **no**, and it is the one that breaks a gate rather than a link — see below |

**`/login` must also be added to `PUBLIC_PATHS`.** Without it the sign-in screen bounces to itself and is unreachable, which is a worse failure than a wrong destination.

**The detector moves with the route, and the trap is symmetric.** ADR-121's amendment changed `route-smoke.mts` *away* from `startsWith("/login")` to an exact match on `/` plus `/?`, because a naive `startsWith("/")` matches every redirect the suite makes and reports the whole app as broken. Reversing the route reverses that: `startsWith("/login")` is right again, and an exact match would now be the defect — the proxy's bounce carries `?next=`, so `redirectTarget === "/login"` would miss every real fall-through and report clean forever. Both directions are written into the file's own comment so the next move does not have to re-derive it.

`/how-it-works` survives, and the split is deliberate: the landing **sells**, how-it-works **explains**. `/leagues` links to `/how-it-works#faq`, so that anchor is load-bearing.

### 7.2 `/leagues/[leagueId]/settings` becomes a real route

This is the **second commissioner-only page**, which is exactly the condition §2 named as reopening "commissioner is a permission, not a place". Reopened deliberately; the answer holds, on a test worth keeping:

> **Configuration centralizes. Operations distribute.**

Configuration is changed rarely, applies broadly, and you go looking for it — it has no natural home on any one screen, so it needs an address. An operation acts on a specific object at a specific moment and is usually prompted; its home is next to the object, and giving it an address means having to remember to go there.

That test is also why §2.1's three-for-three against us does not transfer: what ESPN, Sleeper and Yahoo centralize is *configuration* — scoring rules, roster limits, playoff seeding.

The six commissioner powers split 4/2:

| Power | Kind | Home |
|---|---|---|
| Overdue-week queue | operational | strip on Season Home — **not a route** |
| Payouts draft / finalize | operational | `/seasons/[id]/payouts`, role-gated |
| Building a week's slate | operational | the week page |
| Starting a season | configuration, one-shot | `/leagues/[id]/seasons/new` |
| League identity + house rules | **configuration** | **`/leagues/[id]/settings`** |
| Member roles + invites | **configuration** | **`/leagues/[id]/settings`** |

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

### 7.5 Every address takes one shape (2026-08-28)

**Four renames, no redirects, because nothing is public yet.** `/home` → `/leagues` · `/league/*` → `/leagues/*` · `/season/*` → `/seasons/*` · `/join/[token]` → `/invites/[token]`. The count is still 25 and the nesting shape is unchanged: seasons stay top-level, weeks stay under seasons, `/bid` keeps its own address.

Five rules, and they are why:

1. **Collections are plural, items are the id inside them.** AIP-122: collection identifiers *must* be plural. Half this map already was; the other half was not.
2. **Nest only what a parent exclusively owns, and stop at two levels.** A season is exclusively a league's, but `/leagues/x/seasons/y/weeks/z/bid` is four levels of mostly-uuid; the documented escape is a top-level address for the deep resource, which is what `/seasons/[seasonId]` is.
3. **The league belongs in the path.** Clerk advises against tenant slugs in URLs *unless* links get shared, members belong to several tenants, and the tenant changes what the page means. This app is all three.
4. **`/` sells; the signed-in front door is a real address.** It is the league list, so it is `/leagues` — naming it `/home` gave the app two homes and invented a word the map does not otherwise use.
5. **URLs are typed and truncated by people.** Every truncation must land on a real page: chop `/bid` for the week board, the week for the season, the season for your leagues. Lowercase, hyphenated, permanent from launch (NN/g, *URL as UI*).

**This closes the window §7 opened.** From here the map's own rule stands: no further IA change without a redirect.
