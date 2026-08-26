import type { SupabaseClient } from "@/lib/supabase";
import { parsePeepParts, type PeepParts } from "@/lib/peep-atoms";

// Its own module rather than a second export from lib/peep, because that one
// imports node:fs to inline the SVG and is server-only by nature; this is a
// plain data read with no business dragging the filesystem in behind it.
// (getMyPeep, the numbered-peep predecessor of the reader below, was deleted
// 2026-08-09 — the dress-up builder superseded it and nothing called it.)

/** The caller's own dress-up composition, for the builder's initial state.
 *  Parsed against the atom manifests like every other reader — a stale slug
 *  surfaces as "no choice yet", not a broken builder. */
export async function getMyPeepParts(
  supabase: SupabaseClient,
  userId: string
): Promise<PeepParts | null> {
  const { data } = await supabase
    .from("profiles")
    .select("peep_parts")
    .eq("id", userId)
    .maybeSingle();
  return parsePeepParts((data as { peep_parts: unknown } | null)?.peep_parts);
}
