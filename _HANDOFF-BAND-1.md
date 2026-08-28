# Handoff — finish Band 1 (auth)

Read `CLAUDE.md` first. `_HANDOFF.md` is the original four-task brief and is
**complete**; this file replaces it.

## Where things stand

`npm run verify` is green with all five checks. Built and driven in a browser:

- **Tasks 1–4 of `_HANDOFF.md`** — components, data layer, six route handlers,
  and the bid page.
- **Task 1.2 `/login`** — the first Band 1 screen. Sign-in completes, `?next=`
  rides both forms, `?error=oauth` and `?error=link` render.

Routes that exist: `/`(starter), the six handlers, `/login`, and
`/season/[seasonId]/weeks/[weekId]/bid`.

## What is left in Band 1

Four tasks, in `Docs/rebuild-phase-6.md`. **Read each task's `Board:` line** —
band 1's board numbers run one behind its task numbers.

| Task | Route | Board |
|---|---|---|
| 1.1 | `/` — landing page (NEW) | `0.1` |
| 1.3 | `/signup` | `1.2` |
| 1.4 | `/forgot-password` (+ sent state) | `1.3` / `1.3b` |
| 1.5 | `/reset-password` | `1.4` |

Do them one at a time. `npm run verify` and drive each in a browser before
starting the next.

## What is already in place for them

**The shell.** `src/components/auth-split-shell.tsx` has both variants:
`field` (two columns, an `ink` slot, `inkLayout="cell" | "strip"`) and `rail`
(a perforated strip, no slot — passing `ink` to it is a compile error).
**`/signup` takes `inkLayout="strip"`; 1.4 and 1.5 take `variant="rail"`.**

**The actions.** `src/app/(auth)/actions.ts` is ported whole and already
exports everything the remaining screens need, currently unused:
`signUp`, `resendConfirmation`, `requestPasswordReset`, `completePasswordReset`.
Do not rewrite them.

**Shared form pieces**, in `src/components/`: `password-input` (built on
`ui/input-group`), `submit-button` (reads `useFormStatus`), `google-mark`.

**The pattern to copy** is `src/app/(auth)/login/` — `page.tsx`,
`sign-in-form.tsx`, `sign-in-ink.tsx`, `error.tsx`. Its page comment explains
why `<main>` wraps the whole shell rather than the form.

## Task 1.1 is smaller than it reads, and it has one addition

The task is written assuming `/login` does not exist yet — it was meant to run
first and perform the re-point sweep. **That order flipped: `/login` is built.**

**Steps 2, 3 and 6 are already done.** All nine references point at `/login`
(`lib/auth.ts:37`, `lib/landing.ts:239`, `(auth)/actions.ts:201,211`,
`auth/callback/route.ts:53`, `auth/confirm/route.ts:54`, and three in
`lib/supabase/proxy.ts`), and `git grep 'redirect("/")'` returns nothing. The
old repo had already completed that sweep before those files were ported.
Verify rather than trust this, then skip those steps. Step 8's note — "`/login`
does not exist yet, so the Sign in link 404s" — no longer applies; it works.

So the real work is Step 4 (rewrite `src/app/page.tsx`), Step 5 (root
`error.tsx`), and the board's four beats in `src/app/_components/`.

**THE ADDITION, and it is not in the task.** `src/proxy.ts` was never ported.
`src/lib/supabase/proxy.ts` holds `updateSession` — the public-path list, the
signed-out bounce to `/login`, the `?next=` capture — but **nothing calls it**,
because Next 16's entry point is a root `src/proxy.ts` (the renamed
`middleware.ts`) and that file does not exist here. Today that means no session
refresh per request, no bounce for signed-out visitors, and no last-league
cookie. It is not a security hole — RLS and each page's own gate still hold,
which is why the bid page behaves correctly — but the bounce a landing page
implies is missing. Port it from `C:\Dev\Git\movie_pool_app\src\proxy.ts`
as part of this task; it is 30 lines, and its imports become
`@/lib/supabase/proxy` and `@/lib/landing`. Drive a signed-out visit to a
protected route afterwards and confirm you land on `/login?next=...`.

## Things that will cost you an hour if you rediscover them

**A class naming a deleted token is silent at every gate.** `globals.css` sets
`--color-*: initial`, which removes Tailwind's stock palette — so `bg-black/30`,
`bg-white/[.08]` and `bg-surface-secondary` all emit **no CSS**, compile, lint,
build, and pass `a11y:contrast`. Four instances have been found this way, one of
them written after the pattern was already named. **Look at the pixels.**

**Registry blocks are read, not installed, when they touch a modified file.**
`@shadcn/login-02` and the `product-card*` blocks all want to overwrite
`src/lib/utils.ts` (our `cn` carries a tailwind-merge extension) or
`ui/button.tsx` (our `ink` variant). `~ overwrite` in a dry run means "differs
from the registry copy" — those are exactly the files you have customised. The
prompt defaults to No and `-y` does not bypass it; only `-o` does.

**`@reui` auth blocks are license-gated** — they 401 without a key. `@reui/frame`
is free. `@shadcnblocks` works if you export `SHADCNBLOCKS_API_KEY` from
`.env.local` first.

**There is no `/home` yet.** `resolveLandingPath` and `signOut` both target
routes Band 3/4 build, so a completed sign-in legitimately lands on a 404. That
is not a bug in your screen.

**To sign in while testing**, there is no seeded dev password in the repo. The
`mp-*@moviepool.test` fixtures use the password in
`C:\Dev\Git\movie_pool_app\scripts\pool-replica.mts`. A throwaway route that
signs one in is fine — delete it before you finish, and never commit it.

**Never `npm run build` while `npm run dev` is running** — it corrupts the dev
server's chunks. Use a second port for driving (`npx next dev -p 3100`).

## Two ratchets you may need to raise

Both in `scripts/a11y/contrast.mjs`, both with their reasoning in the file:

- `MIN_PAIRS` is **141**. It rises as screens put more tokens into use. Raise it
  in the same commit as the screen that raises the count.
- `MIN_STACK_DEPTH` is **1**. Raise it to 2 the first time a screen renders a
  tinted panel inside a tinted panel.

## Not done, and deliberately

- The bid page's `PosterCard` takes an optional `href` that is **unset** —
  its destination is `/league/[leagueId]/films/[tmdbId]`, a Band 2 route. Pass
  it when that lands.
- The commissioner strip on the bid page ships with "Close bidding" only. The
  "Week settings" disclosure needs `CommishFormState` and the Band 5
  commissioner surface.
- `@reui/frame` is installed and unused. It was mocked up holding the bid slate
  with the running total in `FrameFooter`; the sticky bar was kept instead
  because a footer scrolls away on a long slate.
- Chris has refinement notes coming on the bid page and its components.

## The design boards

- Bid page + poster card decisions: the poster card is **variant A (bid tile)
  on the slate, variant B (catalog tile) everywhere else**.
- The canvas has no board for the bid page — its own Band 3 note says
  "its board is the app itself".
