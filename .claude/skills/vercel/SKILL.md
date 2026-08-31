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

## There are TWO Vercel projects and only one is real

| project | what it is |
| --- | --- |
| `movie-pool-app` | **the live one.** Serves `https://www.moviepool.app`. |
| `movie-pool` | an empty decoy created 2026-08-30 by a careless `vercel link`. |

**`vercel link --yes --project <name>` CREATES the project when the name does
not exist.** It does not fail, it does not warn, and the next `env ls` then
truthfully reports "No Environment Variables found" for a project that has never
served anything. That reads exactly like "production has no env vars", which is
the wrong conclusion and the expensive one. Verify with `vercel project ls`
first — the real project is the row with a Latest Production URL.

## `vercel ls --prod` will roll production back if you trust it

It prints **bare URLs with no commit, no date and no dependable ordering**, and
the list still contains deployments from the RETIRED repo (`Treichs/movie_pool_app`,
branch `main`), which are marked `isRollbackCandidate` and look entirely
legitimate. On 2026-08-30 the top row was an old `movie_pool_app` design-system
build; redeploying it aliased ~10 minutes of stale code onto `www.moviepool.app`.

**Pick a deployment by commit SHA, never by list position.** Use the MCP
`list_deployments` (it returns `meta.githubCommitSha`, `githubCommitRef`,
`githubCommitRepo` and `created`) and match the SHA you intend to ship.

Production deploys from **`master` of `Treichs/movie-pool`**. Anything whose
`githubCommitRepo` is `movie_pool_app` is history and must never be promoted.

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
