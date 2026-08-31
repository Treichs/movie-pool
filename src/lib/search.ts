import type { SupabaseClient } from "@/lib/supabase";

/**
 * SEARCH — everything this viewer can reach, in one query set.
 *
 * ── THE SCOPING IS RLS, AND THAT IS THE WHOLE DESIGN ──────────────────────
 * Every table read below has row-level security on with a SELECT policy, and
 * every read here goes through the CALLER'S OWN client — their JWT, not the
 * service role. So the database cannot return a league the viewer is not in,
 * a season they do not play, or a film from someone else's slate. There is no
 * "and filter to my leagues" clause anywhere in this file, and there must
 * never be one: the moment scoping is expressed in application code it is
 * something a future caller can forget.
 *
 * ── SO THIS IS DELIBERATELY *NOT* A `SECURITY DEFINER` RPC ────────────────
 * Every write in this app goes through one, which makes reaching for one here
 * the obvious move and the wrong one. A DEFINER function runs as its owner and
 * BYPASSES RLS — it would hand back every league on the database unless this
 * file re-implemented, by hand, the scoping the policies already express
 * correctly. The plain query is the safer choice, and this is the one place in
 * the codebase where that sentence is true.
 *
 * ── PLAIN `ILIKE`, NOT FULL-TEXT SEARCH ───────────────────────────────────
 * Measured on 2026-08-31: the entire searchable corpus is 371 films, 195
 * weeks, 20 seasons, 12 leagues and 29 people, and the largest single league
 * holds 279 films. There is no `pg_trgm`, no tsvector column and no GIN index
 * on this database. At this size a substring match is instant, and installing
 * a search stack would be machinery bought against a load that does not exist.
 * Revisit when one league holds tens of thousands of films, and not before.
 *
 * ── RESULTS ARE NOT SCOPED TO THE FOCUSED LEAGUE ──────────────────────────
 * A member can belong to several leagues — the switcher exists because that
 * context is ambiguous — so hiding a result because the wrong league happens
 * to be selected is worse than showing it. Every result carries the league it
 * belongs to instead, in `context`.
 */

const WEEK_SELECT =
  "id, number, opening_date, season_id, season:v_seasons(name, league:leagues(name))";

/** How many of each kind to show. The palette is a jump-to, not a report. */
const PER_GROUP = 5;

/** Shorter than this and every query matches everything. */
const MIN_QUERY = 2;

export type SearchKind = "league" | "season" | "week" | "film" | "player";

export type SearchHit = {
  /** Unique within its group; used as the list key. */
  key: string;
  /** What the row is called. */
  label: string;
  /** Where it lives — the league, the season, the week. Always says enough to
   *  tell two same-named results apart. */
  context: string | null;
  href: string;
};

export type SearchResults = {
  leagues: SearchHit[];
  seasons: SearchHit[];
  weeks: SearchHit[];
  films: SearchHit[];
  players: SearchHit[];
  /** True when the query was too short to run. Lets the UI say so rather than
   *  render an empty state that looks like "no matches". */
  tooShort: boolean;
  /** Groups whose query ERRORED. An errored query and a query that matched
   *  nothing look identical once the error is discarded, which is exactly how
   *  the broken date filter survived — so they are told apart here and the UI
   *  says which group it could not search. */
  failed: SearchKind[];
};

export const EMPTY_RESULTS: SearchResults = {
  leagues: [],
  seasons: [],
  weeks: [],
  films: [],
  players: [],
  tooShort: true,
  failed: [],
};

/** `%` and `_` are wildcards in LIKE; a user typing them means the character. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * What a query means for the WEEKS group, which is the one thing here with no
 * name to match on. Two handles, and nothing else:
 *
 *   "week 4" / "wk 4" / "4"   → the week NUMBER
 *   "2026" / "2026-08" / a full date → the opening date, as a range
 *
 * THE DATE HALF IS A RANGE, NOT A SUBSTRING, and that is not a preference.
 * `opening_date` is a `date`, and PostgREST does not apply a `::text` cast
 * inside a filter — `opening_date::text=ilike.*2026-08*` reaches Postgres as
 * `date ~~* unknown` and fails with 42883. It failed SILENTLY here until
 * 2026-08-31, because the error was discarded and an errored query is
 * indistinguishable from one that matched nothing. Both halves of that are
 * fixed: the filter is a real range, and `failed` below reports a query that
 * errors instead of dropping it.
 *
 * Anything else returns null and the group is skipped rather than queried —
 * "obsession" is not a week, and asking the database was never going to help.
 */
function weekQuery(
  query: string,
): { kind: "number"; number: number } | { kind: "range"; from: string; to: string } | null {
  const asNumber = Number(query.replace(/^(week|wk)\s*/i, "").trim());
  if (Number.isInteger(asNumber) && asNumber > 0 && asNumber < 100) {
    return { kind: "number", number: asNumber };
  }

  const iso = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(query.trim());
  if (!iso) return null;
  const [, y, m, d] = iso;
  const year = Number(y);
  if (year < 1900 || year > 2999) return null;

  if (d) {
    const from = `${y}-${m}-${d}`;
    const next = new Date(`${from}T00:00:00Z`);
    if (Number.isNaN(next.getTime())) return null;
    next.setUTCDate(next.getUTCDate() + 1);
    return { kind: "range", from, to: next.toISOString().slice(0, 10) };
  }
  if (m) {
    const month = Number(m);
    if (month < 1 || month > 12) return null;
    const to =
      month === 12 ? `${year + 1}-01-01` : `${y}-${String(month + 1).padStart(2, "0")}-01`;
    return { kind: "range", from: `${y}-${m}-01`, to };
  }
  return { kind: "range", from: `${y}-01-01`, to: `${year + 1}-01-01` };
}

/** "Fri, Aug 28" — the same shape the week surfaces print. */
function weekLabel(openingDate: string, number: number): string {
  const d = new Date(`${openingDate}T00:00:00Z`);
  const month = MONTHS[d.getUTCMonth()];
  const pretty = `${month.slice(0, 1).toUpperCase()}${month.slice(1, 3)} ${d.getUTCDate()}`;
  return `Week ${String(number).padStart(2, "0")} — ${pretty}`;
}

export async function search(
  supabase: SupabaseClient,
  rawQuery: string,
): Promise<SearchResults> {
  const query = rawQuery.trim();
  if (query.length < MIN_QUERY) return EMPTY_RESULTS;

  const like = `%${escapeLike(query)}%`;
  const week = weekQuery(query);

  const [leagues, seasons, weeks, films, players] = await Promise.all([
    supabase
      .from("leagues")
      .select("id, name")
      .ilike("name", like)
      .order("name")
      .limit(PER_GROUP),

    // v_seasons, not seasons — a season's name is DERIVED there (ADR-099), so
    // it is the only place "Season 3" is a string that can be matched at all.
    supabase
      .from("v_seasons")
      .select("id, name, status, league:leagues(name)")
      .ilike("name", like)
      .limit(PER_GROUP),

    week === null
      ? null
      : (week.kind === "number"
          ? supabase
              .from("weeks")
              .select(WEEK_SELECT)
              .eq("number", week.number)
          : supabase
              .from("weeks")
              .select(WEEK_SELECT)
              .gte("opening_date", week.from)
              .lt("opening_date", week.to)
        )
          .order("opening_date", { ascending: false })
          .limit(PER_GROUP),

    // The league comes back with the film because the film page is
    // league-scoped: the same film in two of the viewer's leagues is two
    // results, with different scores behind them, and collapsing them would
    // hide one league's history behind another's.
    supabase
      .from("films")
      .select("id, title, tmdb_id, week:weeks!inner(number, season:seasons!inner(league:leagues!inner(id, name)))")
      .ilike("title", like)
      .not("tmdb_id", "is", null)
      .order("title")
      .limit(PER_GROUP),

    supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", like)
      .order("display_name")
      .limit(PER_GROUP),
  ]);

  // A query that errors must never read as "nothing matched".
  const failed: SearchKind[] = [];
  const check = (kind: SearchKind, r: { error: { message: string } | null } | null) => {
    if (r?.error) {
      failed.push(kind);
      console.error(`search(${kind}): ${r.error.message}`);
    }
  };
  check("league", leagues);
  check("season", seasons);
  check("week", weeks);
  check("film", films);
  check("player", players);

  type SeasonRow = { id: string; name: string; status: string; league: { name: string } | null };
  type WeekRow = {
    id: string;
    number: number;
    opening_date: string;
    season_id: string;
    season: { name: string; league: { name: string } | null } | null;
  };
  type FilmRow = {
    id: string;
    title: string;
    tmdb_id: number;
    week: { number: number; season: { league: { id: string; name: string } } };
  };

  return {
    tooShort: false,
    failed,

    leagues: (leagues.data ?? []).map((l) => ({
      key: l.id,
      label: l.name,
      context: null,
      href: `/leagues/${l.id}`,
    })),

    seasons: ((seasons.data ?? []) as unknown as SeasonRow[]).map((s) => ({
      key: s.id,
      label: s.name,
      context: s.league?.name ?? null,
      href: `/seasons/${s.id}`,
    })),

    weeks: ((weeks?.data ?? []) as unknown as WeekRow[]).map((w) => ({
      key: w.id,
      label: weekLabel(w.opening_date, w.number),
      context: [w.season?.league?.name, w.season?.name].filter(Boolean).join(" · ") || null,
      href: `/seasons/${w.season_id}/weeks/${w.id}`,
    })),

    films: ((films.data ?? []) as unknown as FilmRow[]).map((f) => ({
      key: f.id,
      label: f.title,
      context: f.week.season.league.name,
      href: `/leagues/${f.week.season.league.id}/films/${f.tmdb_id}`,
    })),

    players: (players.data ?? []).map((p) => ({
      key: p.id,
      label: p.display_name,
      context: null,
      href: `/players/${p.id}`,
    })),
  };
}

/** True when nothing matched — the UI's empty state, distinct from `tooShort`. */
export function isEmpty(r: SearchResults): boolean {
  return (
    !r.tooShort &&
    r.failed.length === 0 &&
    r.leagues.length === 0 &&
    r.seasons.length === 0 &&
    r.weeks.length === 0 &&
    r.films.length === 0 &&
    r.players.length === 0
  );
}
