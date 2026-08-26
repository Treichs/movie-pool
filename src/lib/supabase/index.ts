/**
 * The generated schema face. It sits BELOW domain and flows inward — the one
 * deliberate deviation from textbook onion architecture, taken so we do not
 * hand-write row-to-entity mappers for 22 tables.
 *
 * NOTHING HERE IMPORTS ANYTHING INTERNAL. That is enforced: the boundaries DAG
 * gives `infra-schema` a `disallow: { to: { element: { type: "*" } } }` policy.
 *
 * `Database` COMES FROM `./types`, NOT `./database.types` — a Task 5 review
 * fix. The raw generated `Database` in `database.types.ts` types every RPC
 * argument as non-null, which is a fabrication (see `types.ts`'s own header):
 * Postgres function arguments are always nullable, and six real call sites —
 * `update_avatar(null, null)` among them — pass `null` on purpose. `types.ts`
 * re-exports the SAME NAME `Database` widened to `| null` on every argument,
 * specifically so that importing "the obvious name" gets the correct type
 * rather than the naive one. Re-exporting the raw version here instead
 * silently un-shadowed it: this barrel briefly published a `Database` that
 * could not express `update_avatar(null, null)`, while `SupabaseClient` below
 * (also from `./types`) stayed bound to the correct, widened one — two
 * incompatible `Database` types under one name in the same directory. Only
 * `Database` moves; `Tables`, `Enums`, `TablesInsert`, `TablesUpdate` and
 * `Constants` still come from `./database.types` because the widening in
 * `./types` touches `Functions` only.
 */
export type { Database } from "./types";
export type { Tables, Enums, TablesInsert, TablesUpdate } from "./database.types";
export { Constants } from "./database.types";
export type { SupabaseClient } from "./types";
export { asEnum } from "./enums";
