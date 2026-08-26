import type { SupabaseClient } from "@/lib/supabase";
import { fetchMovieDetail, type CatalogPayload } from "@/lib/tmdb";

// THE ONE IMPLEMENTATION of "turn tmdb_ids into films on the slate" — shared
// by the release-calendar picker and the Week Slate Drawer, which each carried
// a full copy of this sequence until 2026-08-09 and had already drifted in
// small ways (a named batch constant vs a bare literal, differently-worded
// messages).
//
// THE SECURITY PROPERTY LIVES HERE NOW: callers hand over tmdb_ids and
// nothing else, and this helper re-fetches every film's detail from TMDB
// itself before anything reaches the add_films_from_catalog RPC. That is what
// makes the RPC's plain is_commissioner guard sufficient — a member can never
// inject a crafted poster_path, title, or release date. Do not add a caller
// that passes a client-supplied payload; the guard is only sufficient because
// none exists.

/** Mirrors the RPC's own batch guard. */
export const MAX_CATALOG_BATCH = 50;

/** Matches the RPC's per-row skip report. */
export type CatalogSkip = {
  tmdb_id: number;
  title: string | null;
  reason: string;
  detail: string;
};
export type CatalogAdded = { tmdb_id: number; week_number: number; created_week: boolean };

export type CatalogAddOutcome =
  /** TMDB answered for none of the ids. Nothing was written. */
  | { status: "tmdb-unreachable" }
  /** The RPC refused the batch outright — message written for a commissioner. */
  | { status: "rpc-error"; message: string }
  | {
      status: "ok";
      added: CatalogAdded[];
      skipped: CatalogSkip[];
      weeksCreated: number;
      /** tmdb_ids TMDB did not answer for; the rest were still added. */
      unreachable: number[];
    };

export async function addFilmsByTmdbIds(
  supabase: SupabaseClient,
  input: { seasonId: string; tmdbIds: number[]; allowCreateWeek: boolean }
): Promise<CatalogAddOutcome> {
  const ids = [
    ...new Set(input.tmdbIds.filter((n) => Number.isInteger(n) && n > 0)),
  ];

  // Sequential, not Promise.all: this is a free-tier key and a weekend's slate
  // is 3-8 films. Hammering TMDB with a burst to save two seconds would risk a
  // 429 that turns a working add into a partial one.
  const payload: CatalogPayload[] = [];
  const unreachable: number[] = [];
  for (const id of ids) {
    const res = await fetchMovieDetail(id);
    if (res.ok) payload.push(res.data);
    else unreachable.push(id);
  }
  if (payload.length === 0) return { status: "tmdb-unreachable" };

  const { data, error } = await supabase.rpc("add_films_from_catalog", {
    p_season_id: input.seasonId,
    p_films: payload,
    p_allow_create_week: input.allowCreateWeek,
  });
  // Postgres exception messages here are written to be read by a commissioner,
  // so they are surfaced as-is rather than replaced with something vaguer.
  if (error) return { status: "rpc-error", message: error.message };

  const result = data as {
    added: CatalogAdded[] | null;
    skipped: CatalogSkip[] | null;
    weeks_created: number;
  };

  // A week opens when its clock has passed AND it has a slate (20260804080000).
  // Seasons are active from birth, so there is no "start the season" moment to
  // open week 1 — filling the slate is usually the last condition to come true,
  // and this call is the difference between the week opening now and opening at
  // the top of the hour. A failure is not worth reporting: the films WERE
  // added, and the pg_cron automation opens the week regardless.
  await supabase.rpc("open_due_weeks_for_season", { p_season_id: input.seasonId });

  return {
    status: "ok",
    added: result.added ?? [],
    skipped: result.skipped ?? [],
    weeksCreated: result.weeks_created ?? 0,
    unreachable,
  };
}

/**
 * The per-skip and unreachable sentences both callers append to their notice.
 *
 * Skips are INFORMATIONAL, not errors — the RPC is skip-and-report by design —
 * but each is named individually rather than counted, because "skipped 1"
 * without saying which film is the kind of message that gets ignored until the
 * week is wrong.
 */
export function catalogAddFootnotes(outcome: {
  skipped: CatalogSkip[];
  unreachable: number[];
}): string[] {
  const parts: string[] = [];
  for (const s of outcome.skipped) {
    parts.push(`Skipped ${s.title ?? s.tmdb_id}: ${s.detail}.`);
  }
  if (outcome.unreachable.length > 0) {
    const n = outcome.unreachable.length;
    parts.push(
      `Couldn't reach TMDB for ${n} film${n === 1 ? "" : "s"}; ${n === 1 ? "it was" : "they were"} not added.`
    );
  }
  return parts;
}
