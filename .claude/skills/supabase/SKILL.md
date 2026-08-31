---
name: supabase
description: Working the Movie Pool database — how to apply a migration without corrupting migration history, the repair that the CLI's own error message only half describes, the schema facts that make queries fail, and how to drive fixture data safely. Use before writing or pushing a migration, regenerating types, querying the live database, or changing dev fixtures. Triggers on "migration", "db push", "types:gen", "RPC", "RLS", "query the database", "seed", "fixture".
---

# The database

## Apply migrations with the CLI, not the MCP

Both work. Only one keeps history straight.

`mcp__claude_ai_Supabase__apply_migration` **stamps its own timestamp** into
`supabase_migrations.schema_migrations` instead of the local filename's. The
divergence is silent until the next `npx supabase db push`, which then fails
with **"Remote migration versions not found in local migrations directory"** and
names versions nobody wrote.

So: write the file into `supabase/migrations/`, then
`npx supabase db push --dry-run`, then `npx supabase db push`.

### Repairing the drift, both halves

The CLI's error suggests only the first command. **Running only the first
re-runs every repaired migration against live data.** Both are required, in
this order:

```bash
npx supabase migration repair --status reverted <the MCP-stamped versions>
npx supabase migration repair --status applied  <the real local filenames>
```

Diagnose it first by comparing `supabase_migrations.schema_migrations` against
the filenames: same names, different versions, one-to-one, order preserved is
the signature of MCP drift rather than a genuinely missing migration.

**After every push, `npm run types:gen`.** `types:fresh` fingerprints
`supabase/migrations/` against the generated file, so a pushed migration with no
regeneration is a red build instead of a wrong number at runtime.

## Schema facts that make a query fail

- **`seasons` has no `name` column.** A season's name lives in `v_seasons`.
  Joining `leagues` and selecting `s.name` gets you the league's name or an
  error, depending on the alias.
- **Enum columns need `::text`** before `string_agg` and friends —
  `status::text`, not `status`.
- **PostgREST nulls an embed rather than dropping the parent row.** A filter on
  an embedded resource (`.eq("profile.notify_x", true)`) returns the parent with
  `profile: null` unless you write `profiles!inner(...)`. A `.filter()` in JS
  afterwards hides this by accident, after fetching what it throws away.
- **`profiles.email` is written by a trigger on `auth.users`**, and only when the
  auth email changes. Updating `profiles.email` directly is therefore safe and
  survives a re-seed — which is how the email paths get driven against a real
  inbox. Login still uses the `auth.users` address.

## Writes go through RPCs; the service role is for reads

Every write is a `SECURITY DEFINER` RPC. A service-role client appears only
where no user-facing policy could grant the read — the cron sweeps, and the
payouts statement, which needs member email addresses that no member may read
about another. Elevating the read is the exception; elevating a write is not
done at all.

**Authz precedes the fetch.** Every `src/lib` composer takes an authenticated
context and gates before it reads.

## The email ledger is the thing that prevents disasters

`email_log` is an outbox, not a log. A **suppressed** send (mail switched off)
is recorded as `status = 'sent'` with the reason in the free-text `error`
column, because the dedupe reads `status = 'sent'`. That row is what stops
turning `EMAIL_MODE` back on from mailing every week the switch slept through —
the 2026-08-12 replica ingest made ~1,260 attempted sends before this existed.

A `'failed'` row is genuinely retried next run. **Suppression is not failure and
must never be recorded as one.**

Before switching mail on, count what would actually go out — candidates minus
the ledger. Mind operator precedence: `A and B or C and NOT EXISTS(...)` binds
the dedupe to one branch only and will overstate the blast radius.

## Fixtures

`npm run seed:dev` is idempotent and is the sanctioned way to reset state — it
does its own settlement cleanup, so reach for it rather than hand-deleting rows.

- **Dev Closing Credits** is deliberately left **completed and unsettled**: it
  is the fixture for driving Generate / Regenerate / Finalize and the payouts
  statement. Re-running the seed returns it to unsettled; it does **not** clear
  `email_log`, so clear the season's rows separately when re-driving a send.
- **Dev Edge Cases** carries the three week states nothing else reaches — a tie
  at the cut, a removed film, a skipped week.
- Passwords are printed by the seed.

Anything the drive writes to the shared dev database gets cleaned up. Throwaway
scripts go in the repo root or `scripts/.tmp-*.mjs` so they resolve
`@supabase/supabase-js`, are run with `node --env-file=.env.local`, and are
deleted afterwards.

**The replica league holds real people's names and addresses.** Never finalize,
mail, or otherwise act on it to make a test pass.
