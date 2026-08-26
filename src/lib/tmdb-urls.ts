// Pure TMDB-derived URLs — split out of the client (fl-frontend-rebuild Task 5)
// rather than left there.
//
// None of these make a network call: they format a path TMDB already returned
// into a URL, or a video key into an embed link. That is domain's own
// definition — "pure: no React, no I/O, no transport, no side effects" — and it
// is what lets `app` keep using them without reaching `infrastructure/clients`,
// which is gated behind `import "server-only"` and, per the layer contract, is
// the one edge a feature may never take directly (it is how the orchestration
// authz gate gets skipped). `posterUrl`/`PosterSize` made the same move one
// tier further out, into src/components/blocks/display/poster-url.ts, because
// their one caller is a registry component and registry may not import domain
// values, only domain types.
//
// TMDB_ATTRIBUTION is here for the same reason: it is a required-by-terms
// string constant, not a fetch.

/** Required by the TMDB terms. Lives here once; rendered by /releases and the drawer. */
export const TMDB_ATTRIBUTION =
  "This product uses the TMDB API but is not endorsed or certified by TMDB.";

// Hard-coded rather than fetched from /configuration on every render. The spike
// asserts it still matches, which turns the day that stops being safe into a
// test failure instead of broken images.
const IMAGE_BASE = "https://image.tmdb.org/t/p/";

/** Backdrop widths. `original` stays absent — 2-5 MB. */
export type BackdropSize = "w300" | "w780" | "w1280";

export function backdropUrl(
  path: string | null | undefined,
  size: BackdropSize = "w1280",
) {
  return path ? `${IMAGE_BASE}${size}${path}` : null;
}

/** Cast headshot. Small on purpose — these render as a row of thumbnails. */
export function profileUrl(path: string | null | undefined) {
  return path ? `${IMAGE_BASE}w185${path}` : null;
}

/** The one place a trailer key becomes a URL. nocookie: no third-party
 *  tracking cookie is set unless the viewer actually plays the video. */
export function trailerEmbedUrl(key: string | null | undefined) {
  return key ? `https://www.youtube-nocookie.com/embed/${key}` : null;
}
