/**
 * DERIVED AVATAR IDENTITY — a colour, and nothing stored.
 *
 * ── WHY NOTHING IS STORED ──────────────────────────────────────────────
 * The standard shape for this is a resolution chain: an uploaded picture, then
 * an identity provider's photo, then something derived so nobody is ever a
 * blank circle. This app has only the last rung, which means a person's colour
 * is a FUNCTION of who they are rather than a row anybody has to write. No
 * column, no backfill, no picker, and no signup step that can fail.
 *
 * ── HASHED ON THE ID, NOT THE NAME ─────────────────────────────────────
 * A display name is a label: it changes, and two accounts may share one. An id
 * never does either. The retired peep derivation hashed the name deliberately
 * so a rename re-rolled colour and face together — an elegant idea that makes
 * a person's colour move underneath them, which is the thing people notice and
 * dislike. The same repo had already been bitten by keying identity on a name
 * (ADR-082, where two members sharing a name shared a face), and this is that
 * lesson applied to the derived side.
 *
 * ── EVERY FILL TAKES WHITE INK ─────────────────────────────────────────
 * These ten were curated for GLYPHS, where WCAG asks 3:1. Initials are TEXT and
 * the bar is 4.5:1, which teal, cyan and orange all failed. Rather than carry a
 * per-colour light/dark ink decision, amber and green were darkened as well so
 * the whole set clears 4.5:1 against white — 4.60 at the tightest (pink), 5.70
 * at the loosest (violet). There is now no ink decision to get wrong.
 *
 * ── INLINE STYLE, DELIBERATELY ─────────────────────────────────────────
 * `--color-*: initial` in globals.css deletes Tailwind's stock palette, so
 * there is no `bg-blue-600` to reach these with and never will be. They are
 * DATA, not design tokens: they answer "which of ten", not "what colour is a
 * surface". An inline `background` is also outside the blast radius of any
 * future token rename.
 */

/**
 * The ten fills — spread by HUE, not just picked.
 *
 * The set these replace had two 9° pairs in it, violet/purple and amber/orange,
 * which is not ten colours: it is eight, twice. Four fixture leagues rendered
 * and three read as the same purple. It also left a 116° hole between orange
 * and green, so nothing in the app was ever yellow. These are ~17° apart at the
 * tightest, and every one clears 4.5:1 against white — 4.60 at the tightest
 * (pink), 6.98 at the loosest (purple).
 *
 * Order is not load-bearing: a colour is derived fresh on every render and
 * never stored, so reordering costs nothing but a re-roll.
 */
export const AVATAR_FILLS = [
  "#dc2626", // red      0°  4.83
  "#c2410c", // orange  17°  5.18
  "#a16207", // yellow  35°  4.92
  "#4d7c0f", // lime    86°  4.99
  "#15803d", // green  142°  5.02
  "#0f766e", // teal   175°  5.47
  "#0369a1", // sky    201°  5.93
  "#4f46e5", // indigo 243°  6.29
  "#7e22ce", // purple 272°  6.98
  "#db2777", // pink   333°  4.60
] as const;

/** FNV-1a. Not cryptographic and does not need to be — it needs to spread
 *  evenly and to give the same answer on the server and in the browser, or an
 *  avatar changes colour when the page hydrates. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The fill for a stable id — a profile id for a person, a league id for a
 * league. Falls back to the first colour on an empty id rather than throwing:
 * a missing id is a data problem, not a reason for a page to fail to render.
 *
 * TEN COLOURS IS FEWER THAN IT FEELS. Eight people in one league collide with
 * 98% probability, ten with 99.96%. Colour is variety, not identification —
 * the initials and the shape are what tell two players apart, which is also
 * why colour is never the only carrier of a distinction on screen.
 */
export function avatarFill(id: string): string {
  if (!id) return AVATAR_FILLS[0];
  return AVATAR_FILLS[hash(id) % AVATAR_FILLS.length];
}
