// OMDb — the Tomatometer, and the critical/audience metrics TMDB does not carry.
//
// TWO TRAPS, BOTH MEASURED IN T0 AND BOTH SILENT:
//
//  1. THE TOMATOMETER IS IN `Ratings[]`, not a top-level field. The legacy
//     `tomatoMeter` key is ABSENT on this plan — a design reading it would get
//     `undefined` forever and simply never show a suggestion, with no error to
//     explain why.
//
//  2. OMDb RETURNS HTTP 200 ON FAILURE, with {"Response":"False","Error":"…"}.
//     Checking `res.ok` alone accepts an error document as valid data. Every
//     parse below therefore tests `Response` before anything else.
//
// A film with no Rotten Tomatoes score yet is NOT an error — it is
// `{ok: true, tomatometer: null}`. That distinction is load-bearing: T9's
// provenance record treats "asked, nothing to report" differently from "never
// asked", and collapsing the two would lose that.
//
// NOTHING HERE IS EVER PERSISTED AUTOMATICALLY. These values reach
// films.tomatometer only through a commissioner's own capture_film submission
// (ADR-041); rulebook §6 fixes the capture moment, and films.tomatometer feeds a
// generated score column that flows to standings and real-money settlement.

import "server-only";

import { apiFail, apiOk, type ApiResult } from "@/lib/api-result";
import type { FetchImpl } from "@/lib/tmdb";

const API = "https://www.omdbapi.com/";
const TIMEOUT_MS = 8_000;

export type OmdbSummary = {
  imdbId: string;
  /** 0-100, or null when Rotten Tomatoes has not scored the film yet. */
  tomatometer: number | null;
  metascore: number | null;
  imdbRating: number | null;
  imdbVotes: number | null;
  /** Cumulative DOMESTIC gross. NOT opening weekend — unusable for scoring. */
  boxOfficeDomestic: number | null;
  awards: string | null;
  /** OMDb's own release date, kept for the free cross-check against TMDB's wide date. */
  released: string | null;
  runtimeMin: number | null;
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/** OMDb writes "N/A" where other APIs write null, and it means the same thing. */
function field(raw: Json, key: string): string | null {
  const v = raw[key];
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" || s === "N/A" ? null : s;
}

/** "406,287" → 406287 · "$354,223,803" → 354223803 · "129 min" → 129 */
function digits(s: string | null): number | null {
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function decimal(s: string | null): number | null {
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Pure. The whole point of exporting this separately from the fetcher. */
export function parseOmdb(json: unknown): ApiResult<OmdbSummary> {
  if (!isObj(json)) return apiFail("OMDb returned a non-object response");
  // Trap 2. This is the only signal that anything went wrong.
  if (field(json, "Response") !== "True") {
    return apiFail(field(json, "Error") ?? "OMDb reported a failure");
  }
  const imdbId = field(json, "imdbID");
  if (!imdbId) return apiFail("OMDb response carries no imdbID");

  // Trap 1. Match on Source, and tolerate the "83%" formatting.
  let tomatometer: number | null = null;
  if (Array.isArray(json.Ratings)) {
    for (const r of json.Ratings) {
      if (!isObj(r) || field(r, "Source") !== "Rotten Tomatoes") continue;
      const pct = digits(field(r, "Value"));
      if (pct !== null && pct >= 0 && pct <= 100) tomatometer = pct;
    }
  }

  const metascore = digits(field(json, "Metascore"));
  return apiOk({
    imdbId,
    tomatometer,
    metascore: metascore !== null && metascore >= 0 && metascore <= 100 ? metascore : null,
    imdbRating: decimal(field(json, "imdbRating")),
    imdbVotes: digits(field(json, "imdbVotes")),
    boxOfficeDomestic: digits(field(json, "BoxOffice")),
    awards: field(json, "Awards"),
    released: field(json, "Released"),
    runtimeMin: digits(field(json, "Runtime")),
  });
}

export function omdbConfigured(): boolean {
  return Boolean(process.env.OMDB_API_KEY?.trim());
}

/**
 * Look a film up by IMDb id.
 *
 * revalidate 900: fifteen minutes is short enough that a Monday-morning
 * suggestion is current and long enough that re-rendering the capture page
 * doesn't hammer a free-tier key.
 */
export async function fetchOmdb(
  imdbId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<ApiResult<OmdbSummary>> {
  const key = process.env.OMDB_API_KEY?.trim();
  if (!key) return apiFail("OMDb is not configured (OMDB_API_KEY is unset).");
  if (!/^tt\d+$/.test(imdbId)) return apiFail(`"${imdbId}" is not an IMDb id`);

  try {
    const res = await fetchImpl(
      `${API}?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdbId)}&tomatoes=short`,
      { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: 900 } },
    );
    // res.ok is checked for completeness, but see trap 2 — it is not the
    // meaningful test, and parseOmdb does that one.
    if (!res.ok) return apiFail(`OMDb responded ${res.status}`, res.status);
    return parseOmdb(await res.json());
  } catch (e) {
    return apiFail(e instanceof Error ? e.message : "OMDb request failed");
  }
}
