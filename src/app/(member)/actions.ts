"use server";

import { requireUser } from "@/lib/auth";
import { search, EMPTY_RESULTS, type SearchResults } from "@/lib/search";

/**
 * The shell's search, called from the command palette as the viewer types.
 *
 * ── WHY AN ACTION AND NOT A ROUTE HANDLER ─────────────────────────────────
 * The route set is settled at 26 pages plus 4 route handlers, and a search
 * endpoint is not one of them. An action adds no address: it is a POST to the
 * page the viewer is already on.
 *
 * ── IT IS A READ, IN A FILE FULL OF WRITES ────────────────────────────────
 * Every other `actions.ts` in this app holds mutations, so this one is worth a
 * sentence. Reads live in `src/lib/` and this one still does — `lib/search`
 * holds the queries. What lives here is only the part that has to be callable
 * from a browser, and it does the two things any entry point owes: it gates,
 * then it hands the AUTHENTICATED client to the composer, so RLS scopes every
 * row to the person who asked. There is no `revalidatePath` because nothing
 * changed.
 */
export async function searchAction(query: string): Promise<SearchResults> {
  if (typeof query !== "string") return EMPTY_RESULTS;
  const { supabase } = await requireUser();
  return search(supabase, query);
}
