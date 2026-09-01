/*
 * TOKEN CONTRAST — every colour pair the token set actually forms, checked
 * against the WCAG 2.2 ratios that apply to it.
 *
 * WHY THIS AND NOT THE A11Y SCANNER. The static a11y scanner evaluated on
 * 2026-08-18 reported 829 findings against src/, of which roughly 90% were
 * artefacts of reading source TEXT: it counted an `<img>` inside mark.tsx's
 * comment (a comment whose whole point is "INLINE, NEVER <img src=…>") and an
 * `<input>` inside number-field.tsx's docblock (which says the input is emitted
 * by NumberField.Input and never written by hand). That is the same defect G2
 * carried until `blankComments()` was added — a scanner matching prose as
 * markup. Contrast has no such failure mode: it is arithmetic over two hex
 * values, and the answer is either right or wrong with nothing to interpret.
 *
 * WHY THE THRESHOLDS DIFFER BY PAIR, and why this is the whole design. Applying
 * one bar to every pair is how a check earns a reputation for being wrong:
 *
 *   - TEXT pairs (a -foreground on its surface) are held to AA normal, 4.5:1,
 *     and are the only ones that FAIL THE BUILD. WCAG 1.4.3.
 *   - UI pairs (interactive/state colours on a surface) are held to 3:1 and
 *     WARN. WCAG 1.4.11 sets 3:1 for non-text; warning rather than failing
 *     because whether a given token is load-bearing as a control boundary is a
 *     judgement this script cannot make.
 *   - RAMP pairs (chart-1..5, series-1..10) are REPORTED ONLY, never gated.
 *     chart-* is a sequential ramp — one hue at five lightnesses — where the
 *     dark end is SUPPOSED to be dark, and failing it against the background
 *     would be reporting the ramp for being a ramp. globals.css says so
 *     directly at the --chart-1 declaration.
 *
 * Usage:
 *   node scripts/a11y/contrast.mjs           # human table, exit 1 on a text failure
 *   node scripts/a11y/contrast.mjs --json    # machine
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { blankComments, blankCssComments } from "./_source-text.mjs";

// globals.css is the whole theming system in this repo — every :root/.dark
// declaration and every @theme mapping this script parses lives in that one
// file. There is no separate tokens.css to point at.
export const CSS_DEFAULT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "app",
  "globals.css",
);

/** Surfaces something can be drawn ON. Order is display order, not precedence.
 *
 * `nav` STAYS ON THIS LIST because it is still the surface `buildPairs()`
 * checks text against — what changed across Task 0.1's two fix rounds
 * (2026-08-23) is WHICH token gets checked there for two of its pairings, not
 * whether nav is checked at all.
 *
 * `foreground on nav` (1.12) was reported here as a FALSE positive: it was
 * the residue of the C1 bug (the header inheriting `text-foreground` from
 * <body>), and no site in the app performs that pairing any more — nav owns
 * its own `--nav-foreground` (Ruling 75) and every real caller uses it. The
 * FREE_TEXT loop in `buildPairs()` checks `nav-foreground on nav` (19.12,
 * passing) in its place, so this row is gone rather than perpetually red for
 * a pairing nothing renders. THIS was the one genuine false positive in the
 * bunch — see below for why `card`, `popover`, `muted`, `accent`, `secondary`
 * and `sidebar` are NOT the same case despite each owning a sibling too.
 *
 * `muted-foreground on nav` (3.89) was the opposite case: a REAL gap, not a
 * false positive. TopLink's inactive state, NavBidTimer's eyebrow and
 * LeagueSwitcher's subtitle all drew `text-muted-foreground` directly on the
 * nav ground, and there was no nav-specific alternative — so an implementer
 * reaching for the obvious muted token landed on a real 3.89:1 failure. The
 * fix was adding the missing token, `--nav-muted-foreground` (fix round 1 of
 * Task 0.1, 2026-08-23), which the loop now checks in its place.
 *
 * WHY NAV IS SPECIAL AND CARD/POPOVER/MUTED/ACCENT/SECONDARY/SIDEBAR ARE NOT
 * (fix round 2, correcting round 1's overreach): those six also own a
 * `-foreground` sibling, and round 1 read "owns a sibling" as the whole
 * signal and silenced `foreground on <that-surface>` for all seven — which
 * deleted six PASSING, deliberately-kept over-approximation guards to fix one
 * real bug. `nav` is not "a surface with a sibling"; it is a surface whose
 * sibling INVERTS the role (`--nav-foreground` sits on the opposite side of
 * AA from generic `--foreground` against `--nav` — one passes, one fails).
 * The other six's siblings AGREE with generic `--foreground` closely enough
 * to land on the same side of AA, so checking the generic token there is
 * redundant-but-harmless today and stays load-bearing the moment a palette
 * pass makes them diverge — exactly the case the original version of this
 * file's SURFACES comment was written to keep measuring, before round 1
 * overwrote it. See the FREE_TEXT loop in `buildPairs()` for the corrected,
 * value-derived rule.
 */
const SURFACES = [
  "background",
  "card",
  "popover",
  "secondary",
  "muted",
  "accent",
  "sidebar",
  "nav",
  "surface",
  "surface-secondary",
  "surface-tertiary",
];

/** Text colours that get placed on an arbitrary surface rather than on a paired one. */
const FREE_TEXT = ["foreground", "muted-foreground"];

/**
 * The state and accent colours — the tokens that are neither a surface, a
 * `-foreground` sibling, nor a ramp. WHICH THRESHOLD EACH ONE IS HELD TO IS
 * DERIVED FROM USAGE, NOT WRITTEN HERE — see `deriveStateKinds()`.
 *
 * THIS LIST USED TO CARRY THE THRESHOLD TOO, AND THAT IS WHY THREE TOKENS
 * SHIPPED WRONG. Until 2026-08-24 it was `const UI_TOKENS = [...]` and every
 * name on it was paired as `"ui"` at 3:1 — a threshold that only WARNS. Three
 * of the six were dominantly TEXT colours:
 *
 *   --destructive   27 `text-destructive`  vs 13 `bg-destructive`
 *   --success       32 `text-success`      vs  7 `bg-success`
 *   --warning        9 `text-warning`      vs  7 `bg-warning`
 *
 * So `--warning: #EB4B37` (vermilion) was measured at 3.42:1 against a 3:1 bar,
 * passed, printed a green row, and rendered an AA-failing caution notice in
 * every league. One array put three tokens in the wrong bucket. Moving the
 * three by hand would have fixed those three and left the mechanism intact,
 * so the threshold is now a QUESTION ABOUT THE SOURCE rather than an entry in
 * a list: a token used as `text-x` anywhere in `src/` is held to AA text.
 *
 * `link` IS NEW ON THIS LIST (2026-08-24). Its site count is in the BUCKETS
 * block this run prints (16 on 2026-08-25) — it is
 * the token `ui/button.tsx`, `ui/field.tsx`, `ui/empty.tsx` and `ui/item.tsx`
 * were all re-pointed AT, as the AA-passing alternative to `text-primary` —
 * and it was never checked against a surface at all. It passes (7.24:1 on
 * paper), which is the point: the fix everyone reached for was unmeasured.
 *
 * WHAT IS STILL A JUDGEMENT AND STAYS LISTED: which tokens are state colours.
 * Deriving THAT from usage too pulls in `--border` (1.20:1 on paper) and
 * `--input` (1.03:1) as permanent UI warnings, and a hairline border is not a
 * control boundary this script can rule on — the same judgement the header
 * already declines to make. `checkUncovered()` below closes the drift this
 * leaves: a colour token used as `text-*` that NO pair covers fails the run.
 */
const STATE_TOKENS = ["primary", "nav-primary", "ring", "destructive", "success", "warning", "highlight", "link"];

/**
 * THE `--primary` CARVE-OUT IS GONE, and this note is what is left of it.
 *
 * From 2026-08-24 to 2026-08-28 this file forced `--primary` into the UI
 * bucket — measured at 3:1 rather than 4.5:1 — by standing ruling, because
 * vermilion `#EB4B37` was 3.42:1 as text on paper and the developer had
 * declined a large-type exception. Six `text-primary` sites were genuine
 * small-text AA failures held open by it.
 *
 * The palette pass on 2026-08-28 removed the reason rather than the symptom.
 * `--primary` is now `#C52F1B` at 5.04:1 on paper, so it is measured as text
 * like every other token and needs no exception; the ink-side red kept its
 * old value under `--nav-primary`, where 5.59:1 was always legal. An exception
 * whose cause is fixed is deleted, not left to rot — which is what its own
 * staleness check (`assertCarveOutLive`, also gone) existed to force.

/** Reported, never gated — see header. */
const RAMP = /^(chart-\d+|series-\d+|chart-points|chart-efficiency)$/;

/** The tree `deriveStateKinds()` reads. Everything Tailwind can see. */
export const SRC_DEFAULT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
);

/** Every `<prefix>-<token>` utility written in `src/`, COMMENTS BLANKED FIRST.
 *
 * BLANKING IS NOT OPTIONAL HERE, for the same reason it is not optional in
 * `parseTokens()`. This repo documents its class choices in prose that quotes
 * the classes — `ui/field.tsx` has a comment reading "`[&>a:hover]:text-primary`
 * → `[&>a:hover]:text-link`", `bid-form.tsx:408` reads "WHAT THIS REPLACES:
 * `ring-success`". A raw scan reads 40 `text-destructive` where there are 27,
 * and would promote a token named ONLY in a comment into the text bucket. The
 * blanker is the shared TypeScript-parser one (Ruling 64/66), so a class inside
 * a string survives and a class inside a comment does not.
 */
export function deriveUtilityUsage(srcDir = SRC_DEFAULT) {
  const used = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(entry.name)) {
        const blanked = blankComments(readFileSync(full, "utf8"), {
          syntax: entry.name.endsWith(".tsx") ? "jsx" : "js",
        });
        const re =
          /(?<![a-zA-Z0-9-])(text|bg|border|ring|fill|stroke|decoration|outline|divide|caret)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![a-zA-Z0-9-])/g;
        for (const m of blanked.matchAll(re)) {
          const key = `${m[1]}|${m[2]}`;
          used.set(key, (used.get(key) ?? 0) + 1);
        }
      }
    }
  };
  walk(srcDir);
  return used;
}

/**
 * text-or-ui, per state token, from what the app actually writes.
 *
 * A TOKEN USED BOTH WAYS TAKES THE HIGHER BAR. `--destructive` is 27
 * `text-destructive` AND 13 `bg-destructive`; it is held to 4.5:1, because a
 * colour that is ever a foreground has to be legible as one, and a colour that
 * clears 4.5 has already cleared 3. The strict reading is the only one that is
 * safe in a direction — the loose reading is what shipped vermilion as caution.
 *
 * A state token nothing uses at all forms no pair. That is a real reduction in
 * coverage and `MIN_PAIRS` is what notices it.
 */
export function deriveStateKinds(usage) {
  const kinds = new Map();
  for (const name of STATE_TOKENS) {
    const asText = usage.get(`text|${name}`) ?? 0;
    const asSurface =
      (usage.get(`bg|${name}`) ?? 0) +
      (usage.get(`border|${name}`) ?? 0) +
      (usage.get(`ring|${name}`) ?? 0);
    if (asText > 0) kinds.set(name, "text");
    else if (asSurface > 0) kinds.set(name, "ui");
  }
  return kinds;
}



/**
 * A colour token written as `text-<name>` that NO pair-building loop covers.
 *
 * THE DRIFT GATE ON `STATE_TOKENS`. That list is the one judgement left in
 * this file, and a judgement can go stale — `link` sat outside it for as long
 * as it existed, unchecked, while being the token every AA fix was pointed at.
 * This turns "someone added an accent colour and nobody added it to the list"
 * from silence into a failed run.
 *
 * SURFACES ARE EXCLUDED because `text-background` on `bg-foreground` (the ink
 * button) is the exact inverse of `foreground on background`, which the
 * free-text loop already measures, and a contrast ratio is symmetric.
 */
export function checkUncovered(tokens, usage) {
  const covered = new Set([...STATE_TOKENS, ...FREE_TEXT, ...SURFACES]);
  const out = [];
  for (const [key, count] of usage) {
    const [prefix, name] = key.split("|");
    if (prefix !== "text") continue;
    if (covered.has(name) || name.endsWith("-foreground")) continue;
    if (RAMP.test(name)) continue;
    if (!tokens.has(name) || !toRgb(tokens.get(name))) continue;
    out.push({ token: name, count });
  }
  return out;
}

/**
 * A state colour that is BYTE-IDENTICAL to the mode's ink or its paper.
 *
 * THE CHECK THAT WOULD HAVE CAUGHT TWO OF THE THREE, and no ratio can. Before
 * 2026-08-24 `--destructive` and `--success` were `#000000` in light and
 * `#F5F4F3` in dark — the literal value of `--foreground` in each mode. Every
 * ratio was perfect (19.12:1, 21:1) and every row printed green, because the
 * defect is not low contrast: it is that an error message and a confirmation
 * were indistinguishable from the body copy above them. Reclassifying them as
 * TEXT does not catch it either — black on paper passes AA handsomely.
 *
 * RUN IN BOTH MODES, unlike everything else in this file. `parseTokens()` is
 * :root-scoped and a `.dark`-scoped ratio sweep is still out of scope (see its
 * docstring), but an EQUALITY test needs no surface set and no thresholds, so
 * there is no reason for the dark palette to go unchecked by it. Dark
 * `--success: #F5F4F3` was exactly this defect and nothing in this repo could
 * see it.
 *
 * ONLY TOKENS THE APP RENDERS AS TEXT, and the first version of this check did
 * not say so — it fired on `--ring`, which is `#000000` in light and `#F5F4F3`
 * in dark, i.e. ink in both. That is not the defect: a focus ring is drawn as
 * `focus-visible:border-ring` and `ring-ring/30`, never as a glyph, and an ink
 * focus ring is a deliberate and unremarkable choice. The confusion this check
 * exists to catch is between a MESSAGE and the body copy next to it, which can
 * only happen to a colour something writes words in. Read off raw `text-*`
 * usage rather than the derived bucket, deliberately: whether a token is
 * rendered as text is a fact about the source, while the bucket carries the
 * `--primary` threshold ruling, and a threshold decision has no business
 * changing what counts as an identity collision.
 */
export function identityCollisions(css, usage) {
  const out = [];
  const rendersText = (name) => (usage.get(`text|${name}`) ?? 0) > 0;
  for (const mode of [":root", ".dark"]) {
    const t = resolveVars(parseTokens(css, mode));
    for (const [role, label] of [["foreground", "the mode's ink"], ["background", "the mode's paper"]]) {
      const value = t.get(role);
      if (!value) continue;
      for (const name of STATE_TOKENS) {
        if (!rendersText(name)) continue;
        if (t.get(name) === value) out.push({ mode, token: name, role, label, value });
      }
    }
  }
  return out;
}

/* ==========================================================================
 * THE COMPOSITE GROUNDS — added 2026-08-25 (task B1.4, fix round 1).
 *
 * WHY. Until this block existed, every state token was measured against
 * exactly two grounds, `--background` and `--card`, and EVERY REAL AA RISK IN
 * THIS PALETTE LIVES ON AN ALPHA TINT. The same error was found three times in
 * one day by three different people, each of whom measured every ground they
 * thought of and each of whom missed a deeper one:
 *
 *   round 0  measured `--background`            missed `--card`   (4.17 dark)
 *   round 1  measured `--card`                  missed `bg-primary/5`  (4.32)
 *   round 2  measured `bg-primary/5`            missed `bg-warning/5`
 *                                               INSIDE it        (4.07)
 *
 * A ground nobody thought of is not a thing to think harder about. It is a
 * thing to READ OFF THE SOURCE, which is what this does.
 *
 * ── WHAT IS DERIVED AND WHAT IS JUDGED ────────────────────────────────────
 *
 * DERIVED, and therefore cannot drift — this is the half that just bit us
 * three times, because every miss was "nobody listed that alpha":
 *   · the ALPHA of every wash (`/5`, `/10`, `/15`, `/20`, `/25`, `/30` …),
 *   · WHICH MODE each alpha belongs to (`dark:hover:bg-x/30` is dark-only, and
 *     applying it in light mode reports a failure the light palette cannot
 *     have),
 *   · whether a wash is a token's OWN FILL or an AMBIENT GROUND — an element
 *     whose class list sets a text colour is styling its own content and is a
 *     FILL; one that sets only a ground is a container whose content is
 *     styled elsewhere, and is a GROUND. `bg-destructive/10 text-destructive`
 *     (button, badge, chip) is a fill; `border-primary/40 bg-primary/5 p-4`
 *     (the commissioner panel) is a ground,
 *   · WHICH TOKENS can render on a given ground, from the real JSX ancestry.
 *
 * JUDGED, listed, printed on every run, and gated against drift by
 * `checkUnclassifiedWashes()`: WHICH TOKENS' washes are ambient grounds at
 * all. This is the same shape as `STATE_TOKENS` above and it is a judgement
 * for the same reason — `bg-scrim/30` is painted UNDER a dialog whose content
 * sits on `--popover`, never on the scrim, and no property of the source says
 * so. A derived-membership version of this list was built and measured first:
 * it admits `bg-scrim/30 > --background` and `bg-nav/95 > --background` as
 * grounds for `text-destructive` and reports failures for composites the app
 * cannot form. A noisy check is how a check earns a reputation for being
 * wrong, which is this file's own header, so the list stays and the drift gate
 * carries the risk instead.
 *
 * ── WHY THE ANCESTRY IS PARSED AND NOT GREPPED ────────────────────────────
 * The first version attested a stack whenever the two washes appeared in files
 * connected by the import graph. That is a FILE-level test, and it says
 * `podium.tsx` paints `bg-primary/15` and `podium.tsx` writes `text-destructive`,
 * so destructive text renders on a podium step. It does not: the destructive
 * chip is a SIBLING of the step, in a different list. A file-level test cannot
 * tell an ancestor from a sibling, and the composite question is exactly the
 * ancestor question.
 *
 * So the outer wash is anchored on the JSX element that paints it, using
 * `ts.createSourceFile` — the same parser, for the same reason, as Ruling 66:
 * when a hand enumeration of positions keeps failing, stop enumerating
 * positions and let the grammar settle them. Crossing into a child component
 * is still module-level (a `<Foo>` in the subtree admits everything Foo's
 * module can reach), which is a deliberate over-approximation: a component's
 * variants are all reachable through its props, so "this file can paint that"
 * is the honest answer for a callee.
 *
 * ── DEPTH ─────────────────────────────────────────────────────────────────
 * `MAX_GROUND_DEPTH = 2`. Two is the deepest ambient nesting the tree forms —
 * `release-drift-notice`'s `bg-warning/5` inside `commissioner-week-panel`'s
 * `bg-primary/5`, and the same pair again inside `weeks-panel` — and the run
 * PRINTS every stack it found, so the day a third level lands the printed list
 * is one line longer and this constant is one character away.
 *
 * That bound is stated as what it is: the attested maximum, not a proof. The
 * unbounded version is not available — stacking washes converges on the wash
 * colour itself, so at infinite depth every text token fails by construction,
 * and a bound of "infinity" reports the palette for being a palette. What
 * makes 2 safe rather than convenient is that it is measured from the source
 * on every run and printed, not remembered.
 *
 * ── COST ──────────────────────────────────────────────────────────────────
 * One extra TypeScript parse per `.tsx` file (~0.9s on 366 files) on top of
 * the one `blankComments` already does. It runs in `verify`, not in
 * `governance`.
 * ======================================================================== */

/** Tokens whose alpha washes are AMBIENT GROUNDS — a wash painted under other
 *  components' content. JUDGED; see the block above. */
const GROUND_WASH_TOKENS = ["primary", "warning", "success", "destructive", "highlight", "muted"];

/** Tokens whose alpha washes are NOT grounds for a state colour, each with the
 *  reason. `checkUnclassifiedWashes()` fails the run on a wash token that is
 *  in neither list, so this classification cannot go stale in silence. */
const NOT_A_GROUND_WASH = {
  background: "a near-opaque restatement of the page ground itself, which is already a base",
  surface: "same — `bg-surface/90` is a sticky bar over its own surface, already a base",
  card:
    "same again, and this repo's spelling of it: `bg-card/95` is the bid page's sticky summary bar over its own surface. --card IS one of the base grounds swept below, and 95% of it over --background lands within a rounding error of it, so measuring the composite would restate a pair already covered.",
  nav: "the nav bar's own ground; text there is --nav-foreground, never a state colour",
  "nav-foreground": "the landing hero's inverted panel; it carries its own inverted text",
  scrim: "a modal overlay — the dialog sits ABOVE it on --popover, never on it",
  input: "a field's fill; the value inside it is --foreground and a state colour never lands there",
  border: "a separator rule and a menu divider; nothing sits on it",
  "muted-foreground":
    "the reveal ladder's losing-bid bar. It is a FILL, not a ground: the row is aria-hidden, nothing renders on top of it, and the amount it encodes is printed in full beside it — so the bar is a second rendering of a stated number rather than a graphic anything depends on. What it does need is to stay distinct from its own --muted track, which 40% of --muted-foreground clears comfortably.",
};

const MAX_GROUND_DEPTH = 2;

/** Class-list lexing. WHITESPACE-DELIMITED, NOT REGEX-OVER-PROSE, and the
 *  difference is load-bearing: `dark:[&>[data-slot=x]:is(button,a):hover]:bg-destructive/30`
 *  defeats any `(?:[a-z-]+:)*` variant pattern, because Tailwind's arbitrary
 *  variants contain brackets, colons, parens and commas. Reading the token
 *  from its own left edge is the only way to know whether `dark:` scopes it,
 *  and getting that wrong applies a dark-only hover alpha to the light palette
 *  and reports an AA failure that mode cannot have. Tailwind requires `_` for
 *  spaces inside arbitrary values, so whitespace really is the delimiter. */
function readClassList(text) {
  const washes = [];
  const texts = [];
  for (const cls of String(text).split(/[\s"'`{}]+/)) {
    const w = /(?:^|:)bg-([a-z][a-z0-9-]*)\/(\d+)$/.exec(cls);
    if (w) washes.push({ token: w[1], alpha: Number(w[2]), dark: /(^|:)dark:/.test(cls) });
    const t = /(?:^|:)text-([a-z][a-z0-9-]*)$/.exec(cls);
    if (t && !NON_COLOUR_TEXT.test(t[1])) texts.push(t[1]);
  }
  return { washes, texts };
}

/** `text-sm`, `text-center`, `text-balance` are not colours. */
const NON_COLOUR_TEXT =
  /^(xs|sm|base|lg|xl|[2-9]xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|eyebrow)$/;

const washKey = (w) => `${w.token}/${w.alpha}/${w.dark ? "dark" : "both"}`;

/**
 * Read the ground model out of `src/`: the ambient wash stacks, which tokens
 * render on each, and each token's own fill alphas per mode.
 *
 * Returns `{ stacks, selfTints, ambientTokens, occurrences }` where
 *   stacks       Map "tok/α/mode[ > tok/α/mode]" -> Set(token rendered under it)
 *   selfTints    Map token -> { light: Set(alpha), dark: Set(alpha) }
 *   ambientTokens Set(token) — every token seen as an ambient wash anywhere,
 *                 which is what `checkUnclassifiedWashes()` asks about.
 */
export function deriveGroundModel(srcDir = SRC_DEFAULT) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
    }
  };
  walk(srcDir);

  const resolveSpec = (from, spec) => {
    let base;
    if (spec.startsWith("@/")) base = join(srcDir, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null;
    for (const c of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")])
      if (existsSync(c)) return c;
    return null;
  };

  const moduleTexts = new Map();
  const moduleWashes = new Map();
  const moduleEdges = new Map();
  const selfTints = new Map();
  const ambientTokens = new Set();
  const occurrences = [];

  for (const file of files) {
    const blanked = blankComments(readFileSync(file, "utf8"), {
      syntax: file.endsWith(".tsx") ? "jsx" : "js",
    });

    // MODULE LEVEL — grouped per string literal, because a cva variant map is
    // one decision per string and `ui/button.tsx`'s destructive tint lives in
    // a config object, not on a JSX element.
    const texts = new Set();
    const washes = new Set();
    for (const seg of blanked.split(/["'`]/)) {
      const { washes: w, texts: t } = readClassList(seg);
      for (const x of t) texts.add(x);
      for (const x of w) {
        if (t.includes(x.token)) {
          if (!selfTints.has(x.token)) selfTints.set(x.token, { light: new Set(), dark: new Set() });
          if (!x.dark) selfTints.get(x.token).light.add(x.alpha);
          selfTints.get(x.token).dark.add(x.alpha);
        } else if (!t.length) {
          washes.add(washKey(x));
          ambientTokens.add(x.token);
        }
      }
    }
    moduleTexts.set(file, texts);
    moduleWashes.set(file, washes);

    const edges = new Set();
    for (const im of blanked.matchAll(/import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
      const target = resolveSpec(file, im[2]);
      if (target) edges.add(target);
    }
    moduleEdges.set(file, edges);

    if (!file.endsWith(".tsx")) continue;

    // ELEMENT LEVEL — the outer wash is anchored on the element that paints
    // it, so a sibling is not mistaken for an ancestor. See the block above.
    const sf = ts.createSourceFile(file, blanked, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const subtreeOf = (node) => {
      const src = node.getText(sf);
      const tags = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]));
      const mods = new Set();
      for (const im of blanked.matchAll(/import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
        const names = [...im[1].matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map((m) => m[0]);
        if (!names.some((n) => tags.has(n))) continue;
        const target = resolveSpec(file, im[2]);
        if (target) mods.add(target);
      }
      const st = new Set();
      const sw = new Set();
      for (const seg of src.split(/["'`]/)) {
        const { washes: w, texts: t } = readClassList(seg);
        for (const x of t) st.add(x);
        for (const x of w) if (!t.length) sw.add(washKey(x));
      }
      return { mods, texts: st, washes: sw };
    };
    const visit = (node) => {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const open = ts.isJsxElement(node) ? node.openingElement : node;
        const attr = open.attributes?.properties?.find(
          (p) => p.name?.escapedText === "className" || p.name?.escapedText === "class",
        );
        if (attr?.initializer) {
          const { washes: w, texts: t } = readClassList(attr.initializer.getText(sf));
          for (const x of w) {
            if (t.length) continue;
            if (!GROUND_WASH_TOKENS.includes(x.token)) continue;
            occurrences.push({ file, wash: washKey(x), ...subtreeOf(node) });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  const reachCache = new Map();
  const reach = (starts) => {
    const key = [...starts].sort().join("|");
    if (reachCache.has(key)) return reachCache.get(key);
    const seen = new Set(starts);
    const queue = [...starts];
    while (queue.length) {
      const cur = queue.pop();
      for (const next of moduleEdges.get(cur) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    reachCache.set(key, seen);
    return seen;
  };
  const tokensUnder = (occ) => {
    const out = new Set(occ.texts);
    for (const m of reach(occ.mods)) for (const x of moduleTexts.get(m) ?? []) out.add(x);
    return out;
  };
  const washesUnder = (occ) => {
    const out = new Set(occ.washes);
    for (const m of reach(occ.mods)) for (const x of moduleWashes.get(m) ?? []) out.add(x);
    return out;
  };

  const byWash = new Map();
  for (const occ of occurrences) {
    if (!byWash.has(occ.wash)) byWash.set(occ.wash, []);
    byWash.get(occ.wash).push(occ);
  }
  const stacks = new Map();
  const addStack = (key, tokens) => {
    if (!stacks.has(key)) stacks.set(key, new Set());
    for (const t of tokens) stacks.get(key).add(t);
  };
  for (const occ of occurrences) {
    const outerTokens = tokensUnder(occ);
    addStack(occ.wash, outerTokens);
    if (MAX_GROUND_DEPTH < 2) continue;
    for (const inner of washesUnder(occ)) {
      if (inner === occ.wash) continue;
      if (!GROUND_WASH_TOKENS.includes(inner.split("/")[0])) continue;
      const innerTokens = new Set();
      for (const io of byWash.get(inner) ?? []) for (const t of tokensUnder(io)) innerTokens.add(t);
      addStack(`${occ.wash} > ${inner}`, [...innerTokens].filter((t) => outerTokens.has(t)));
    }
  }
  return { stacks, selfTints, ambientTokens, occurrences };
}

/**
 * A wash token classified as neither a ground nor a non-ground.
 *
 * THE DRIFT GATE ON `GROUND_WASH_TOKENS`, and it is the reason that list is
 * allowed to be a judgement at all. The moment somebody paints
 * `bg-<something-new>/10` under content, this run fails and asks which it is.
 * That is the same contract `checkUncovered()` provides for `STATE_TOKENS`.
 */
export function checkUnclassifiedWashes(ambientTokens) {
  const out = [];
  for (const token of ambientTokens) {
    if (GROUND_WASH_TOKENS.includes(token)) continue;
    if (Object.prototype.hasOwnProperty.call(NOT_A_GROUND_WASH, token)) continue;
    out.push(token);
  }
  return out.sort();
}

/**
 * How deep the ambient-wash nesting has to still go — the second ratchet, and
 * the companion to `MIN_PAIRS`. `MIN_PAIRS` catches the token sweep going
 * quiet; this catches the ANCESTRY WALK going quiet, which is the failure that
 * produces a model measuring one layer less than the tree actually has.
 *
 * 1 while the rebuild has no screens: nothing nests a tinted panel inside a
 * tinted panel yet, so depth 1 is the honest maximum. RAISE IT TO 2 in the same
 * commit as the first screen that nests one. Same habit as `MIN_PAIRS` —
 * raising it is routine, lowering it needs a reason.
 */
export const MIN_STACK_DEPTH = 1;

/**
 * The ground model has to still be finding something.
 *
 * A resolver that silently stops matching — an import alias that changes, a
 * JSX shape the walk does not recognise — produces an EMPTY stack set, and an
 * empty stack set measures nothing and reports clean forever. That is this
 * project's own named failure mode and it is the specific risk this whole
 * block runs. So the run asserts the model is non-empty and that the deepest
 * attested nesting is still there.
 */
export function assertGroundModelLive(model) {
  if (model.occurrences.length === 0)
    throw new Error(
      "deriveGroundModel() found no ambient wash on any JSX element in src/. Either every " +
        "tinted panel was deleted, or the element walk has stopped matching — an empty ground " +
        "model measures nothing and reports clean forever.",
    );
  const deepest = [...model.stacks.keys()].reduce(
    (max, k) => Math.max(max, k.split(" > ").length),
    0,
  );
  if (deepest < MIN_STACK_DEPTH)
    throw new Error(
      `deriveGroundModel() found ambient washes nested ${deepest} deep, but MIN_STACK_DEPTH ` +
        `says ${MIN_STACK_DEPTH}. An ancestry walk that stops matching produces a shallower, ` +
        "still-green model, and a shallower model measures less than it did — this is the " +
        "assertion that catches it. If the nesting was legitimately removed, lower " +
        "MIN_STACK_DEPTH in the SAME commit and say why.",
    );
}

/**
 * Every composite pair: each TEXT/UI state token, on each attested ground
 * stack, bare and under each of its own fill alphas for THIS mode.
 */
export function buildCompositePairs(tokens, stateKinds, model, mode) {
  const isDark = mode === ".dark";
  const hex = new Map([...tokens].filter(([, v]) => toRgb(v)));
  const pairs = [];
  const grounds = [];
  for (const base of ["background", "card"]) {
    if (!hex.has(base)) continue;
    // THE BARE SURFACE IS A GROUND TOO, and leaving it out was a hole the
    // first version of this sweep shipped with: `buildPairs()` measures
    // `destructive on background` flat, but nothing measured
    // `bg-destructive/20 on background` — the very composite the ORIGINAL
    // comment in tokens.css derived by hand at 4.53. A sweep that sees only
    // the exotic grounds and not the ordinary one has moved the blind spot
    // rather than closed it. `renders: null` means every state token, because
    // every state token can land on the page.
    grounds.push({ label: base, hex: hex.get(base), renders: null, bare: true });
    for (const [key, renders] of model.stacks) {
      let value = hex.get(base);
      let ok = true;
      for (const part of key.split(" > ")) {
        const [token, alpha, scope] = part.split("/");
        if (scope === "dark" && !isDark) { ok = false; break; }
        if (!hex.has(token)) { ok = false; break; }
        value = composite(hex.get(token), value, Number(alpha) / 100);
      }
      if (ok) grounds.push({ label: `${key.replace(/\/(both|dark)/g, "")} on ${base}`, hex: value, renders });
    }
  }
  for (const [token, kind] of stateKinds) {
    if (!hex.has(token)) continue;
    const selfAlphas = [...(model.selfTints.get(token)?.[isDark ? "dark" : "light"] ?? [])];
    for (const ground of grounds) {
      if (ground.renders && !ground.renders.has(token)) continue;
      // alpha 0 on a bare surface is `token on background`, which the
      // surface sweep already prints; anywhere else it is a new ground.
      const alphas = ground.bare ? selfAlphas : [0, ...selfAlphas];
      for (const alpha of alphas) {
        const bgHex = alpha === 0 ? ground.hex : composite(hex.get(token), ground.hex, alpha / 100);
        const r = ratio(hex.get(token), bgHex);
        if (r === null) continue;
        const min = kind === "text" ? AA_TEXT : AA_UI;
        pairs.push({
          kind,
          mode,
          composite: true,
          fg: token,
          bg: alpha === 0 ? ground.label : `bg-${token}/${alpha} on ${ground.label}`,
          fgHex: hex.get(token),
          bgHex,
          ratio: round(r),
          min,
          pass: r >= min,
        });
      }
    }
  }
  return pairs;
}

/** Alpha-composite `fg` over `bg` in device sRGB — what the browser paints for
 *  `bg-x/NN`, confirmed empirically against the running app on 2026-08-24. */
function composite(fg, bg, alpha) {
  const f = toRgb(fg);
  const b = toRgb(bg);
  return (
    "#" +
    f
      .map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export const AA_TEXT = 4.5;
export const AA_UI = 3.0;

/**
 * Blank `/* … *\/` comments, preserving newlines so line numbers survive.
 *
 * NOT OPTIONAL, and the first version of this file shipped without it. globals.css
 * documents its own colour choices in prose, and that prose names tokens: line 208
 * reads "measured against --chart-points on --card:" — a `--card:` with no
 * semicolon after it, so a naive scan swallowed twelve lines of commentary as the
 * VALUE of `--card` and then silently dropped every card pair, because the value
 * did not parse as a hex. The failure was invisible: 62 pairs still printed, all
 * green, with `card` simply absent.
 *
 * This is the same defect G2 carried until `blankComments()` was added, and the
 * same one that made the external a11y scanner report an `<img>` inside a comment
 * whose text was "INLINE, NEVER <img src=…>". Three instances now. A scanner over
 * source TEXT must decide what it does about prose before it does anything else.
 */
export function stripComments(css) {
  // FOLDED IN (round 4 review). This was a fourth copy of the blanker, outside
  // the governance chain, while _source-text.mjs's header claimed "there is now
  // one implementation, called at every read site". It is now that
  // implementation, so the claim is true rather than nearly true.
  //
  // The name is kept because it is exported and covered by
  // scripts/unit/contrast.test.mts; the behaviour is a strict improvement — the
  // shared version is string-aware, so a `/*` inside a CSS string is no longer
  // treated as a comment start, and an unterminated block comment now throws
  // instead of silently blanking to end-of-file.
  return blankCssComments(css);
}

/**
 * Every `--token: <value>` declared in a `:root { ... }` block, LAST WRITE
 * WINNING within that scope.
 *
 * SCOPED TO :root ONLY — deliberately, and this is a narrower rule than the
 * one this file shipped with. Before ADR-426/427 (frontend rebuild Task 7)
 * the app was single-mode, so scanning every `--x: value;` in the whole file
 * regardless of selector was harmless: there was only one palette to find,
 * spread across two `:root` blocks (the generated slots, then the hand-owned
 * extensions), and "last write wins" across the WHOLE FILE correctly picked
 * the override.
 *
 * Dual mode makes that unsafe. This file's own `.dark` blocks physically
 * follow their `:root` counterparts in source, so an unscoped whole-file scan
 * takes the LAST textual occurrence of a shared slot regardless of which
 * selector declared it — which means every core generated slot (background,
 * card, primary, ...) silently resolved to its DARK value, while the
 * app-owned extensions (declared identically in both modes under Ruling 11's
 * placeholder carry-forward) happened not to care. The result was not an
 * error, and not a null: it was a PLAUSIBLE, WRONG number. Caught in Task 7's
 * code review, restoring oklch support (see toRgb above) made
 * `success on background` read 9.71 — success on the DARK near-black
 * background — where the defect this script exists to record is `success` on
 * the LIGHT `--background`, 2.03:1.
 *
 * So this function now answers one specific question: does the LIGHT palette
 * — what a visitor with no stored preference and no `prefers-color-scheme:
 * dark` actually sees, and the palette ADR-427 reset to stock — clear WCAG.
 * A `.dark`-scoped equivalent is straightforward to add (mirror this
 * function against `.dark` blocks, with :root as the fallback for anything
 * `.dark` does not redeclare) but is out of scope for this fix; noted rather
 * than silently deferred.
 *
 * THE `selector` ARGUMENT DOES NOT REOPEN THAT. It exists for exactly one
 * caller, `identityCollisions()`, which asks whether a state token is
 * byte-identical to its mode's ink or paper — an EQUALITY test, which needs no
 * surfaces, no thresholds and no per-mode judgement, and is therefore safe to
 * run against `.dark` while a ratio sweep is not. Do not use it to build pairs
 * against the dark palette without doing the rest of the work the docstring
 * above describes.
 *
 * `--color-*` is SKIPPED. Those are Tailwind v4 `@theme` aliases — `--color-card:
 * var(--card)` — so keeping them doubles every pair under a second name and
 * reports 40 text pairs where there are 22.
 */
export function parseTokens(css, selector = ":root") {
  const out = new Map();
  const stripped = stripComments(css);
  const blocks = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{[^}]*\\}`,
    "g",
  );
  for (const block of stripped.match(blocks) ?? []) {
    for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      if (m[1].startsWith("color-")) continue;
      out.set(m[1], m[2].trim());
    }
  }
  return out;
}

/** Resolve `var(--x)` aliases to a literal. Bounded, so a cycle terminates. */
export function resolveVars(tokens) {
  const out = new Map(tokens);
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const [k, v] of out) {
      const m = /^var\(\s*--([a-z0-9-]+)\s*\)$/i.exec(v);
      if (m && out.has(m[1]) && out.get(m[1]) !== v) {
        out.set(k, out.get(m[1]));
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

/**
 * OKLCH -> linear sRGB -> gamma-encoded sRGB, via OKLab.
 *
 * FIX 1 (2026-08-21, code review of the frontend-rebuild token reset). ADR-427
 * reset every generated token to the stock preset's `oklch(...)` output, and
 * `toRgb()` used to return null for anything that was not hex — which the unit
 * suite asserted as CORRECT behaviour. That made oklch tokens silently
 * uncheckable: `analyse()` dropped from 79 pairs to 3 (only this file's
 * hand-authored hex placeholders survived), including the exact --success-on-
 * --background pair Ruling 13 exists to keep on record, and the script still
 * exited 0. A check that stopped matching anything reported clean forever —
 * this project's own named failure mode, produced inside the task that names
 * it.
 *
 * NOT approximated. A lookup table or a rough matrix would defeat the one
 * property that makes this script worth running: every ratio it prints is
 * exactly the number the browser would compute, not a plausible one. The
 * matrices below are Björn Ottosson's published OKLab<->linear-sRGB constants
 * (https://bottosson.github.io/posts/oklab/), the same ones the CSS Color
 * Module Level 4 spec's own sample code uses and the ones Chromium/WebKit
 * implement — not a derivation of this project's own.
 *
 * SELF-VALIDATED before landing, two ways:
 *   1. L=1,C=0 and L=0,C=0 collapse the rotation term to zero regardless of
 *      hue, so they MUST produce exactly white and exactly black — a
 *      mathematical certainty, not a memorised fixture. Both do, to the
 *      integer.
 *   2. The published INVERSE matrices (sRGB -> OKLab) were used, separately,
 *      to derive the OKLCH coordinates of #ff0000 and #0000ff, then fed back
 *      through THIS function. Both round-tripped to the exact original RGB
 *      integers. Forward and inverse matrices agreeing to the pixel is strong
 *      evidence neither transcription is wrong. See scripts/unit/contrast.test.mts.
 */
function oklchToRgb(L, C, hDegrees) {
  const hRad = (hDegrees * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  // The sRGB transfer function (gamma encode), applied per channel.
  const encode = (c) => {
    const abs = Math.abs(c);
    const v = abs > 0.0031308 ? Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055) : 12.92 * c;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  return [encode(rLin), encode(gLin), encode(bLin)];
}

/**
 * One `L`, `C`, or `H` component of an `oklch()` function. `pctScale` is the
 * value 100% maps to for that component — 1 for L (0%-100% -> 0-1), 0.4 for C
 * (CSS Color 4's own percentage reference range for chroma), and unused for H,
 * which is always an angle. A bare number is taken at face value either way.
 */
function parseOklchComponent(token, pctScale) {
  if (token.endsWith("%")) {
    const n = parseFloat(token);
    return Number.isNaN(n) ? null : (n / 100) * pctScale;
  }
  const n = parseFloat(token);
  return Number.isNaN(n) ? null : n;
}

/** `oklch(L C H)` or `oklch(L C H / A)` -> [r,g,b], or null if it cannot be
 *  parsed or is not fully opaque. An alpha channel is treated the same way
 *  `rgb(... / N%)` already is here: not a solid colour for contrast purposes. */
function parseOklch(value) {
  const m = /^oklch\(\s*([^)]+?)\s*\)$/i.exec(value);
  if (!m) return null;
  const [colorPart, alphaPart] = m[1].split("/").map((s) => s.trim());
  if (alphaPart !== undefined) {
    const alpha = parseOklchComponent(alphaPart, 1);
    if (alpha === null || alpha < 1) return null;
  }
  const parts = colorPart.split(/\s+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const L = parseOklchComponent(parts[0], 1);
  const C = parseOklchComponent(parts[1], 0.4);
  // H is an angle. `deg` is the only unit this token set uses; a bare number
  // is degrees per the CSS spec's own default for hue components.
  const hToken = /^(-?[\d.]+)(deg)?$/i.exec(parts[2]);
  if (L === null || C === null || !hToken) return null;
  return oklchToRgb(L, C, parseFloat(hToken[1]));
}

/** #RGB, #RRGGBB, or oklch() to [r,g,b]. Anything else — rgb(), alpha — is null. */
export function toRgb(value) {
  const v = String(value).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  if (/^oklch\(/i.test(v)) return parseOklch(v);
  return null;
}

/** WCAG 2.2 relative luminance (sRGB). */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio, always >= 1, order-independent. */
export function ratio(fgHex, bgHex) {
  const a = toRgb(fgHex);
  const b = toRgb(bgHex);
  if (!a || !b) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * The pairs the token set actually forms.
 *
 * Three sources, in the order a reader would look for them:
 *   1. `--x-foreground` on `--x` — the pairing the naming convention promises.
 *   2. `--foreground` / `--muted-foreground` on every surface — the pairing the
 *      app performs constantly and the convention does not name. NARROWED
 *      TWICE, and both times are worth a reader knowing about:
 *
 *      Fix round 1 of Task 0.1 (2026-08-23) tried "a surface owning its own
 *      `<surface>-role` sibling means the generic pairing is never rendered,
 *      so skip it" — and that was WRONG, corrected the same day in fix round
 *      2. This sweep is a deliberate OVER-APPROXIMATION: it asks "what would
 *      happen if free text landed on this surface", not "what does the tree
 *      render today" — `foreground on card` is exactly what would catch
 *      `--card` darkening in some future palette pass, even though `--card`
 *      already owns `--card-foreground`. Round 1's rule silenced SEVEN such
 *      guards to fix ONE false positive; six of the seven were passing and
 *      worth keeping measured, which an earlier version of this very comment
 *      had already worked out and round 1 overwrote without reading closely
 *      enough.
 *
 *      The property that actually distinguishes `nav` from the other six is
 *      INVERSION, not ownership. `--card`, `--popover`, `--muted`, `--accent`,
 *      `--secondary` and `--sidebar` all own a `-foreground` sibling whose
 *      RESOLVED VALUE agrees with generic `--foreground` well enough that both
 *      land on the same side of AA — checking the generic token there is
 *      redundant-but-harmless, and stays interesting only if the two ever
 *      diverge. `--nav` is different in kind: `--nav-foreground` sits on the
 *      OPPOSITE side of AA from generic `--foreground` against `--nav` (one
 *      passes, one fails) — the surface inverts the role, so the generic
 *      pairing is not a fallback that would work, it is a bug that would
 *      render black on black. That is the only condition under which checking
 *      it produces noise instead of signal, so it is the only condition that
 *      skips it: same-side pairs are BOTH kept, opposite-side pairs check the
 *      owned token in the generic one's place. Derived from resolved colour
 *      values via the same `ratio()`/`AA_TEXT` this file already checks pairs
 *      against — not a name list, so it is not hard-coded to `nav` and picks
 *      up a future `--scrim-muted-foreground` or `--primary-foreground` the
 *      same way, and not a bespoke threshold invented for this one rule.
 *   3. UI and ramp tokens on `--background` and `--card`.
 */
export function buildPairs(tokens, stateKinds = new Map()) {
  const hex = new Map([...tokens].filter(([, v]) => toRgb(v)));
  const pairs = [];
  // Deduped: `muted-foreground on muted` is reachable both from the naming
  // convention and from the free-text sweep, and printing it twice makes the
  // pair count a number nobody can reconcile against the token list.
  const seen = new Set();
  const add = (kind, fg, bg) => {
    if (!hex.has(fg) || !hex.has(bg) || fg === bg) return;
    if (seen.has(fg + "|" + bg)) return;
    seen.add(fg + "|" + bg);
    const r = ratio(hex.get(fg), hex.get(bg));
    if (r === null) return;
    const min = kind === "text" ? AA_TEXT : kind === "ui" ? AA_UI : null;
    pairs.push({
      kind,
      fg,
      bg,
      fgHex: hex.get(fg),
      bgHex: hex.get(bg),
      ratio: round(r),
      min,
      pass: min === null ? null : r >= min,
    });
  };

  for (const name of hex.keys()) {
    if (!name.endsWith("-foreground")) continue;
    add("text", name, name.slice(0, -"-foreground".length));
  }
  for (const fg of FREE_TEXT) {
    for (const bg of SURFACES) {
      // Ownership alone is NOT the skip condition (fix round 2 — see the
      // docstring above for why round 1's version of this comment was
      // wrong). A surface that owns `<surface>-role` only replaces the
      // generic check when the two disagree about which side of AA they
      // land on — i.e. the surface INVERTS the role rather than merely
      // restating it. Same side: keep both, the generic stays a live guard.
      // Opposite sides: the generic pairing is a bug nothing should render,
      // so check the owned pairing in its place.
      const owned = `${bg}-${fg}`;
      let useOwned = false;
      if (hex.has(owned) && hex.has(bg) && hex.has(fg)) {
        const ownedPasses = ratio(hex.get(owned), hex.get(bg)) >= AA_TEXT;
        const genericPasses = ratio(hex.get(fg), hex.get(bg)) >= AA_TEXT;
        useOwned = ownedPasses !== genericPasses;
      }
      if (useOwned) {
        add("text", owned, bg);
      } else {
        add("text", fg, bg);
      }
    }
  }
  // KIND COMES FROM THE CALLER, and an empty map means no state pairs at all.
  // `analyse()` always passes the derived map; the unit fixtures pass nothing,
  // which keeps them a test of the pairing loops rather than of `src/`.
  //
  // A STATE TOKEN NAMED `<surface>-<role>` IS SWEPT AGAINST THAT SURFACE, not
  // against the page grounds. `--nav-primary` is the case that forced this:
  // it is the ink-side half of a two-lightness accent, 5.59:1 on `--nav` and
  // 3.42:1 on `--background` — the second number is real, and measuring it is
  // measuring a pairing the app is defined never to render. Derived from
  // SURFACES rather than a name list, so `--sidebar-*` or a future
  // `--scrim-*` accent scopes itself the same way, and a state token that
  // owns no surface prefix still sweeps both page grounds as before.
  for (const [fg, kind] of stateKinds) {
    const owner = SURFACES.find((s) => fg.startsWith(`${s}-`) && hex.has(s));
    for (const bg of owner ? [owner] : ["background", "card"]) add(kind, fg, bg);
  }
  for (const fg of hex.keys()) {
    if (RAMP.test(fg)) for (const bg of ["background", "card"]) add("ramp", fg, bg);
  }
  return pairs;
}

export function analyse(cssPath = CSS_DEFAULT, srcDir = SRC_DEFAULT) {
  // THE EXIT CONTRACT, honoured here too (round 5). Folding stripComments into
  // the shared blanker made this a THIRD caller of a function that throws, and
  // this one had no try/catch — so an unterminated construct in tokens.css would
  // have exited 1 with a stack trace, reported as a CONTRAST failure. That is
  // F10's defect reintroduced by the fix for F12: "these colours fail WCAG" is a
  // false accusation when the truth is that the stylesheet could not be read.
  //
  // THE SAME CONTRACT NOW COVERS THE `src/` SWEEP (2026-08-24). `blankComments`
  // throws on a file the TypeScript parser cannot finish, and "these colours
  // fail WCAG" is just as false an accusation when the truth is that a .tsx
  // would not parse. Both reads are inside the one try, and both exit 2.
  let tokens;
  let usage;
  let collisions;
  let model;
  let darkTokens;
  try {
    const css = readFileSync(cssPath, "utf8");
    tokens = resolveVars(parseTokens(css));
    // BOTH MODES, from 2026-08-25 (task B1.4 fix round 1, finding I1). The
    // header of tokens.css has claimed "VALIDATED: 0 text-pair failures at
    // WCAG AA 4.5:1 IN BOTH MODES" since the palette landed, while pointing
    // the reader at this command — which read `:root` only and said so in its
    // own docstring. The claim happened to be true and nothing enforced it.
    // `.dark` overlays `:root` rather than replacing it, so a slot the dark
    // block does not redeclare keeps the light value, which is what the
    // cascade does; today `.dark` redeclares all 63, so the overlay is a
    // no-op guard rather than a behaviour.
    darkTokens = resolveVars(new Map([...parseTokens(css), ...parseTokens(css, ".dark")]));
    usage = deriveUtilityUsage(srcDir);
    collisions = identityCollisions(css, usage);
    model = deriveGroundModel(srcDir);
  } catch (e) {
    console.error(
      `a11y:contrast could not run: ${cssPath} or ${srcDir} could not be read or comment-blanked — ${e.message}`
    );
    process.exit(2);
  }
  // OUTSIDE THE TRY, deliberately. These throw about a stale constant or a
  // resolver that stopped matching, and the catch above says "the stylesheet
  // could not be read" — the exact class of false accusation the exit contract
  // exists to prevent. Let them be stack traces that name the real thing.
  assertGroundModelLive(model);
  const kinds = deriveStateKinds(usage);
  const pairs = [
    ...buildPairs(tokens, kinds).map((p) => ({ ...p, mode: ":root" })),
    ...buildPairs(darkTokens, kinds).map((p) => ({ ...p, mode: ".dark" })),
    ...buildCompositePairs(tokens, kinds, model, ":root"),
    ...buildCompositePairs(darkTokens, kinds, model, ".dark"),
  ];
  return {
    pairs,
    kinds,
    usage,
    model,
    unclassifiedWashes: checkUnclassifiedWashes(model.ambientTokens),
    collisions,
    uncovered: checkUncovered(tokens, usage),
    failures: pairs.filter((p) => p.kind === "text" && p.pass === false),
    warnings: pairs.filter((p) => p.kind === "ui" && p.pass === false),
  };
}

/**
 * FLOOR, not a target. The number below is the count MEASURED on 2026-08-21
 * after Task 7 Fix 1 restored oklch parsing and fixed the :root/.dark
 * blending bug in parseTokens — reported, not guessed, per that fix's own
 * instruction.
 *
 * THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT THE REGRESSION THIS FIX FIXES.
 * `toRgb()` returning null for `oklch(...)` did not error — it made every
 * pair touching an oklch token silently DISAPPEAR from `buildPairs()`, and
 * the script printed a shorter, still-all-green table and exited 0. 79 pairs
 * fell to 3 with nothing red anywhere, which is this project's own named
 * failure mode: "a check that has stopped matching anything reports clean
 * forever" (CLAUDE.md; `_selftest.mjs`'s own header). A pair count is a
 * number a human can compare across two runs; this makes the comparison the
 * script's own job instead of a reader's.
 *
 * BUMP IT UP when a real token is legitimately added to the light palette
 * (and say why, in the commit that changes it). NEVER bump it down to make a
 * regression pass — that is deleting the alarm, not fixing the fire.
 *
 * 79 -> 81 on 2026-08-22, and here is the why the docstring above asks for.
 * Two hex token PAIRS were added to tokens.css in the final fix wave, and each
 * forms exactly one new text pair through the naming-convention loop in
 * buildPairs():
 *   --nav-foreground   (Ruling 75)  `nav-foreground on nav`      14.64  passes
 *   --scrim-foreground (Ruling 76)  `scrim-foreground on scrim`  21.00  passes
 * Both are UP, both pass, and neither displaced an existing pair — the failure
 * count is unchanged at 7.
 *
 * 81 -> 74 on 2026-08-23 (fix round 1, Task 0.1) — SUPERSEDED THE SAME DAY,
 * kept here rather than deleted because the number it produced was wrong for
 * a stated reason worth not repeating. Round 1's FREE_TEXT loop substituted a
 * surface's own `<surface>-<role>` token for the generic one wherever the
 * surface owned ONE AT ALL, which silenced seven `foreground on <surface>`
 * guards to fix one real false positive — six of the seven were passing,
 * deliberately-kept over-approximation checks, not redundant noise. That
 * traded six live guards for one, which is a bad trade regardless of the pair
 * count it produces.
 *
 * 74 -> 80 on 2026-08-23 (fix round 2, Task 0.1), the correction. Ownership of
 * an `-role` sibling is not by itself the skip condition; INVERSION is — see
 * the FREE_TEXT loop's own comment and the docstring above `buildPairs()`.
 * Restored, all passing (same-side pairs the round-1 rule wrongly silenced):
 *   `foreground on accent`, `foreground on card`, `foreground on muted`,
 *   `foreground on popover`, `foreground on secondary`,
 *   `foreground on sidebar`
 * Still skipped (opposite-side pairs — the two departures round 1 got
 * right): `foreground on nav` (redirects to the already-counted
 * `nav-foreground on nav`, so no replacement — net -1) and
 * `muted-foreground on nav` (redirects to `nav-muted-foreground on nav`,
 * genuinely new — net 0). From the 81 measured on 2026-08-22: 81 - 1 (`foreground
 * on nav`, no replacement) - 1 (`muted-foreground on nav`, replaced) + 1
 * (`nav-muted-foreground on nav`, the replacement) = 80. Reported, not
 * guessed — measured with this exact script before setting the number, per
 * this docstring's own instruction.
 *
 * 80 -> 82 on 2026-08-24 (task B1.4), and the why. The fixed `UI_TOKENS` list
 * became the derived split described above, which changed two things at once:
 *   - `link` joined `STATE_TOKENS` (`text-link` sites, never measured
 *     against a surface until now) and forms two NEW pairs — `link on
 *     background` 7.24, `link on card` 7.95, both passing.
 *   - `destructive`, `success` and `warning` MOVED from the UI group to the
 *     TEXT group. Same six pairs, different threshold and different exit
 *     behaviour; the count is unchanged by the move.
 * 80 + 2 = 82. Measured with this exact script before the number was written,
 * per this docstring's own instruction. The TEXT group went 34 -> 42 and the
 * UI group 12 -> 4 for the same reason; ramp is untouched at 34.
 *
 * IT IS NO LONGER THE ONLY WAY THIS SCRIPT CAN GO QUIET, and that is worth
 * knowing: the pair set now depends on a scan of `src/`, so a token nothing
 * uses forms no pair at all. `checkUncovered()` catches the case where the
 * scan finds a colour nothing measures; this floor catches the case where the
 * scan finds nothing.
 *
 * 82 -> 353 on 2026-08-25 (task B1.4 fix round 1), and the arithmetic this
 * docstring demands. TWO changes, and both multiply rather than add:
 *   - the surface sweep now runs in BOTH modes (finding I1). `:root` still
 *     measures 82 — 42 text + 6 UI + 34 ramp, the same 82 as before, so the
 *     light half is provably unchanged — and `.dark` measures 83: one MORE
 *     text pair, because `foreground on nav` is skipped in light (the nav
 *     inverts the role there) and kept in dark, where `--nav` `#000000` and
 *     `--foreground` `#F5F4F3` land on the same side of AA. 82 + 83 = 165.
 *   - the composite sweep adds 94 per mode — 72 text + 22 UI — from 6 attested
 *     ground stacks plus the 2 bare base surfaces, each token under each of
 *     its own fill alphas for that mode (and, on a stacked ground, bare).
 *     165 + 94 + 94 = 353.
 * Measured with this exact script before the number was written, per this
 * docstring's own instruction. Ramp is untouched at 34 per mode.
 *
 * IT IS NOW A WEAKER FLOOR THAN IT WAS, and a reader should know why: the
 * composite half of the count depends on a scan of `src/` JSX, so deleting a
 * tinted panel legitimately lowers it. `assertGroundModelLive()` is the
 * assertion that actually catches the ground model going quiet; this floor
 * catches the token parser going quiet, which is what it was always for.
 */
// RE-BASELINED FROM 353 IN THE REBUILD PORT. 353 was the count over the old
// repo's component tree, where ~200 components between them wrote enough
// `text-*`/`bg-*` utilities that most state tokens were live. This repo is 25
// registry primitives and a starter page, so `deriveStateKinds()` finds only
// destructive, primary and ring, plus the nav family the auth screens
// restored — 143 pairs, and every one of them passes.
//
// 137 -> 143 came from the 2026-08-28 palette pass, and the six are all real
// coverage: `--nav-primary` arrived as a token and pairs against `--nav`, and
// `--primary` left the UI bucket for the text bucket, which is a stricter
// threshold on a pair that was already being drawn.
//
// THIS NUMBER IS A RATCHET, NOT A CEILING. It rises as screens land and put
// more tokens into use. Raise it in the same commit as the screen that raises
// the count; lowering it is what needs a reason.
export const MIN_PAIRS = 143;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const { pairs, failures, warnings, kinds, usage, collisions, uncovered, model, unclassifiedWashes } =
    analyse();
  const belowFloor = pairs.length < MIN_PAIRS;
  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify(
        {
          pairs,
          failures,
          warnings,
          collisions,
          uncovered,
          unclassifiedWashes,
          groundStacks: Object.fromEntries([...model.stacks].map(([k, v]) => [k, [...v].sort()])),
          kinds: Object.fromEntries(kinds),
          minPairs: MIN_PAIRS,
          belowFloor,
        },
        null,
        2,
      ),
    );
  } else {
    const label = { text: "TEXT  4.5:1", ui: "UI    3.0:1", ramp: "RAMP  report" };
    for (const mode of [":root", ".dark"]) {
      console.log(`\n══ ${mode === ":root" ? "LIGHT (:root)" : "DARK (.dark)"} ══`);
      for (const kind of ["text", "ui", "ramp"]) {
        const group = pairs.filter((p) => p.kind === kind && p.mode === mode);
        if (!group.length) continue;
        const comps = group.filter((p) => p.composite).length;
        console.log(`\n${label[kind]}  (${group.length} pairs, ${comps} on composited grounds)`);
        for (const p of group.sort((a, b) => a.ratio - b.ratio)) {
          const mark = p.pass === null ? "  ·" : p.pass ? "  ✓" : "  ✗";
          console.log(`${mark} ${String(p.ratio).padStart(6)}  ${p.fg} on ${p.bg}`);
        }
      }
    }
    // THE GROUND MODEL, PRINTED, for the same reason the buckets are: a ground
    // set read out of the source is invisible unless the run says what it
    // found, and "invisible" is how three people in one day each measured
    // every ground they thought of and each missed a deeper one.
    console.log(
      `\nGROUND STACKS  (ambient washes read from src/ JSX ancestry; depth ${MAX_GROUND_DEPTH})`,
    );
    for (const [key, renders] of [...model.stacks].sort()) {
      console.log(
        `    ${key.replace(/\/(both|dark)/g, "").padEnd(34)} renders ${[...renders]
          .filter((t) => kinds.has(t))
          .sort()
          .join(" ") || "(no state token)"}`,
      );
    }
    console.log("SELF TINTS  (a token's own fill alphas, per mode)");
    for (const [name] of [...kinds].sort()) {
      const st = model.selfTints.get(name);
      if (!st || (!st.light.size && !st.dark.size)) continue;
      const fmt = (s) => [...s].sort((a, b) => a - b).map((a) => `/${a}`).join(" ") || "—";
      console.log(`    ${name.padEnd(12)} light ${fmt(st.light).padEnd(16)} dark ${fmt(st.dark)}`);
    }
    // THE DERIVATION, PRINTED. A threshold that comes out of a source scan is
    // invisible unless the run says what it decided — and "invisible" is how
    // three tokens sat in the wrong bucket for a month.
    console.log("\nBUCKETS  (derived from `text-*` / `bg-*` in src/, comments blanked)");
    for (const [name, kind] of [...kinds].sort()) {
      const t = usage.get(`text|${name}`) ?? 0;
      const b = usage.get(`bg|${name}`) ?? 0;
      const note = "";
      console.log(
        `    ${name.padEnd(12)} ${kind.padEnd(5)} text-${name}:${String(t).padStart(3)}  bg-${name}:${String(b).padStart(3)}${note}`,
      );
    }
    console.log(
      `\n${pairs.length} pairs · ${failures.length} text failures · ${warnings.length} UI warnings`,
    );
    if (warnings.length) {
      console.log(
        "UI warnings do not fail the build: whether a token is load-bearing as a\n" +
          "control boundary (WCAG 1.4.11) is a judgement this script cannot make.",
      );
    }
    if (collisions.length) {
      console.log("\nIDENTITY COLLISIONS — a state colour is byte-identical to ink or paper:");
      for (const c of collisions) {
        console.log(`  ✗ ${c.mode} --${c.token}: ${c.value} — the same value as --${c.role} (${c.label})`);
      }
      console.log(
        "Every ratio for these will read PERFECT, because the defect is not low\n" +
          "contrast: it is that the thing they mean is indistinguishable from body\n" +
          "copy. Give the token a value of its own.",
      );
    }
    if (uncovered.length) {
      console.log("\nUNCHECKED COLOUR TOKENS — written as `text-*` but in no pair:");
      for (const u of uncovered) console.log(`  ✗ --${u.token} (${u.count} site(s))`);
      console.log(
        "STATE_TOKENS is the one hand-written judgement left in this file and it has\n" +
          "gone stale before (`link` was unchecked for its whole life). Add the token\n" +
          "there — its threshold is derived, so nothing else needs deciding.",
      );
    }
    if (unclassifiedWashes.length) {
      console.log("\nUNCLASSIFIED WASHES — `bg-<token>/<alpha>` painted under content:");
      for (const t of unclassifiedWashes) console.log(`  ✗ --${t}`);
      console.log(
        "GROUND_WASH_TOKENS is the one hand-written judgement in the composite sweep.\n" +
          "Decide whether content renders ON this wash (add it there) or the wash sits\n" +
          "under something opaque, like a scrim under a dialog (add it to\n" +
          "NOT_A_GROUND_WASH with the reason). Leaving it out measures nothing.",
      );
    }
    if (belowFloor) {
      console.log(
        `\nPAIR-COUNT FLOOR BREACHED: found ${pairs.length}, MIN_PAIRS says ${MIN_PAIRS}.\n` +
          "A parser that silently stops matching tokens reports a shorter, still-green\n" +
          "table — this is the assertion that catches it. If a token was legitimately\n" +
          "removed, lower MIN_PAIRS in the SAME commit and say why. If not, something\n" +
          "just went quiet.",
      );
    }
  }
  process.exit(
    failures.length ||
      belowFloor ||
      collisions.length ||
      uncovered.length ||
      unclassifiedWashes.length
      ? 1
      : 0,
  );
}
