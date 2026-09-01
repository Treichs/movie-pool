---
name: vercel
description: Deploying and operating Movie Pool on Vercel — which of the two projects is real, why `vercel ls --prod` will roll you back, how environment variables reach a running deployment, and how to prove a deploy landed. Use before any deploy, promotion, rollback, environment-variable change, or cron investigation. Triggers on "deploy", "push to production", "redeploy", "roll back", "set an env var", "is it live", "check the deployment", "cron".
---

# Deploying Movie Pool

## The CLI is not installed, and does not need to be

There is no global `vercel`. Use `npx --yes vercel@latest <cmd>`. The machine
already holds an authenticated `auth.json` (Roaming/xdg.data/com.vercel.cli), so
`whoami` returns `treichs` without a login. The **Vercel plugin is not the CLI** —
it ships MCP tools (deployments, logs, projects, protection) and a `vercel-cli`
skill that is documentation. Neither can read or write environment variables.
Only the CLI can.

## The project is `movie-pool-app`, and the name is a trap

It serves `https://www.moviepool.app`. The repo is `Treichs/movie-pool` and the
project is `movie-pool-app` — **they do not match, and reaching for the repo's
name is how the accident below happens.**

**`vercel link --yes --project <name>` CREATES the project when the name does
not exist.** It does not fail and it does not warn. On 2026-08-30 a
`--project movie-pool` created an empty second project; the next `env ls` then
truthfully reported "No Environment Variables found" — which reads exactly like
"production has no env vars", the wrong conclusion and the expensive one. The
decoy also built on every pull request and sorted ABOVE the real project in the
deployments API. It was deleted 2026-08-31.

**Run `vercel project ls` before linking.** The real project is the row with a
Latest Production URL.

## `vercel ls --prod` will roll production back if you trust it

It prints **bare URLs with no commit, no date and no dependable ordering**, and
the list still contains deployments from the RETIRED repo (`Treichs/movie_pool_app`,
branch `main`), which are marked `isRollbackCandidate` and look entirely
legitimate. On 2026-08-30 the top row was an old `movie_pool_app` design-system
build; redeploying it aliased ~10 minutes of stale code onto `www.moviepool.app`.

**Pick a deployment by commit SHA, never by list position.** Use the MCP
`list_deployments` (it returns `meta.githubCommitSha`, `githubCommitRef`,
`githubCommitRepo` and `created`) and match the SHA you intend to ship.

The same rule holds for GitHub's own deployments API, which is the cheapest way
to answer "what is live": `gh api repos/Treichs/movie-pool/deployments` returns
rows for **every** environment, so `.[0]` is as often a preview as production.
Always filter — and match on a PREFIX, never the full string:

```bash
gh api repos/Treichs/movie-pool/deployments \
  --jq '.[] | select(.environment | startswith("Production")) | {sha: .sha[0:7], created: .created_at}'
```

**The environment name is not stable.** Vercel labelled these
`Production – movie-pool-app` while two projects were connected to this repo and
plain `Production` from the moment the second was deleted (2026-08-31, observed
within the hour). The PR status check renamed itself the same way,
`Vercel – movie-pool-app` → `Vercel`, which silently matched nothing in a poll
written against the old name. Prefix-match both.

Production deploys from **`master` of `Treichs/movie-pool`**. Anything whose
`githubCommitRepo` is `movie_pool_app` is history and must never be promoted.

## One branch per change, cut off master

Merges here are **squash** merges, so master gets one new commit whose SHA the
branch has never seen. A branch kept alive across several of those diverges
from master *textually* while holding nothing master lacks — and then every new
PR from it conflicts, and its three-dot diff overstates wildly (52 files for a
5-file change, on 2026-08-31).

`frontend/rebuild-ground` lived through three squash merges before it was
deleted. **Do not resurrect a long-lived branch.** Cut a new one off master per
change and let the merge delete it:

```bash
git fetch origin && git checkout -b fix/<thing> origin/master
gh pr merge <n> --squash --delete-branch
```

If a branch has already diverged this way, the fix is a fresh branch off master
with the wanted commits cherry-picked — **not** a force-push. Check first that
nothing is lost: an empty `git diff origin/master origin/<branch>` means the
trees are identical and the branch is safe to delete.

### Squash is also what triggers the production deploy

The new SHA is not merely tidy history — it is the deploy. `--rebase` and
`--merge` replay a branch whose tree Vercel has **already built as the preview**,
and a push carrying a tree it has seen produces no production deployment. Nothing
fails: the PR merges, master advances, GitHub shows green, and production quietly
goes on serving the previous commit.

`gh pr merge 14 --rebase --delete-branch` on 2026-08-31 did exactly this.
Production stayed on `d56c82f` for fifteen minutes while master sat at `a4ba9a9`,
and the only build holding the new code was the branch preview with
`target: null`. It was caught by fetching the live CSS chunk and finding the old
type roles still in it — the deployments list alone would not have said so,
because it truthfully showed a READY deployment of the right commit.

**Always `--squash`.** If a merge has already landed another way, the recovery is
an explicit deploy of master, and it needs the scope flag — a bare
`vercel --prod` returns `Not authorized` here:

```bash
npx --yes vercel@latest --prod --yes --scope treichs1
```

That deploys the **local working tree**, so check `git status --porcelain
--untracked-files=no` is empty first and expect `gitDirty: 1` in the deployment
meta if anything untracked is lying around.

## Environment variables do not reach a running deployment

A variable added today does nothing to the deployment serving traffic. It is
picked up by the **next** deployment. So the order is always:

1. `vercel env add NAME production` — the value is read from **stdin**, so
   `printf 'on' | npx --yes vercel@latest env add EMAIL_MODE production` is
   non-interactive.
2. `vercel redeploy <url-of-the-deployment-built-from-the-commit-you-want>` —
   which rebuilds that commit with the current variables.

**Scope mail variables to Production only.** `EMAIL_MODE` on Preview would let a
pull-request deployment send real email to real people. Everything else in this
project is deliberately set on Preview *and* Production.

## Prove the deploy, do not trust "Ready"

"✓ Ready" and a green dashboard are true of the wrong commit too. Assert on
something in the response that **changed in this release**:

```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -s -H "Authorization: Bearer $SECRET" https://www.moviepool.app/api/cron/notify
```

`/api/cron/notify` is the best probe in the app: it returns its own counters and
its live `mode`, so one call tells you which build is serving *and* whether mail
is on. Also worth a look every time: `/` is 200 and `/leagues` is **307** — the
app gates itself, which is why this deployment needs no Vercel Authentication.

**When the secret is out of reach, diff the CSS.** That probe reads
`CRON_SECRET` out of `.env.local` and puts it in a header, which an agent
permission prompt can refuse — and a refused probe is no proof at all. The
stylesheet is public, immutable, and content-hashed, so it answers "which build
is serving" on its own:

```bash
curl -s https://www.moviepool.app/ | grep -oE '/_next/static/[^"]*\.css'
```

A changed hash means new CSS shipped; fetch the chunk and grep for a declaration
this release added or removed. On 2026-08-31 the old chunk still held twenty
`font-variation-settings` from the previous type roles, which is how a silently
skipped production deploy was caught. It proves nothing about server code, so
pair it with the cron probe whenever the secret *is* available.

A bad `Authorization` header needs no secret and is always worth sending: it must
come back **401**.

## Crons

`vercel.json` holds the schedules, but **Vercel is not the only caller**. The
pg_cron job `notify-sweep` hits the production URL hourly with the URL hardcoded
in the migration, so removing a `vercel.json` entry stops one of two schedulers
and looks like success. On Hobby a daily cron fires anywhere inside its
scheduled hour, which is why the two genuinely overlap and why every send
carries a Resend idempotency key.

A bad `CRON_SECRET` must return **401**. Check that alongside the happy path —
the guard used to compare against the literal string `Bearer undefined` when the
variable was unset.
