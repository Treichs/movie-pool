---
name: ui-review
description: The standard browser drive for Movie Pool UI work — run the app, sign in with the seed:dev fixtures, capture at 1440x900 with Playwright MCP, check the console, and report with evidence. Use after building or changing any page, component or style, and to satisfy condition 7 of a screen task. Triggers on "review the UI", "check how it looks", "screenshot it", "did it render", "visual check", "drive the page", "verify the screen".
---

# The drive

Condition 7 of every screen task: **the screen has been driven in a browser at
1440x900**. This skill is that drive, and it owns the app mechanics too — the
companion `verify` skill it used to defer to is folded in below.

## Before the browser

- `npm run dev` -> http://localhost:3000. **A dev server that predates your new
  files is stale**: it throws "Jest worker encountered N child process
  exceptions" 500s. Kill the PID it prints and restart. That is server rot, not
  an app bug. Next also refuses a second instance for the same directory.
- **Never `npm run build` while `npm run dev` is running** — it corrupts the dev
  server's chunks and every route 500s. Drive on a second port instead:
  `npx next dev -p 3100`.
- **CSS-edit rot (Turbopack persistent cache).** Edits to `globals.css` can
  silently never reach the browser: TSX hot-reloads fine while the served CSS
  chunk stays stale, and a plain restart does NOT fix it. Kill the server,
  `Remove-Item -Recurse -Force .next`, restart. Diagnose by fetching the page's
  stylesheet link and searching it for your new selector.
- **Sign in with the fixtures** created by `npm run seed:dev`:
  `dev-commish@moviepool.local` (commissioner), `dev-player@moviepool.local`
  (player), `dev-outsider@moviepool.local` (no season), password
  `dev-Passw0rd!`. Pick the role the screen is for. The seed is idempotent —
  re-run it rather than hand-making data, and its open week carries a
  `bid_deadline` three hours out so the countdown has something to count to.

## Browser facts

Playwright MCP here is the user-scope `--isolated` registration: **every session
starts a fresh signed-out browser** and nothing persists when it closes. Sign in
each session. Run artifacts land in `.playwright-mcp/` — gitignored, throwaway,
delete what you generate.

**fullPage screenshots paint sticky elements at the CURRENT scroll offset.**
Capture after anything that scrolled — a click, or a failed locator that
auto-scrolled — and the sticky bar appears mid-page over the content with a
blank band above it. That is a stitching artifact, not an app bug (verified
2026-08-16 by reproducing it both ways on one page). `window.scrollTo(0, 0)`
before every fullPage capture.

## The loop, per screen

1. **Resize first:** `browser_resize` -> 1440x900. Resizing after navigation
   re-lays-out mid-capture.
2. **Navigate**, then `browser_wait_for` a beat so React settles.
3. **Screenshot.**
4. **Console:** `browser_console_messages`, error level. **Zero is the bar**; a
   favicon 404 is the only known benign noise.
5. **Landmarks and labels, by hand.** Exactly one `<main>`, every control with
   an accessible name. This repo has no rendered-page axe, so this bullet is
   manual by necessity — nothing else in the gate asserts a landmark exists.
6. **Interact if the change is behavioral.** Re-snapshot before every click
   (refs churn across re-renders) and verify the *effect* — an attribute, the
   text, the URL. Never trust the click. `window.confirm` buttons need
   `browser_handle_dialog`.
7. **Then do it again at 390x844.** Ruling 78 deferred this for the whole of
   Phase 6 and was lifted 2026-08-31, so the phone pass is no longer conditional
   — resize, re-navigate, re-screenshot, re-check the console. What to look for
   that desktop cannot show you: horizontal page scroll
   (`scrollWidth > clientWidth` on `documentElement` — the page body must never
   pan, though a table inside its own `overflow-x-auto` may), touch targets
   under 44px, a control that only had a hover state, and text that overflows
   rather than wraps. Those are layout defects, reported with the rest.

## Judging

- **Broken beats ugly.** A blank screen or a console error is reported first;
  aesthetic notes come after.
- **Look at the pixels, not the build.** `globals.css` sets `--color-*: initial`,
  which deletes Tailwind's stock palette — so `bg-black/30`, `bg-white/[.08]`
  and any invented token name emit **no CSS at all** and pass typecheck, lint,
  build and `a11y:contrast` in silence. Four have been caught this way, only by
  looking. A flat or missing panel is the symptom.
- Style is judged against the vendored stack: shadcn and registry code in
  `src/components/ui/` and `src/components/reui/`, route-private pieces in the
  segment's `_components/`. A hand-rolled visual where a primitive exists is a
  finding.

## Reporting

Give the screenshot, findings ordered by severity, and — explicitly — **what was
not driven**: roles you did not sign in as, states with no fixture, branches not
reachable. Clean up anything the drive wrote to the shared dev database; name
test data distinctively (e.g. "UI Test Season") and delete it with a service-key
one-liner run from inside the repo (`node --env-file=.env.local`, dropped in
`scripts/.tmp-*.mjs`, deleted after) so it can resolve `@supabase/supabase-js`.

## One React 19 gotcha that reads as a bug

Uncontrolled form fields **reset after a server-action submit**. Following a
failed validation the form shows its defaults again; re-fill before retrying.
