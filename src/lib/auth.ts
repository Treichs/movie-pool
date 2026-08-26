import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

import type { SupabaseClient } from "@/lib/supabase";

export type Profile = {
  id: string;
  display_name: string;
  email: string;
};

export type Membership = {
  id: string;
  role: "commissioner" | "player";
  season: {
    id: string;
    name: string;
    status: "draft" | "active" | "completed" | "archived";
  };
};

// Server-side gate for any page/action that needs a signed-in user.
// proxy.ts already bounces anonymous visitors, but per the Next.js data
// security guidance every server entry point re-checks for itself.
export async function requireUser(): Promise<{
  supabase: SupabaseClient;
  user: User;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // `/login` is the sign-in screen (ADR-435 restored it; `/` is the landing
  // page). The route-smoke gate keys on this destination to detect an
  // authenticated route falling through — see route-smoke.mts's `fellToLogin`.
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .eq("id", userId)
    .single();
  return data;
}

// updateOwnDisplayName WAS HERE, and it is gone rather than rewritten. It
// existed only to isolate the one sanctioned direct table write — phase 2's row
// policy plus `grant update (display_name)` — in a single reviewable place. The
// 20260819010000 migration replaced that write with update_display_name() and
// revoked the grant, so there is no exception left to isolate. The caller now
// calls the RPC exactly as it already called update_bio two functions further
// down the same file, which was the asymmetry that prompted the change.

// All season memberships for this user (RLS also lets members see their
// season-mates, so the explicit profile_id filter matters).
export async function getMemberships(
  supabase: SupabaseClient,
  userId: string
): Promise<Membership[]> {
  // season:v_seasons — the ADR-099 read model. The season's name is derived
  // (rank by earliest week), and the view is the ONE place that derivation
  // lives; PostgREST resolves the embed through the view's base-table FK.
  const { data } = await supabase
    .from("season_members")
    .select("id, role, season:v_seasons(id, name, status)")
    .eq("profile_id", userId);
  return (data ?? []) as unknown as Membership[];
}

// Season-scoped gate for /season/[seasonId]/** player pages: any member of
// THIS season (commissioner included — ADR-006, the commissioner also plays),
// else back to the dashboard. RLS re-enforces at the database layer.
export async function requireMemberOf(seasonId: string): Promise<{
  supabase: SupabaseClient;
  user: User;
  membership: Membership;
}> {
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships(supabase, user.id);
  const membership = memberships.find((m) => m.season.id === seasonId);
  if (!membership) redirect("/home");
  return { supabase, user, membership };
}

// Season-scoped gate for /commish/[seasonId]/** pages: the caller must be
// signed in AND commissioner of THIS season, else back to the dashboard.
// RLS + the RPCs re-enforce this at the database layer regardless.
export async function requireCommissionerOf(seasonId: string): Promise<{
  supabase: SupabaseClient;
  user: User;
  membership: Membership;
}> {
  const { supabase, user } = await requireUser();
  const memberships = await getMemberships(supabase, user.id);
  const membership = memberships.find(
    (m) => m.season.id === seasonId && m.role === "commissioner"
  );
  if (!membership) redirect("/home");
  return { supabase, user, membership };
}

// LEAGUE-scoped commissioner gate, for the commissioner surfaces that belong to
// the league rather than to one of its seasons (2026-08-04).
//
// The portal moved under /league/[id] because that is what it actually
// commissions: rules are the league's (ADR-059), members are the league's, and
// a commissioner is a league role (ADR-016) — the season-scoped gate would have
// asked the wrong question and, worse, would have gone missing in the gap
// between seasons, which is precisely when a league still needs administering.
//
// Read straight off league_members rather than through getLeagueRoster: a gate
// wants one row for one caller, not the whole roster, and RLS returns nothing
// for a league the caller does not belong to either way.
export async function requireCommissionerOfLeague(leagueId: string): Promise<{
  supabase: SupabaseClient;
  user: User;
}> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("league_members")
    .select("role")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();
  if ((data as { role: string } | null)?.role !== "commissioner") redirect("/home");
  return { supabase, user };
}

/** Display name + email for the settings page. Same L1 rule as everywhere:
 *  the page composes, the data layer queries. */
export async function getAccount(
  supabase: SupabaseClient,
  userId: string
): Promise<{ display_name: string | null; email: string | null } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();
  return (data as { display_name: string | null; email: string | null }) ?? null;
}
