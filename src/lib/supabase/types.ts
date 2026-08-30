/*
 * The typed binding of the Supabase client — ADR-416 gate 1 rule 1, "every
 * external name is generated, never typed".
 *
 * `database.types.ts` next to this file is GENERATED (`npm run types:gen`) and
 * committed; nothing hand-edits it. Everything else imports the client through
 * HERE, so the schema reaches every `.from()` and `.rpc()` call site without 30
 * files each remembering to pass the generic.
 *
 * WHY THIS RE-EXPORTS THE NAME `SupabaseClient` RATHER THAN INVENTING ONE.
 * The unbound `SupabaseClient` from "@supabase/supabase-js" accepts any table
 * name and any RPC name and returns `any` — it is not a weaker version of this
 * type, it is the absence of the check. Shadowing the name means the bound one
 * is what a file gets by reaching for the obvious import, and the unbound one
 * has to be asked for by its origin. That asymmetry is the point: it turns
 * "someone forgot the generic" into "someone imported from the wrong module",
 * which is a grep rather than an inspection.
 *
 * WHY RPC ARGUMENTS ARE WIDENED WITH `| null`, which is the one place this file
 * disagrees with the generated output. A Postgres function argument is ALWAYS
 * nullable — nullability is not part of a parameter's declared type, and no
 * catalog column records whether a body tolerates NULL. The generator therefore
 * cannot know, and emits the non-null type. That is a fabrication rather than a
 * fact, and this repo has call sites that prove it: `set_week_bid_deadline(week,
 * null)` IS "fall back to the league default", not a missing argument.
 *
 * Narrowing them to satisfy the generated type would mean either casting at
 * those sites — suppressing every future real error there along with this fake
 * one — or omitting the key, which is NOT the same request: PostgREST applies
 * the SQL DEFAULT for an omitted argument and passes NULL for an explicit one,
 * and those differ for every parameter whose default is not itself null.
 *
 * The widening is deliberately narrow. It touches argument nullability and
 * nothing else: names, return types, table names, column names and enum unions
 * all stay exactly as generated, and those are what the gate is for.
 */
import type { SupabaseClient as UnboundSupabaseClient } from "@supabase/supabase-js";

import type { Database as GeneratedDatabase } from "./database.types";

type PublicSchema = GeneratedDatabase["public"];

type NullableArgs<F> = {
  [Fn in keyof F]: Omit<F[Fn], "Args"> & {
    Args: F[Fn] extends { Args: infer A } ? { [P in keyof A]: A[P] | null } : never;
  };
};

/** This project's schema, with RPC arguments as nullable as Postgres makes them. */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<PublicSchema, "Functions"> & {
    Functions: NullableArgs<PublicSchema["Functions"]>;
  };
};

/** A Supabase client that knows this project's schema. */
export type SupabaseClient = UnboundSupabaseClient<Database>;

/** A row as it is READ back — `Row<"bids">`. */
export type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

/** A database enum's union — `Enum<"week_status">`. */
export type Enum<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
