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
 * ── THE COLOURS ARE TOKENS, NOT A SECOND PALETTE ───────────────────────
 * `--series-1` … `--series-10` already exist in `globals.css`: ten hues derived
 * from one brand anchor, spaced 36° apart — an exact decagon — declared in both
 * modes and swept by `a11y:contrast`. They were introduced for the bump chart
 * and are the app's answer to "ten of something", so an avatar is the second
 * consumer of one palette rather than the first consumer of a second one.
 *
 * This replaces ten hand-picked hexes that were, in order: borrowed from a
 * stock palette this theme deletes on purpose (`--color-*: initial`), foreign
 * to the app's ink-and-vermilion world, and defined for light mode only. The
 * first attempt at them also shipped two 9° pairs — violet/purple and
 * amber/orange — so ten colours behaved as eight and three of four fixture
 * leagues rendered the same purple. A palette that is already a decagon cannot
 * make that mistake.
 *
 * ── THE INK DECISION DISAPPEARS ────────────────────────────────────────
 * The series are pale on paper and deep on ink, so `--foreground` is correct on
 * every one of them in both modes: 6.61:1 at worst in light, 6.01:1 at worst in
 * dark, against a 4.5:1 bar. There is no per-colour light/dark ink rule left to
 * carry, and no value that has to be re-checked when the theme moves.
 *
 * ── A `var()`, NOT A HEX ───────────────────────────────────────────────
 * Returned as a CSS variable reference so the value follows the theme rather
 * than being frozen at build time. It goes through an inline `style` because
 * the index is computed — Tailwind cannot generate `bg-series-${n}` from a
 * runtime number. `bump-chart.tsx` reads the same tokens the same way.
 */

/** How many series tokens `globals.css` declares. Adding an eleventh means
 *  adding it there first, in BOTH modes, or a tenth of everyone renders with an
 *  undefined variable and no background at all. */
const SERIES_COUNT = 10;

/** FNV-1a. Not cryptographic and does not need to be — it needs to spread
 *  evenly and to give the same answer on the server and in the browser, or an
 *  avatar changes colour when the page hydrates. Measured at 9.90%–10.10% per
 *  bucket across 200k v4 UUIDs. */
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
 * league — as a `var(--series-N)` reference. Falls back to the first series on
 * an empty id rather than throwing: a missing id is a data problem, not a
 * reason for a page to fail to render.
 *
 * TEN COLOURS IS FEWER THAN IT FEELS. Eight people in one league collide with
 * 98% probability, ten with 99.96%. Colour is variety, not identification —
 * the initials and the shape are what tell two players apart, which is also
 * why colour is never the only carrier of a distinction on screen.
 */
export function avatarFill(id: string): string {
  const n = id ? (hash(id) % SERIES_COUNT) + 1 : 1;
  return `var(--series-${n})`;
}
