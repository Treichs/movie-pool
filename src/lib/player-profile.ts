import type { SupabaseClient } from "@/lib/supabase";
import { isGlyphKey, type AvatarChoice } from "@/lib/avatar-palette";
import { parsePeepParts, type PeepParts } from "@/lib/peep-atoms";
import {
  buildPlayerDirectory,
  EMPTY_DIRECTORY,
  type PlayerDirectory,
} from "@/lib/player-directory";

// The player profile page's data. Everything comes from one SECURITY DEFINER
// RPC because the page crosses RLS in a controlled way: it reads another
// person's season results, but only for leagues the VIEWER also belongs to.
// Doing that with table selects would mean widening policies; doing it in one
// function keeps the rule in a single place that the spike can pin.

export type PlayerProfile = {
  profileId: string;
  displayName: string;
  bio: string | null;
  /** ADR-050 chosen avatar; null means it is still derived from the name. */
  avatar: AvatarChoice | null;
  /** The dress-up composition — the profile page's full figure and every
   *  avatar circle. Parsed against the atom manifests, so a stale slug reads as
   *  "no composition" and derivation takes over rather than the page breaking.
   *  Null simply means derived: since the 24 templates were retired
   *  (2026-08-09) there is no third state. */
  peepParts: PeepParts | null;
  memberSince: string;
  isMe: boolean;
  seasonsPlayed: number;
  totalPoints: number;
  totalSpent: number;
  filmsOwned: number;
  /** Best finishing position in a COMPLETED season; null if none finished. */
  bestFinish: number | null;
  seasonsWon: number;
  sharedLeagues: string[];
};

/** Null when the player does not exist or shares no league with the viewer —
 *  the RPC deliberately does not distinguish the two. */
export async function getPlayerProfile(
  supabase: SupabaseClient,
  profileId: string
): Promise<PlayerProfile | null> {
  const { data, error } = await supabase.rpc("get_player_profile", {
    p_profile_id: profileId,
  });
  if (error || !data) return null;

  const row = (
    data as {
      profile_id: string;
      display_name: string;
      bio: string | null;
      avatar_pair: number | null;
      avatar_glyph: string | null;
      peep_parts: unknown;
      member_since: string;
      is_me: boolean;
      seasons_played: number;
      total_points: number | string;
      total_spent: number | string;
      films_owned: number;
      best_finish: number | null;
      seasons_won: number;
      shared_leagues: string[];
    }[]
  )[0];
  if (!row) return null;

  return {
    profileId: row.profile_id,
    displayName: row.display_name,
    bio: row.bio,
    avatar:
      row.avatar_pair !== null &&
      row.avatar_glyph !== null &&
      isGlyphKey(row.avatar_glyph)
        ? { pair: row.avatar_pair, glyph: row.avatar_glyph }
        : null,
    peepParts: parsePeepParts(row.peep_parts),
    memberSince: row.member_since,
    isMe: row.is_me,
    seasonsPlayed: Number(row.seasons_played),
    totalPoints: Number(row.total_points),
    totalSpent: Number(row.total_spent),
    filmsOwned: Number(row.films_owned),
    bestFinish: row.best_finish === null ? null : Number(row.best_finish),
    seasonsWon: Number(row.seasons_won),
    sharedLeagues: row.shared_leagues ?? [],
  };
}

/** One season of a player's history, for the profile's per-season table. */
export type PlayerSeason = {
  seasonId: string;
  seasonName: string;
  leagueName: string;
  status: "draft" | "active" | "completed" | "archived";
  points: number;
  spent: number;
  filmsOwned: number;
  /** Dense place within the season — "so far" while the season is live. */
  place: number;
  playerCount: number;
};

/**
 * Season-by-season results behind the profile card (2026-08-08). Same
 * SECURITY DEFINER visibility rule as get_player_profile — only seasons in
 * leagues the VIEWER also belongs to — enforced in the RPC itself, so this
 * reader stays a straight mapping. Empty on error for the same reason the
 * profile returns null: the page treats "no such player" and "nothing shared"
 * identically on purpose.
 */
export async function getPlayerSeasons(
  supabase: SupabaseClient,
  profileId: string
): Promise<PlayerSeason[]> {
  const { data, error } = await supabase.rpc("get_player_seasons", {
    p_profile_id: profileId,
  });
  if (error || !data) return [];

  return (
    data as {
      season_id: string;
      season_name: string;
      league_name: string;
      season_status: PlayerSeason["status"];
      points: number | string;
      spent: number | string;
      films_owned: number;
      place: number;
      player_count: number;
    }[]
  ).map((row) => ({
    seasonId: row.season_id,
    seasonName: row.season_name,
    leagueName: row.league_name,
    status: row.season_status,
    // Postgres numeric reaches the client as a string often enough that every
    // consumer normalises — the 2026-08-07 dirty-check lesson.
    points: Number(row.points),
    spent: Number(row.spent),
    filmsOwned: Number(row.films_owned),
    place: Number(row.place),
    playerCount: Number(row.player_count),
  }));
}

/**
 * Everyone the viewer shares a league with, by id — so PlayerChip can link.
 *
 * The name half of the map is built by buildPlayerDirectory, which drops any
 * name two accounts share rather than picking one of them (ADR-082).
 */
export async function getPlayerDirectory(
  supabase: SupabaseClient
): Promise<PlayerDirectory> {
  const { data, error } = await supabase.rpc("get_player_directory");
  // A failed directory just means chips render as plain text — never a broken
  // frame, since this loads on every signed-in page.
  if (error || !data) return EMPTY_DIRECTORY;
  return buildPlayerDirectory(
    (data as { profile_id: string; display_name: string }[]).map((r) => ({
      profileId: r.profile_id,
      displayName: r.display_name,
    }))
  );
}
