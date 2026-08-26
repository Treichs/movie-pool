// The ADR-050 avatar palette, as PURE DATA.
//
// Split out of composed/player-avatar.tsx so three things can share one
// definition without pulling React or lucide with it: the component that
// renders an avatar, the settings picker that offers the choices, and the
// settings SPIKE that asserts these values agree with the database's check
// constraints. A Node spike cannot import a .tsx module, and that is exactly
// why the palette could otherwise drift away from the constraint unnoticed.
//
// The pairs are curated to hold up on BOTH the light and dark surfaces
// (saturated mid-tones, roughly the same OKLCH lightness band the chart tokens
// were validated against) and are rendered through inline style, which is what
// keeps governance G1 — no raw palette CLASSES — untouched. Do not add pale or
// near-black pairs without checking them on both themes.
//
// Adding or removing an entry here is a DATA MIGRATION: profiles.avatar_pair
// stores an index into this array, and profiles_avatar_pair_range constrains
// it. The settings spike fails if the two stop agreeing.

// THE INK FIELD IS NOT A CLASS NAME ANY MORE (Ruling 76, 2026-08-22), and the
// rename is the fix rather than cosmetics. It used to be `glyphClass`, holding
// the literal strings `"text-white"` and `"text-black/80"`, spread into a
// `className` at three call sites (league-mark.tsx, create-league-wizard.tsx,
// league-identity-form.tsx). `--color-*: initial` in tokens.css deleted `white`
// and `black` from the palette, so BOTH strings stopped naming a real class:
// all three glyphs quietly fell back to the inherited `text-foreground` and
// were drawn in the page's ink over a saturated fill.
//
// A fourth consumer was already doing the right thing and is what made the trap
// visible — player-avatar.tsx read the field and converted it to a HEX for an
// SVG substitution, so the peep faces were never affected. One field being read
// two ways, one of them dead, is the shape this rename removes: it is a
// contrast DECISION, so it is stored as one, and `glyphInkHex()` below is the
// single place that decision becomes a colour.
export type AvatarStyle = {
  fill: string;
  border: string;
  /** Whether the glyph should be light or dark for contrast on `fill`. */
  glyphInk: "light" | "dark";
};

export const AVATAR_PAIRS: AvatarStyle[] = [
  { fill: "#7c3aed", border: "#a78bfa", glyphInk: "light" }, // violet
  { fill: "#db2777", border: "#f472b6", glyphInk: "light" }, // pink
  { fill: "#0d9488", border: "#5eead4", glyphInk: "light" }, // teal
  { fill: "#d97706", border: "#fbbf24", glyphInk: "dark" }, // amber
  { fill: "#2563eb", border: "#93c5fd", glyphInk: "light" }, // blue
  { fill: "#dc2626", border: "#fca5a5", glyphInk: "light" }, // red
  { fill: "#16a34a", border: "#86efac", glyphInk: "light" }, // green
  { fill: "#9333ea", border: "#d8b4fe", glyphInk: "light" }, // purple
  { fill: "#ea580c", border: "#fdba74", glyphInk: "light" }, // orange
  { fill: "#0891b2", border: "#67e8f9", glyphInk: "light" }, // cyan
];

/**
 * The pair's contrast decision as a literal colour, for an inline `style`.
 *
 * INLINE STYLE, DELIBERATELY, and it is the same reason `fill` and `border` are
 * inline: these ten colours are DATA — an index stored in `profiles.avatar_pair`
 * — not design tokens, so they never became Tailwind classes and there is no
 * utility to reach them with. It is also what keeps them outside the palette
 * reset's blast radius entirely: an inline `color:` cannot be deleted by a
 * `--color-*` namespace change, which is exactly what happened to the class
 * spelling this replaced.
 *
 * `#262626` rather than a pure black: it is the dark ink these pairs were
 * curated against (only `amber` uses it), and it is what player-avatar.tsx has
 * been substituting into the peep SVG all along. Kept identical so the glyph
 * marks and the peep faces cannot drift apart.
 */
export function glyphInkHex(style: AvatarStyle): string {
  return style.glyphInk === "light" ? "#ffffff" : "#262626";
}

// Movie-night glyphs. These keys are STABLE — they are the stored
// avatar_glyph values and are named in a check constraint, so renaming one is
// a data migration, not a refactor.
export const GLYPH_KEYS = [
  "clapperboard",
  "film",
  "popcorn",
  "ticket",
  "star",
  "crown",
  "rocket",
  "ghost",
  "sparkles",
  "video",
  "cat",
  "glasses",
] as const;

export type GlyphKey = (typeof GLYPH_KEYS)[number];

/** A player's stored ADR-050 choice: an index into AVATAR_PAIRS plus a glyph. */
export type AvatarChoice = { pair: number; glyph: GlyphKey };

/**
 * profile id -> choice, for every chosen avatar the viewer can see.
 *
 * Keyed by id since ADR-082 — a display name is a label and two accounts may
 * share one. A plain object so it crosses the server/client boundary as-is. It
 * lives here rather than beside the React provider because lib/avatar.ts builds
 * it, and R2 forbids the data layer importing UI components.
 */
export type AvatarOverrides = Record<string, AvatarChoice>;

/** Narrow an arbitrary string to a known glyph key. */
export function isGlyphKey(value: string): value is GlyphKey {
  return (GLYPH_KEYS as readonly string[]).includes(value);
}
