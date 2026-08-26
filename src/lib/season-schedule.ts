import type { SupabaseClient } from "@/lib/supabase";
import { FILM_COLUMNS_WITH_WEEK, getWeeks, type Film, type Week } from "@/lib/commish";
import { getLeagueSeasons, type LeagueSeason } from "@/lib/league";
import { getMyBids } from "@/lib/pool";

// THE SEASON'S SCHEDULE — every week of a season and the films the
// commissioner put on it (2026-08-04).
//
// This is what /releases became. That page used to be the forward TMDB
// calendar with a season laid over it as a filter; it is now the season's own
// board, and the theatrical calendar moved to the commissioner's picker where
// picking actually happens. The distinction is worth stating because the two
// look similar and answer different questions: this says "what is my league
// playing for", the picker says "what is coming out".
//
// EVERY week is returned, including ones with no films yet. A week the
// commissioner has not filled is a real state a player should see — it is the
// difference between "nothing is happening" and "nothing has been chosen yet"
// — and dropping it would make the season look shorter than it is.

export type ScheduleFilm = Film & {
  weekId: string;
  /**
   * The VIEWER's bid, and nobody else's (ADR-120).
   *
   * This is the only per-player fact the board carries, and it is safe on an
   * open week for the reason getMyBids documents: the filter is the caller's
   * own membership, so blind-bid secrecy is untouched. Reading anyone else's
   * amounts here would be the ADR-022 leak, and the board has no need of them
   * — "have you bid on this" is a question about you.
   */
  myBid: number | null;
};

export type ScheduleWeek = {
  week: Week;
  films: ScheduleFilm[];
};

export type SeasonOption = { id: string; name: string; status: LeagueSeason["status"] };

/** The league's seasons, newest first — the Releases dropdown's options. */
export async function getSeasonOptions(
  supabase: SupabaseClient,
  leagueId: string
): Promise<SeasonOption[]> {
  const seasons = await getLeagueSeasons(supabase, leagueId);
  return seasons.map((s) => ({ id: s.id, name: s.name, status: s.status }));
}

export async function getSeasonSchedule(
  supabase: SupabaseClient,
  seasonId: string,
  /** The viewer's membership, for their own bids. See ScheduleFilm.myBid. */
  seasonMemberId: string
): Promise<ScheduleWeek[]> {
  const weeks = await getWeeks(supabase, seasonId);
  if (weeks.length === 0) return [];

  const { data } = await supabase
    .from("films")
    // The shared constant, NOT an inline copy — this select was the third
    // verbatim copy of the list FILM_COLUMNS exists to keep in one place,
    // found by the 2026-08-09 state audit.
    .select(FILM_COLUMNS_WITH_WEEK)
    .in(
      "week_id",
      weeks.map((w) => w.id)
    )
    .order("title", { ascending: true });

  // `as unknown as` for the reason the other film reads document: postgrest-js
  // types the film_catalog embed as an array without generated DB types, and
  // the FK is many-to-one so it is an object at runtime.
  const films = (data ?? []) as unknown as (Film & { week_id: string })[];

  // One extra read for the whole season rather than one per week — the film
  // ids are already in hand, and the board shows a bid state on every week
  // that has not finished.
  const myBids = await getMyBids(
    supabase,
    films.map((f) => f.id),
    seasonMemberId
  );
  const bidByFilm = new Map(myBids.map((b) => [b.film_id, b.amount]));

  const byWeek = new Map<string, ScheduleFilm[]>();
  for (const f of films) {
    const list = byWeek.get(f.week_id) ?? [];
    list.push({ ...f, weekId: f.week_id, myBid: bidByFilm.get(f.id) ?? null });
    byWeek.set(f.week_id, list);
  }

  return weeks.map((week) => ({ week, films: byWeek.get(week.id) ?? [] }));
}
