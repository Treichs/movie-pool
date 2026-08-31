// TMDB — the US theatrical release calendar, posters, and the metadata that
// becomes a film_catalog row.
//
// TWO HALVES, DELIBERATELY SEPARATED. The `parse*` functions are pure over
// `unknown` and export independently of the fetchers, so T0's committed
// fixtures can drive the unit tests without a network call. The fetchers take an
// injectable `fetchImpl` as their last parameter for the same reason. External
// JSON is the one place an `as` cast is genuinely dangerous — every field below
// is narrowed, never asserted.
//
// THREE QUERY PARAMS ARE LOAD-BEARING, not cosmetic (all three measured in T0):
//
//   region=US            With it, the release_date filters apply to the US dates
//                        and the returned release_date is the US one. Without
//                        it they filter the PRIMARY release, so a film that
//                        opened in France in March shows up as a March release.
//   release_date.*       Not primary_release_date.*, which ignores `region`.
//                        The pairing is what makes region work.
//   with_release_type=3  WIDE ONLY. Under 3|2, TMDB returns The Brutalist in
//                        the January window but dates it 2024-12-20 — its
//                        LIMITED date, five weeks early — and drags in titles
//                        years outside the requested window (ADR-041).
//
// And the v4 bearer token rather than the v3 `api_key=` query param, which keeps
// the secret out of URLs, server logs, and cache keys.

import "server-only";

import { apiFail, apiOk, type ApiResult } from "@/lib/api-result";

// `posterUrl`/`PosterSize` moved to src/components/blocks/display/poster-url.ts
// and `TMDB_ATTRIBUTION`/`backdropUrl`/`profileUrl`/`trailerEmbedUrl`/
// `BackdropSize` moved to src/domain/tmdb-urls.ts (fl-frontend-rebuild Task 5):
// all five are pure URL formatting with no network call, and this module opens
// with `import "server-only"` — a registry or app caller reaching them here
// would either fail the build (registry, a client bundle) or take the one edge
// the layer contract forbids outright (app straight into infra-clients, which
// is how the orchestration authz gate gets skipped). See those files' headers.
const API = "https://api.themoviedb.org/3";

// ---------------------------------------------------------------------------
// Narrowing helpers. Small on purpose: a schema library would be a new runtime
// dependency, and the verification net for this project is explicitly zero-deps.
// ---------------------------------------------------------------------------
type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const asNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const asInt = (v: unknown): number | null => {
  const n = asNum(v);
  return n === null ? null : Math.trunc(n);
};
/** TMDB dates arrive either as "YYYY-MM-DD" or a full ISO timestamp. */
const asDate = (v: unknown): string | null => {
  const s = asStr(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

// ---------------------------------------------------------------------------
// Discover — the browse list
// ---------------------------------------------------------------------------

export type DiscoverFilm = {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  /** The US WIDE date, because the query filtered on release type 3. */
  releaseDate: string | null;
  popularity: number | null;
  voteAverage: number | null;
  genreIds: number[];
};

export type DiscoverPage = {
  page: number;
  totalPages: number;
  totalResults: number;
  films: DiscoverFilm[];
};

/** Pure. Silently drops entries with no id or title rather than failing the page. */
export function parseDiscoverPage(json: unknown): DiscoverPage {
  const root = isObj(json) ? json : {};
  const films: DiscoverFilm[] = [];
  for (const raw of asArr(root.results)) {
    if (!isObj(raw)) continue;
    const tmdbId = asInt(raw.id);
    const title = asStr(raw.title);
    if (tmdbId === null || tmdbId <= 0 || title === null) continue;
    films.push({
      tmdbId,
      title,
      originalTitle: asStr(raw.original_title),
      overview: asStr(raw.overview),
      posterPath: asStr(raw.poster_path),
      backdropPath: asStr(raw.backdrop_path),
      releaseDate: asDate(raw.release_date),
      popularity: asNum(raw.popularity),
      voteAverage: asNum(raw.vote_average),
      genreIds: asArr(raw.genre_ids)
        .map(asInt)
        .filter((n): n is number => n !== null),
    });
  }
  return {
    page: asInt(root.page) ?? 1,
    totalPages: asInt(root.total_pages) ?? 1,
    totalResults: asInt(root.total_results) ?? films.length,
    films,
  };
}

// ---------------------------------------------------------------------------
// Detail — what becomes a film_catalog row
// ---------------------------------------------------------------------------

/**
 * Exactly the shape `add_films_from_catalog` consumes. The server action builds
 * this and passes it to the RPC; the browser only ever sends tmdb_ids, which is
 * what lets the RPC's guard stay a plain is_commissioner check (ADR-043).
 *
 * snake_case throughout, unlike the rest of this module, because these keys are
 * read verbatim by the SQL. Renaming one here silently drops a column there.
 */
export type CatalogPayload = {
  tmdb_id: number;
  imdb_id: string | null;
  title: string;
  original_title: string | null;
  release_date_us_wide: string | null;
  release_date_us_limited: string | null;
  release_date_us_premiere: string | null;
  release_date_digital: string | null;
  release_date_tmdb_raw: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  tagline: string | null;
  homepage: string | null;
  certification: string | null;
  runtime_min: number | null;
  budget: number | null;
  collection_id: number | null;
  collection_name: string | null;
  original_language: string | null;
  director: string | null;
  composer: string | null;
  cinematographer: string | null;
  studios: string | null;
  tmdb_vote_average: number | null;
  tmdb_vote_count: number | null;
  tmdb_popularity_at_pick: number | null;
  revenue_worldwide: number | null;
  trailer_youtube_key: string | null;
  genres: { id: number; name: string }[];
  cast: {
    order: number;
    id: number;
    name: string;
    character: string | null;
    profile_path: string | null;
  }[];
};

/** US release_dates types. 3 is the only one the pool bids on. */
export const RELEASE_TYPE = {
  PREMIERE: 1,
  LIMITED: 2,
  WIDE: 3,
  DIGITAL: 4,
  PHYSICAL: 5,
  TV: 6,
} as const;

/** How many cast members we keep out of the ~95 TMDB returns. */
const TOP_BILLED = 5;

/**
 * EVERY production company TMDB credits, comma-separated, in TMDB's order.
 *
 * This took the singular first — `production_companies[0]` — and the data
 * refused it. The array is not ranked, and sampling six films from this
 * catalogue put a producer's shingle first on half of them: "Lord Miller"
 * ahead of Amazon MGM, "Tea Shop Productions" ahead of Blumhouse in fourth.
 * TMDB exposes no distributor on `/movie` and nothing to rank by, so any
 * single pick is arbitrary — and one that credits Tea Shop for a Blumhouse
 * film is worse than no row at all.
 *
 * So the fact is "who is credited", which the data supports, rather than
 * "the studio", which it does not. Null rather than "" when there are none,
 * so the facts panel omits the row instead of printing an empty one.
 */
function allStudios(detail: Json): string | null {
  const names = asArr(detail.production_companies)
    .map((c) => (isObj(c) ? asStr(c.name) : null))
    .filter((n): n is string => n !== null);
  return names.length > 0 ? names.join(", ") : null;
}

type UsRelease = { type: number; date: string | null; certification: string | null };

function usReleases(detail: Json): UsRelease[] {
  const results = asArr(isObj(detail.release_dates) ? detail.release_dates.results : []);
  const us = results.find((r) => isObj(r) && asStr(r.iso_3166_1) === "US");
  if (!isObj(us)) return [];
  return asArr(us.release_dates)
    .filter(isObj)
    .map((r) => ({
      type: asInt(r.type) ?? 0,
      date: asDate(r.release_date),
      certification: asStr(r.certification),
    }));
}

/** The EARLIEST date of a given type. A re-release is always later, so earliest
 *  is the original opening — which is why we do not simply take the first entry. */
function earliestOfType(rows: UsRelease[], type: number): string | null {
  const dates = rows.filter((r) => r.type === type && r.date).map((r) => r.date as string);
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
}

function crewMember(detail: Json, ...jobs: string[]): string | null {
  const crew = asArr(isObj(detail.credits) ? detail.credits.crew : []).filter(isObj);
  for (const job of jobs) {
    const hit = crew.find((c) => asStr(c.job) === job);
    const name = hit ? asStr(hit.name) : null;
    if (name) return name;
  }
  return null;
}

/**
 * One key out of up to 67 videos.
 *
 * "The most recent official English trailer" is the obvious rule and it is
 * WRONG — measured, not guessed. Superman's most recent official English
 * entry of type Trailer is the "Official American Sign Language Trailer"
 * (published 2025-09-16), an accessibility variant nobody browsing a release
 * calendar is asking for. So variants are excluded by name first, and only then
 * does most-recent decide, which is what correctly picks The Brutalist's
 * "Official Trailer 2" over its earlier "Official Trailer".
 */
const VARIANT_TRAILER = /sign language|audio descri|described|subtitled|dubbed/i;

function trailerKey(detail: Json): string | null {
  const vids = asArr(isObj(detail.videos) ? detail.videos.results : [])
    .filter(isObj)
    .filter((v) => asStr(v.site) === "YouTube" && asStr(v.key));

  const rank = (v: Json) => {
    const type = asStr(v.type);
    const name = asStr(v.name) ?? "";
    const official = v.official === true;
    const english = asStr(v.iso_639_1) === "en";
    if (VARIANT_TRAILER.test(name)) return 8; // last resort, never a first choice
    // A name that actually says "trailer" beats a promo spot TMDB also files
    // under type Trailer — Superman's "Tickets on Sale Now", for instance.
    if (type === "Trailer" && official && english && /\btrailers?\b/i.test(name)) return 0;
    if (type === "Trailer" && official && english) return 1;
    if (type === "Trailer" && official) return 2;
    if (type === "Trailer") return 3;
    if (type === "Teaser") return 4;
    return 9;
  };

  const best = vids
    .filter((v) => rank(v) < 9)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (asStr(b.published_at) ?? "").localeCompare(asStr(a.published_at) ?? ""),
    )[0];
  return best ? asStr(best.key) : null;
}

/** Pure. Returns null only when the payload has no usable id or title. */
export function parseMovieDetail(json: unknown): CatalogPayload | null {
  if (!isObj(json)) return null;
  const tmdbId = asInt(json.id);
  const title = asStr(json.title);
  if (tmdbId === null || tmdbId <= 0 || title === null) return null;

  const us = usReleases(json);
  const collection = isObj(json.belongs_to_collection) ? json.belongs_to_collection : null;

  return {
    tmdb_id: tmdbId,
    imdb_id: asStr(json.imdb_id),
    title,
    original_title: asStr(json.original_title),
    release_date_us_wide: earliestOfType(us, RELEASE_TYPE.WIDE),
    release_date_us_limited: earliestOfType(us, RELEASE_TYPE.LIMITED),
    release_date_us_premiere: earliestOfType(us, RELEASE_TYPE.PREMIERE),
    release_date_digital: earliestOfType(us, RELEASE_TYPE.DIGITAL),
    // Captured only so a divergence from the wide date is detectable. It is
    // NEITHER the premiere nor the wide date for Superman, and IS the limited
    // date for The Brutalist — never read it as "the" date.
    release_date_tmdb_raw: asDate(json.release_date),
    poster_path: asStr(json.poster_path),
    backdrop_path: asStr(json.backdrop_path),
    overview: asStr(json.overview),
    tagline: asStr(json.tagline),
    homepage: asStr(json.homepage),
    certification: us.find((r) => r.certification)?.certification ?? null,
    runtime_min: asInt(json.runtime),
    budget: asInt(json.budget),
    collection_id: collection ? asInt(collection.id) : null,
    collection_name: collection ? asStr(collection.name) : null,
    original_language: asStr(json.original_language),
    director: crewMember(json, "Director"),
    composer: crewMember(json, "Original Music Composer", "Music"),
    cinematographer: crewMember(json, "Director of Photography"),
    studios: allStudios(json),
    tmdb_vote_average: asNum(json.vote_average),
    tmdb_vote_count: asInt(json.vote_count),
    tmdb_popularity_at_pick: asNum(json.popularity),
    revenue_worldwide: asInt(json.revenue),
    trailer_youtube_key: trailerKey(json),
    genres: asArr(json.genres)
      .filter(isObj)
      .map((g) => ({ id: asInt(g.id), name: asStr(g.name) }))
      .filter((g): g is { id: number; name: string } => g.id !== null && g.name !== null),
    cast: asArr(isObj(json.credits) ? json.credits.cast : [])
      .filter(isObj)
      .map((c) => ({
        order: asInt(c.order),
        id: asInt(c.id),
        name: asStr(c.name),
        character: asStr(c.character),
        profile_path: asStr(c.profile_path),
      }))
      .filter(
        (c): c is CatalogPayload["cast"][number] =>
          c.order !== null && c.id !== null && c.name !== null,
      )
      .sort((a, b) => a.order - b.order)
      .slice(0, TOP_BILLED),
  };
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 8_000;

/**
 * How long a TMDB answer is reused before it is fetched again (2026-08-07:
 * six hours → one hour, developer's call).
 *
 * This is Next's server-side Data Cache, not a browser cache: one stored copy
 * shared by everyone, so shortening it costs one refetch per hour per distinct
 * query, not one per visitor. A release date that moves, a poster that changes
 * or a newly-dated film is visible within the hour instead of within six.
 *
 * Deliberately NOT matched to OMDb's, which sits at fifteen minutes because a
 * Tomatometer moves on the morning it is captured and a release calendar does
 * not.
 */
const TMDB_TTL = 3_600;
/**
 * TMDB's own hard ceiling on discover pagination, and the ONLY cap left
 * (2026-08-07). It is a runaway guard against a malformed total_pages, not a
 * product decision — no real window comes near it.
 *
 * What it replaced was MAX_DISCOVER_PAGES = 3, whose note read "a date range,
 * not pagination, is the answer to 'there are more'". Measured, that is exactly
 * backwards. TMDB sorts discover by popularity, so a wider range does not
 * surface more films — it runs a wider popularity contest for the same 60
 * slots, pushing near-term titles out for far-future tentpoles. A 4-week window
 * already holds 164 results and 30 weeks holds 411. The range picker was the
 * one lever that could not answer "there are more".
 *
 * Both surfaces now take every page: the public calendar and the commissioner's
 * picker see the same complete schedule.
 */
export const TMDB_MAX_DISCOVER_PAGES = 500;

export type FetchImpl = typeof fetch;

function bearer(): string | null {
  return process.env.TMDB_READ_TOKEN?.trim() || null;
}

/** True when the app is configured for TMDB. `/releases` renders a "not
 *  configured" empty state rather than an error when this is false. */
export function tmdbConfigured(): boolean {
  return bearer() !== null;
}

async function tmdbGet(
  path: string,
  init: RequestInit,
  fetchImpl: FetchImpl,
): Promise<ApiResult<unknown>> {
  const token = bearer();
  // A missing key returns a value, never throws: the app must build and run
  // without it, and /releases must render an empty state rather than a 500.
  if (!token) return apiFail("TMDB is not configured (TMDB_READ_TOKEN is unset).");

  const attempt = async (): Promise<Response> =>
    fetchImpl(`${API}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
    });

  try {
    let res = await attempt();
    // One retry, and only for the two failures that are worth retrying.
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500, 2_000);
      await new Promise((r) => setTimeout(r, waitMs));
      res = await attempt();
    }
    if (!res.ok) return apiFail(`TMDB responded ${res.status}`, res.status);
    return apiOk(await res.json());
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "TMDB request failed");
  }
}

/** Browse. Cached for 6h under a tag so a commissioner can force a refresh.
 *  includeLimited widens the discover filter to limited releases too.
 *  TMDB's `|` means OR, and the file-header warning about 3|2 (The Brutalist
 *  surfacing five weeks early on its limited date) is exactly the behaviour a
 *  limited-inclusive call is OPTING INTO — with it off, nothing changes. */
export async function fetchUpcoming(
  from: string,
  to: string,
  page = 1,
  fetchImpl: FetchImpl = fetch,
  includeLimited = false,
): Promise<ApiResult<DiscoverPage>> {
  const qs = new URLSearchParams({
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    region: "US",
    sort_by: "popularity.desc",
    with_release_type: includeLimited
      ? `${RELEASE_TYPE.WIDE}|${RELEASE_TYPE.LIMITED}`
      : String(RELEASE_TYPE.WIDE),
    "release_date.gte": from,
    "release_date.lte": to,
    page: String(page),
  });
  const res = await tmdbGet(
    `/discover/movie?${qs}`,
    { next: { revalidate: TMDB_TTL, tags: ["tmdb-upcoming"] } },
    fetchImpl,
  );
  return res.ok ? apiOk(parseDiscoverPage(res.data)) : res;
}

/**
 * Every page up to the cap, concatenated. Stops early at the last real page.
 *
 * PAGES 2..N NOW GO OUT IN PARALLEL (2026-08-07). They were sequential, which
 * was tolerable at a 3-page cap and is not at the 25 the calendar asks for:
 * serialised, a cold load would be twenty-five round trips end to end. In
 * parallel the wall-clock is roughly one request, so the once-per-six-hours
 * cache miss stays a normal page load rather than a visible stall.
 *
 * Two consequences of going parallel, both handled:
 *
 * DUPLICATES. TMDB paginates over a popularity sort, and popularity is live —
 * a film that shifts rank between two requests can land on both pages or
 * neither. Sequential requests were far enough apart to make this unlikely and
 * simultaneous ones make it likelier, so the result is deduped by tmdb id. The
 * "or neither" half is not fixable from here and is not worth being: it is one
 * film out of hundreds, on a browse surface.
 *
 * PARTIAL FAILURE. The sequential version broke on the first bad page, so a
 * failure at page 2 silently discarded pages 3..N that would have succeeded.
 * Every page is now attempted and the failures are dropped — still "a partial
 * list beats no list", but the partial list is as complete as it can be.
 */
export async function fetchUpcomingAll(
  from: string,
  to: string,
  fetchImpl: FetchImpl = fetch,
  includeLimited = false,
): Promise<ApiResult<DiscoverFilm[]>> {
  const first = await fetchUpcoming(from, to, 1, fetchImpl, includeLimited);
  if (!first.ok) return first;

  const pages = Math.min(first.data.totalPages, TMDB_MAX_DISCOVER_PAGES);
  const rest =
    pages > 1
      ? await Promise.all(
          Array.from({ length: pages - 1 }, (_, i) =>
            fetchUpcoming(from, to, i + 2, fetchImpl, includeLimited),
          ),
        )
      : [];

  // Insertion-ordered by page, so the popularity order survives the dedupe.
  const byId = new Map<number, DiscoverFilm>();
  for (const film of first.data.films) byId.set(film.tmdbId, film);
  for (const page of rest) {
    if (!page.ok) continue;
    for (const film of page.data.films) if (!byId.has(film.tmdbId)) byId.set(film.tmdbId, film);
  }
  return apiOk([...byId.values()]);
}

/** Pure: every US WIDE (type 3) date on a detail payload, sorted ascending.
 *  Deliberately NOT part of CatalogPayload — that shape is a parser→SQL key
 *  contract (spike-asserted), and re-release resolution (ADR-051) only needs
 *  a date list, not a new stored column. */
export function parseUsWideDates(json: unknown): string[] {
  if (!isObj(json)) return [];
  return usReleases(json)
    .filter((r) => r.type === RELEASE_TYPE.WIDE && r.date)
    .map((r) => r.date as string)
    .sort();
}

/**
 * The re-release resolver's read (ADR-051): a discover row whose release_date
 * falls outside the queried window was matched by a DIFFERENT release event —
 * TMDB reports the film's FIRST US date, so Cars' 2026 re-release arrives
 * dated 2006. This fetches the film's full US release list so the caller can
 * re-date it to the wide date inside the window. Cached like the drift check:
 * it runs on browse-page views for a handful of outliers, and a six-hour-old
 * release list is entirely good enough.
 */
export async function fetchUsWideDates(
  tmdbId: number,
  fetchImpl: FetchImpl = fetch,
): Promise<ApiResult<string[]>> {
  const res = await tmdbGet(
    `/movie/${tmdbId}?language=en-US&append_to_response=release_dates`,
    { next: { revalidate: TMDB_TTL, tags: ["tmdb-detail"] } },
    fetchImpl,
  );
  return res.ok ? apiOk(parseUsWideDates(res.data)) : res;
}

/**
 * Pick time only — never for the browse list.
 *
 * `credits` and `videos` ARE appended here, which corrects a loose reading of
 * ADR-043: the 350 KB objection was about STORAGE (~20 MB of jsonb per season),
 * not about a one-off fetch for the 3-8 films a commissioner actually picks. We
 * fetch them and keep about six fields. `images` and `watch/providers` stay off
 * the request entirely because nothing is stored from them at all.
 *
 * no-store: this is the moment the data is written to the database, so a cached
 * copy is exactly the wrong thing.
 */
export async function fetchMovieDetail(
  tmdbId: number,
  fetchImpl: FetchImpl = fetch,
  /**
   * "fresh" (the default) is the pick-time read: this is the moment the data is
   * written to the database, so a cached copy is exactly the wrong thing.
   *
   * "cached" is for the drift check, which re-reads films that were picked days
   * or weeks ago purely to notice that TMDB moved a date. That runs on every
   * commissioner page view, so it must not spend a request per film per view —
   * and a six-hour-old answer is entirely good enough to spot a date change.
   */
  freshness: "fresh" | "cached" = "fresh",
): Promise<ApiResult<CatalogPayload>> {
  const res = await tmdbGet(
    `/movie/${tmdbId}?language=en-US&append_to_response=release_dates,credits,videos`,
    freshness === "fresh"
      ? { cache: "no-store" }
      : { next: { revalidate: TMDB_TTL, tags: ["tmdb-detail"] } },
    fetchImpl,
  );
  if (!res.ok) return res;
  const parsed = parseMovieDetail(res.data);
  return parsed
    ? apiOk(parsed)
    : apiFail(`TMDB returned no usable detail for ${tmdbId}`);
}
