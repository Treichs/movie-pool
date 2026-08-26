/*
 * Regenerate src/lib/supabase/database.types.ts from the hosted schema.
 *
 *   npm run types:gen
 *
 * ADR-416 gate 1 rule 1 — every external name is generated, never typed. Before
 * this existed, 18 table names and 55 RPC names were hand-typed strings in an
 * app whose money and standings are derived in SQL, so a renamed column surfaced
 * as a wrong number rather than as a red build.
 *
 * THE STAMP IS THE POINT, and it is why this is a script rather than a one-line
 * `supabase gen types > file` in package.json. A generated-and-committed file
 * rots silently: nothing about a stale one looks stale. So this appends a
 * fingerprint of supabase/migrations/ to the output, and scripts/governance/
 * check-db-types.mjs recomputes it on every governance run. Add a migration
 * without regenerating and the gate says so.
 *
 * WHAT THE STAMP CANNOT SEE, stated plainly rather than left to be discovered.
 * It fingerprints the migration FILES, not the database. A schema change made in
 * the dashboard, or a migration pushed and then edited, leaves the stamp fresh
 * and the types wrong. The migrations directory is the only offline source of
 * truth available — a live check would need network and a token on every
 * governance run, which is not a gate, it is a flake.
 *
 * Requires SUPABASE_ACCESS_TOKEN (the npm script supplies it from .env.local)
 * and derives the project ref from NEXT_PUBLIC_SUPABASE_URL rather than from a
 * second variable that could disagree with it.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { migrationsFingerprint, STAMP_PREFIX, TYPES_FILE } from "./types-stamp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, TYPES_FILE);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url) {
  console.error("types:gen — NEXT_PUBLIC_SUPABASE_URL is not set. Run through `npm run types:gen`, which reads .env.local.");
  process.exit(2);
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("types:gen — SUPABASE_ACCESS_TOKEN is not set. It is a personal access token from supabase.com/dashboard/account/tokens, and it belongs in .env.local.");
  process.exit(2);
}

const ref = new URL(url).hostname.split(".")[0];
if (!/^[a-z]{20}$/.test(ref)) {
  console.error(`types:gen — could not read a project ref out of NEXT_PUBLIC_SUPABASE_URL (got "${ref}").`);
  process.exit(2);
}

console.log(`types:gen — generating from project ${ref}…`);
// ONE command string through a shell, on every platform. Node refuses to spawn
// a .cmd shim directly since CVE-2024-27980 and npx IS a .cmd on Windows, which
// is the primary shell here; passing an args array alongside shell:true then
// earns a deprecation warning because the args are concatenated unescaped. The
// ref is the only interpolated value and it has already been matched against
// /^[a-z]{20}$/ above, so there is nothing to escape.
const r = spawnSync(
  `npx --yes supabase gen types typescript --project-id ${ref} --schema public`,
  { encoding: "utf8", cwd: ROOT, shell: true }
);

if (r.error || r.status !== 0 || !r.stdout?.includes("export type Database")) {
  console.error("types:gen — the Supabase CLI did not return a schema.");
  console.error(r.error?.message ?? r.stderr ?? r.stdout ?? "(no output)");
  process.exit(2);
}

const fingerprint = migrationsFingerprint(ROOT);
const header = [
  "// GENERATED FILE — do not edit. Regenerate with `npm run types:gen`.",
  "//",
  "// The schema this project's client is bound to (ADR-416 gate 1 rule 1). Import",
  "// it through @/lib/supabase, never from here directly: that module is",
  "// where RPC argument nullability is corrected, and it explains why.",
  "//",
  "// The trailing stamp fingerprints supabase/migrations/ at generation time.",
  "// scripts/governance/check-db-types.mjs recomputes it, so a migration added",
  "// without regenerating fails the build instead of rotting quietly.",
  "",
].join("\n");

const previous = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
writeFileSync(OUT, `${header}${r.stdout.trimEnd()}\n\n${STAMP_PREFIX}${fingerprint}\n`, "utf8");

const body = (t) => t.replace(/^\/\/.*$/gm, "").trim();
console.log(
  body(previous) === body(readFileSync(OUT, "utf8"))
    ? `types:gen — schema unchanged; stamp refreshed to ${fingerprint.slice(0, 12)}…`
    : `types:gen — wrote ${TYPES_FILE}, stamped ${fingerprint.slice(0, 12)}…`
);
