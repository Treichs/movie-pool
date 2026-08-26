/*
 * Runtime narrowing for the database's own enums, from the generated values.
 *
 * `Constants` ships in database.types.ts alongside the types, so the list of
 * legal `week_status` values is the one the schema actually has rather than one
 * a form remembered to keep in step. Kept OUT of types.ts deliberately: that
 * file is imported with `import type` everywhere and carries no runtime weight,
 * and this does.
 *
 * The two call sites that forced this are what the typed binding caught on its
 * first run — `add_league_member` and `update_season_status` were each handed
 * `String(formData.get(...))` straight into an enum parameter, so a hand-edited
 * form field reached Postgres and failed there, as a 500 rather than a message.
 */
import { Constants } from "./database.types";

import type { Database, Enum } from "./types";

type EnumName = keyof Database["public"]["Enums"];

/**
 * The value if the schema knows it, otherwise null. Callers decide what an
 * unknown value means — there is no safe default for a role or a status.
 */
export function asEnum<T extends EnumName>(name: T, value: unknown): Enum<T> | null {
  const legal = Constants.public.Enums[name] as readonly string[];
  return typeof value === "string" && legal.includes(value) ? (value as Enum<T>) : null;
}
