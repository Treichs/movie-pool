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

/**
 * The invite picker's type-ahead — people who already have an account.
 *
 * Lives beside `searchAction` for the same reason: two routes call it (league
 * settings and the new-league wizard), and this is the segment both sit under.
 *
 * `leagueId` is OPTIONAL because the wizard has no league yet — it is "four
 * steps, one submit" on purpose. With one, the RPC gates on commissioner and
 * `alreadyMember` is real; without, it gates on signed-in and nothing is a
 * member yet. Both branches live in the RPC (20260831210000), not here.
 *
 * NEVER RETURNS AN EMAIL, and that is the point rather than an omission: the
 * RPC searches every profile, so exposing addresses would turn a name lookup
 * into an address harvester. Callers invite by `profileId` and
 * `create_league_invite` looks the address up server-side.
 */
export type InvitableProfile = {
  profileId: string;
  displayName: string;
  alreadyMember: boolean;
};

export async function searchInvitableAction(
  query: string,
  leagueId?: string,
): Promise<InvitableProfile[]> {
  if (typeof query !== "string" || query.trim().length < 3) return [];
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("search_invitable_profiles", {
    p_league_id: leagueId ?? null,
    p_query: query.trim(),
  });
  // A picker that silently shows nothing on an error is a picker that teaches
  // people the feature is broken. Logged here; the caller renders an empty
  // list, which is the only honest thing it can do with no rows.
  if (error) {
    console.error(`searchInvitableAction: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => ({
    profileId: r.profile_id,
    displayName: r.display_name,
    alreadyMember: r.already_member,
  }));
}
