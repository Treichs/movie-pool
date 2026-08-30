import type { SupabaseClient } from "@/lib/supabase";
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
 * reader stays a straight mapping.
 *
 * ── ONLY THE VISIBILITY REFUSAL IS SWALLOWED. THIS USED TO SWALLOW EVERYTHING
 * and it cost a real bug: `get_player_seasons` referenced `seasons.name`, a
 * column that has never existed (the name lives on `v_seasons`), so the
 * function threw on every call from the day it was written — and this reader
 * turned that into an empty array. A function that could not succeed rendered
 * as a player who had simply never played, and nothing anywhere said
 * otherwise. It surfaced only when `/players/[profileId]` put "Seasons played
 * 3" beside an empty table.
 *
 * So "no such player" — the RPC's own deliberate refusal, which must read the
 * same as "we share nothing" — still returns empty. Everything else throws and
 * lands in the segment's `error.tsx`, where a broken read belongs.
 */
export async function getPlayerSeasons(
  supabase: SupabaseClient,
  profileId: string
): Promise<PlayerSeason[]> {
  const { data, error } = await supabase.rpc("get_player_seasons", {
    p_profile_id: profileId,
  });
  if (error) {
    if (error.message.includes("no such player")) return [];
    throw new Error(`get_player_seasons: ${error.message}`);
  }
  if (!data) return [];

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

export type PlayerProfilePage = {
  profile: PlayerProfile;
  seasons: PlayerSeason[];
  /** True when the rows span more than one league, which is the only time a
   *  league column carries information. A profile is cross-league by design —
   *  `get_player_seasons` returns every season in a league the VIEWER also
   *  belongs to — so on a shared single league the column would repeat one
   *  value down the table. */
  spansLeagues: boolean;
};

/**
 * THE WHOLE SCREEN IN ONE CALL.
 *
 * Both halves already existed and both are RLS-equivalent: each is a
 * `SECURITY DEFINER` RPC applying the same visibility rule — you see a player
 * only through a league you share. This wrapper exists so the page makes one
 * call rather than two, and so "the profile is null" is decided once.
 *
 * ── A MISSING PROFILE AND A STRANGER ARE THE SAME ANSWER, DELIBERATELY ────
 * `getPlayerProfile` returns null both for a player who does not exist and for
 * one the viewer shares no league with. That is not laziness: telling them
 * apart would confirm an account exists to somebody who cannot see it, which
 * is the roster leak this app's gates exist to prevent.
 */
export async function getPlayerProfilePage(
  supabase: SupabaseClient,
  profileId: string
): Promise<PlayerProfilePage | null> {
  const [profile, seasons] = await Promise.all([
    getPlayerProfile(supabase, profileId),
    getPlayerSeasons(supabase, profileId),
  ]);
  if (!profile) return null;

  return {
    profile,
    seasons,
    spansLeagues: new Set(seasons.map((s) => s.leagueName)).size > 1,
  };
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
