// The Open Peeps atom manifests — PURE DATA, importable from client and
// server alike (the same split lib/peep vs lib/peep-svg made on 2026-08-07:
// anything a client component needs must not sit next to node:fs).
//
// These name the committed files under public/peeps/atoms/<category>/. The
// arrays are the validation allowlist for /api/peep-head AND the option lists
// the future dress-up builder renders, so a new atom lands by being added in
// exactly two places: the file, and its slug here.
//
// ORDER IS LOAD-BEARING. Derived avatars index into these arrays by name
// hash, so REORDERING (or inserting anywhere but the end) re-rolls every
// derived avatar in the app. Append only.

export const HEAD_ATOMS = [
  "afro", "bangs", "bangs-2", "bantu-knots", "bear", "bun", "bun-2", "buns",
  "cornrows", "cornrows-2", "flat-top", "flat-top-long", "gray-bun",
  "gray-medium", "gray-short", "hat-beanie", "hat-hip", "hijab", "long",
  "long-afro", "long-bangs", "long-curly", "medium-1", "medium-2", "medium-3",
  "medium-bangs", "medium-bangs-2", "medium-bangs-3", "medium-straight",
  "mohawk", "mohawk-2", "no-hair-1", "no-hair-2", "no-hair-3", "pomp",
  "shaved-1", "shaved-2", "shaved-3", "short-1", "short-2", "short-3",
  "short-4", "short-5", "turban", "twists", "twists-2",
] as const;

export const FACE_ATOMS = [
  "angry-with-fang", "awe", "blank", "calm", "cheeky", "concerned",
  "concerned-fear", "contempt", "cute", "cyclops", "driven", "eating-happy",
  "explaining", "eyes-closed", "fear", "hectic", "loving-grin-1",
  "loving-grin-2", "monster", "old", "rage", "serious", "smile", "smile-big",
  "smile-lol", "smile-teeth-gap", "solemn", "suspicious", "tired",
  "very-angry",
] as const;

export const FACIAL_HAIR_ATOMS = [
  "chin", "full", "full-2", "full-3", "full-4", "goatee-1", "goatee-2",
  "moustache-1", "moustache-2", "moustache-3", "moustache-4", "moustache-5",
  "moustache-6", "moustache-7", "moustache-8", "moustache-9",
] as const;

// Calibrated for the dress-up builder (2026-08-08 probe: one eye-line anchor
// serves the set). Still NOT in derivation — an eyepatch is a statement
// someone should choose, not roll.
export const ACCESSORY_ATOMS = [
  "eyepatch", "glasses", "glasses-2", "glasses-3", "glasses-4", "glasses-5",
  "sunglasses", "sunglasses-2",
] as const;

// Bodies exist for the dress-up bust — the profile page's full figure. Not in
// avatar derivation: a 24px circle never shows one.
export const BODY_ATOMS = [
  "blazer-black-tee", "button-shirt-1", "button-shirt-2", "coffee", "device",
  "dress", "explaining", "fur-jacket", "gaming", "gym-shirt", "hoodie",
  "killer", "macbook", "paper", "pointing-up", "polka-dot-jacket",
  "polo-and-sweater", "shirt-and-coat", "sporty-tee", "striped-pocket-tee",
  "striped-tee", "sweater", "sweater-dots", "tee-1", "tee-2",
  "tee-arms-crossed", "tee-selena", "thunder-t-shirt", "turtleneck",
  "whatever",
] as const;

export type PeepHead = {
  head: string;
  face: string;
  facialHair: string | null;
};

/** The dress-up composition — what update_peep_parts stores. Accessory and
 *  body are builder-only; a derived peep never carries either. */
export type PeepParts = PeepHead & {
  accessory?: string | null;
  body?: string | null;
};

/** profiles.peep_parts (snake_case jsonb) → PeepParts, with every slug checked
 *  against the manifests. Anything off-catalogue returns null — the reader
 *  falls back to derivation rather than ever passing a bad slug forward. */
export function parsePeepParts(raw: unknown): PeepParts | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const has = (list: readonly string[], v: unknown): v is string =>
    typeof v === "string" && list.includes(v);
  if (!has(HEAD_ATOMS, o.head) || !has(FACE_ATOMS, o.face)) return null;
  if (o.facial_hair !== undefined && !has(FACIAL_HAIR_ATOMS, o.facial_hair)) return null;
  if (o.accessory !== undefined && !has(ACCESSORY_ATOMS, o.accessory)) return null;
  if (o.body !== undefined && !has(BODY_ATOMS, o.body)) return null;
  return {
    head: o.head,
    face: o.face,
    facialHair: (o.facial_hair as string | undefined) ?? null,
    accessory: (o.accessory as string | undefined) ?? null,
    body: (o.body as string | undefined) ?? null,
  };
}

// FNV-1a — the same tiny hash avatarFor uses, duplicated deliberately: this
// module must stay import-light, and the two derivations feed on the same
// input (the display name) so a player's colours and their face travel
// together through a rename.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The derived head for a name — what everyone shows until the dress-up
 * builder ships and stores choices. Distinct hash bytes per part, the
 * avatarFor trick, so head/face/facial-hair vary independently; facial hair
 * lands on roughly a third of derivations rather than all of them, because a
 * league where everyone has a beard is its own kind of collision.
 */
export function derivePeepHead(name: string): PeepHead {
  const h = hash(name.trim().toLowerCase());
  const wantsFacialHair = Math.floor(h / 17) % 3 === 0;
  return {
    head: HEAD_ATOMS[h % HEAD_ATOMS.length],
    face: FACE_ATOMS[Math.floor(h / 251) % FACE_ATOMS.length],
    facialHair: wantsFacialHair
      ? FACIAL_HAIR_ATOMS[Math.floor(h / 65537) % FACIAL_HAIR_ATOMS.length]
      : null,
  };
}

/**
 * The derived BODY for a name — the profile page's full figure, and nothing
 * else (2026-08-09, peep-legacy-cleanup).
 *
 * It exists because retiring the 24 templates removed the only full-figure
 * fallback: a player who has never opened the dress-up builder was suddenly a
 * head floating in the colour band, because derivePeepHead has no body and the
 * bust composer draws what it is given.
 *
 * Kept SEPARATE from derivePeepHead rather than folded into it, which would
 * have been one fewer function: avatar derivation must not gain a body. Every
 * avatar circle in the app is 24-40px of head, the endpoint would compose a
 * bust and throw the body away on every request, and the cache key would change
 * for every player in the app to no visible effect.
 *
 * A distinct hash byte from the head parts, so a name's face and its clothes
 * vary independently — the avatarFor trick, for the same reason.
 */
export function derivePeepBody(name: string): string {
  const h = hash(name.trim().toLowerCase());
  return BODY_ATOMS[Math.floor(h / 4099) % BODY_ATOMS.length];
}

/**
 * The composition format version. The endpoint's responses are cached
 * IMMUTABLE for a year, which means a change to the composition itself —
 * anchors, substitution mechanics, atom revisions — must change the URL or
 * every returning browser keeps serving the old bytes forever. That is not
 * hypothetical: v2 exists because v1's substitution-order bug (white ink
 * clobbered by the paper replace) shipped blank avatars into this cache
 * during development. Bump on any change to the route's OUTPUT.
 */
const PEEP_HEAD_VERSION = "3";

/** The /api/peep-head URL for a composition — the img/image src builder. */
export function peepHeadUrl(
  parts: PeepParts | PeepHead,
  colours: { ink: string; paper: string },
): string {
  const q = new URLSearchParams({
    v: PEEP_HEAD_VERSION,
    head: parts.head,
    face: parts.face,
    ink: colours.ink,
    paper: colours.paper,
  });
  if (parts.facialHair) q.set("fh", parts.facialHair);
  if ("accessory" in parts && parts.accessory) q.set("acc", parts.accessory);
  return `/api/peep-head?${q.toString()}`;
}

/** The bust variant — the same endpoint with a body, for the builder's
 *  preview. The profile page composes server-side instead and never fetches
 *  this. */
export function peepBustUrl(
  parts: PeepParts,
  colours: { ink: string; paper: string },
): string {
  const base = peepHeadUrl(parts, colours);
  return parts.body ? `${base}&body=${encodeURIComponent(parts.body)}` : base;
}
