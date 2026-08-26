/*
 * The one definition of the migrations fingerprint, shared by the generator that
 * WRITES the stamp and the check that VERIFIES it.
 *
 * Deliberately one file rather than two matching implementations: a freshness
 * check whose hash function has drifted from the generator's reports stale
 * forever, which is the same class of always-wrong as a check that reports clean
 * forever.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const TYPES_FILE = "src/lib/supabase/database.types.ts";
export const MIGRATIONS_DIR = "supabase/migrations";
export const STAMP_PREFIX = "// @migrations-sha256 ";

/**
 * A sha256 over every migration's NAME and CONTENT, in filename order — so a
 * renamed migration counts as a change, and so the order Postgres applies them
 * in is the order that is hashed.
 */
export function migrationsFingerprint(root) {
  const dir = join(root, MIGRATIONS_DIR);
  if (!existsSync(dir)) return null;
  const h = createHash("sha256");
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    h.update(name);
    h.update("\0");
    // Normalised so a checkout under a different git autocrlf setting does not
    // read as a schema change. Windows is the primary shell here.
    h.update(readFileSync(join(dir, name), "utf8").replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex");
}

/** The stamp a generated types file carries, or null if it carries none. */
export function readStamp(text) {
  const m = text.match(/^\/\/ @migrations-sha256 ([0-9a-f]{64})\s*$/m);
  return m ? m[1] : null;
}
