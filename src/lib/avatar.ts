import type { SupabaseClient } from "@/lib/supabase";
// Only the PURE palette module — R2 keeps the data layer out of UI components,
// which is the reason the palette and its types were split out of
// composed/player-avatar in the first place.
import { isGlyphKey, type AvatarChoice, type AvatarOverrides } from "@/lib/avatar-palette";
import { parsePeepParts, type PeepParts } from "@/lib/peep-atoms";

/** Profile id -> dress-up composition, for everyone who has built one. */
export type PeepPartsOverrides = Record<string, PeepParts>;

// ADR-050 read path: every chosen avatar the signed-in user can see, as a plain
// PROFILE ID -> choice map for the provider in the member layout.
//
// A SECURITY DEFINER RPC rather than a `profiles` select, because the set is
// "people I share a league with" — a join RLS does not express on profiles.
// The function returns ONLY rows carrying a choice, so this map is usually
// small or empty and a profile absent from it renders its derived avatar.
//
// KEYED BY ID SINCE ADR-082. It was keyed by display_name, which meant two
// members sharing a name shared a face — including the one who never chose it.
// The name is still returned, and lib/player-directory turns it back into a
// key for the call sites that carry no id, but only while it is unambiguous.

export async function getAvatarOverrides(
  supabase: SupabaseClient
): Promise<{ avatars: AvatarOverrides; peepParts: PeepPartsOverrides }> {
  const { data, error } = await supabase.rpc("get_avatar_overrides");
  // A failure here must never break the frame. Every avatar simply falls back
  // to derivation, which is what the whole app rendered before choices existed.
  if (error || !data) return { avatars: {}, peepParts: {} };

  const avatars: AvatarOverrides = {};
  const peepParts: PeepPartsOverrides = {};
  for (const row of data as {
    profile_id: string;
    avatar_pair: number | null;
    avatar_glyph: string | null;
    peep_parts: unknown;
  }[]) {
    // Both halves or neither — update_avatar enforces it, and a half-set row
    // would render a chosen colour with a derived glyph, which reads as a bug.
    if (
      row.avatar_pair !== null &&
      row.avatar_glyph !== null &&
      isGlyphKey(row.avatar_glyph)
    ) {
      avatars[row.profile_id] = { pair: row.avatar_pair, glyph: row.avatar_glyph };
    }
    // The dress-up composition rides the same RPC (2026-08-08). parsePeepParts
    // allowlists every slug against the atom manifests, so a bad row makes a
    // player DERIVED, never broken — the render path's standing rule.
    const parts = parsePeepParts(row.peep_parts);
    if (parts) peepParts[row.profile_id] = parts;
  }
  return { avatars, peepParts };
}

/** The caller's own choice, for the settings picker's initial state. */
export async function getMyAvatarChoice(
  supabase: SupabaseClient,
  userId: string
): Promise<AvatarChoice | null> {
  const { data } = await supabase
    .from("profiles")
    .select("avatar_pair, avatar_glyph")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { avatar_pair: number | null; avatar_glyph: string | null } | null;
  if (!row || row.avatar_pair === null || row.avatar_glyph === null) return null;
  if (!isGlyphKey(row.avatar_glyph)) return null;
  return { pair: row.avatar_pair, glyph: row.avatar_glyph };
}
