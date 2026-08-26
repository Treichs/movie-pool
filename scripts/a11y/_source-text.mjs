/*
 * blankComments — the ONE comment blanker. Ruling 64; rewritten under Ruling 66.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * Governance checks read source text and look for a literal in it. Every such
 * check has the same failure: a sentence ABOUT the thing reads exactly like the
 * thing, so a rule whose real declaration was deleted stays satisfied by the
 * comment describing it. It reports clean, and reports clean forever. Blanking
 * comments before scanning is what stops that.
 *
 * ── RULING 66: THE JS/JSX PATH IS THE TYPESCRIPT PARSER, NOT A HAND LEXER ──
 * This file used to answer "does this `/` open a regex literal?" with a set of
 * characters it was allowed to follow. That question is JavaScript's grammar,
 * and a character set is a JavaScript lexer written by hand. The project paid
 * for that four times, each round closing the named holes and opening narrower
 * ones:
 *
 *   round 1  fail-open on a regex holding an unbalanced quote (`/won't/`)
 *   round 2  scoped the heuristic; fail-open in a KEYWORD position (`return /a'/`)
 *   round 3  added keywords and a tripwire; fail-open on a line-start `/>` —
 *            the repo's own JSX formatting, 140 .tsx files — and on a numeric
 *            literal after a keyword (`return 1 / 2;`), which never flushed the
 *            latched keyword. Both silent: no throw, no length change.
 *
 * Every one of those was a position nobody enumerated. So the enumeration is
 * gone. `ts.createSourceFile` PARSES the file with the real grammar and settles
 * regex literals, template literals, JSX text, type assertions and every other
 * position question by construction; comments are then read off as trivia with
 * `ts.getLeadingCommentRanges`. typescript is already a devDependency — `npm run
 * typecheck` is tsc — so this costs nothing new.
 *
 * The CSS path is deliberately NOT changed. CSS has no regex literals and only
 * `/* … *\/` comments, the hand walk for it has been correct throughout, and
 * TypeScript has no opinion about CSS. Ruling 66 says to keep it, and the reason
 * it was ever safe is that CSS never had the ambiguity that broke the JS path.
 *
 * ── WHAT IT GUARANTEES ────────────────────────────────────────────────────
 *   GUARANTEED: if this function RETURNS, no comment survives unblanked in the
 *   returned text, and that text is the same length as the input.
 *   NOT GUARANTEED: that it returns. On input the parser reports as an
 *   unterminated string, template, regex or block comment, it THROWS.
 *
 * Length and offsets are preserved because blanking replaces each comment range
 * with spaces in place, keeping newlines. Callers rely on this: registry.test.ts
 * anchors a `slice` on an index computed from the RAW text.
 *
 * ── THE ONE RESIDUAL, STATED ──────────────────────────────────────────────
 * Only the four unterminated-construct diagnostics throw. Other syntax errors do
 * not, because the parser is error-tolerant and still produces correct trivia
 * for them — and because refusing every imperfect snippet would make this
 * unusable for the fixtures that test it. A file that does not parse at all is
 * not a file this repo ships: `npm run typecheck` is a separate gate.
 *
 * Callers must route a throw to a "could not run" exit, never to a violation: a
 * blanker that cannot read the file has produced no evidence either way. There
 * are THREE callers and all three do, each exiting 2:
 *   scripts/governance/check-config-and-theme.mjs
 *   scripts/governance/check-ui-rules.mjs
 *   scripts/a11y/contrast.mjs
 * The third arrived when its private copy was folded in, and it shipped one
 * round WITHOUT the contract — the header said "both callers" while there were
 * three, which is how a claim about a module's callers goes stale the moment it
 * gains one. If a fourth arrives, it belongs in this list and in that sentence.
 *
 * Newline-preserving. One dependency, already present.
 */
import ts from "typescript";

/** Parse diagnostics that mean "this input is not something I can read". */
const UNTERMINATED = new Map([
  [1002, "unterminated string literal"],
  [1010, "unterminated block comment"], // reported as "'*/' expected"
  [1160, "unterminated template literal"],
  [1161, "unterminated regex literal"],
]);

/*
 * Token kinds whose leading "trivia" is really CONTENT, so a trivia scanner must
 * not be pointed at them. JSX text and the text spans of a template literal both
 * contain `//` and `/*` as ordinary characters.
 */
const TRIVIA_IS_CONTENT = new Set([
  ts.SyntaxKind.JsxText,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

const blankRange = (chars, pos, end) => {
  for (let i = pos; i < end && i < chars.length; i++) {
    if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
  }
};

function blankJs(src, jsx) {
  const sourceFile = ts.createSourceFile(
    jsx ? "__blank.tsx" : "__blank.ts",
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  // `parseDiagnostics` is where the scanner records an input it could not
  // finish. Checked before the trivia walk, because a half-read file produces
  // half-right trivia and returning it is the fail-open this file exists to end.
  for (const d of sourceFile.parseDiagnostics ?? []) {
    const what = UNTERMINATED.get(d.code);
    if (!what) continue;
    const { line } = sourceFile.getLineAndCharacterOfPosition(d.start ?? 0);
    throw new Error(
      `blankComments: ${what} at line ${line + 1} — the TypeScript parser could not finish reading ` +
        "this file, so the comment ranges it reports are not trustworthy. Nothing was blanked. " +
        "Fix the source, or narrow what is handed to the blanker."
    );
  }

  // src.split("") — UTF-16 CODE UNITS, not code points. `[...src]` splits by
  // code point, so one astral character (an emoji) makes every later index off
  // by one against the UTF-16 offsets TypeScript reports. That was live:
  // src/app/(member)/league/components/career-table.tsx carries a trophy emoji
  // at offset 9688 and every `//` after it was blanked one character late, and
  // a comment CONTAINING an emoji shrank the output enough to trip the length
  // assertion and take governance:config-theme to exit 2.
  const chars = src.split("");

  // BOTH LEADING AND TRAILING RANGES, and the pairing is the whole correctness
  // argument (round 5). `getLeadingCommentRanges` only begins collecting after a
  // LINE TERMINATOR (unless pos === 0), so on its own it never returns a comment
  // that shares a line with preceding code — which is most of them:
  //     const a = 1; // here
  //     <div>{/* here */}</div>          the dominant .tsx comment form
  //     <div a={1} /* here */ b={2} />
  // Measured over 389 files, leading-only leaked 78,129 characters across 141
  // files — NINE TIMES the hand-written walk it replaced — and it was live on a
  // real governance input: layout.tsx's `{/* THE APP'S TOAST OUTLET … */}` went
  // unblanked, which made G3-3B comment-satisfiable again. With both calls the
  // same audit reports 0 leaked and 0 false-blanked.
  //
  // Together the two cover every position: leading picks up comments that start
  // a line, trailing picks up comments that follow code on one. They may overlap
  // on the same range; blanking is idempotent, so that costs nothing.
  const visit = (node) => {
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      // TOKENS WHOSE "TRIVIA" IS ACTUALLY CONTENT are skipped by KIND. The
      // previous version claimed a `getStart() > getFullStart()` guard did this,
      // and that claim was FALSE — `getStart()` skips leading whitespace, so a
      // JsxText opening an indented line reports full=5 start=10 (measured on
      // a div whose first child is a JSX comment) and the guard never engaged.
      // Checking the kind is the mechanism that actually holds:
      // inside JSX text and between template-literal spans, `//` and `/*` are
      // ordinary characters, and handing them to a raw trivia scanner would
      // blank real content — a false blank, the worse failure.
      if (!TRIVIA_IS_CONTENT.has(node.kind)) {
        const at = node.getFullStart();
        for (const r of ts.getLeadingCommentRanges(src, at) ?? []) blankRange(chars, r.pos, r.end);
        for (const r of ts.getTrailingCommentRanges(src, at) ?? []) blankRange(chars, r.pos, r.end);
      }
      return;
    }
    for (const child of children) visit(child);
  };
  visit(sourceFile);

  return chars.join("");
}

/*
 * CSS: block comments and strings only. Unchanged by Ruling 66 and correct
 * throughout — `//` is the middle of `url(https://…)`, not a comment, and `/` is
 * ordinary syntax in `font: 12px/1.5` and `grid-area: 1 / 2`. String-aware so a
 * glob inside `@source not "…/ ** / *"` is preserved rather than false-blanked,
 * which is what the copy this replaced was getting wrong at seven sites.
 */
function blankCss(src) {
  const chars = [...src];
  let quote = null;
  let blockStart = -1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (blockStart !== -1) {
      if (c === "*" && next === "/") { blankRange(chars, blockStart, i + 2); blockStart = -1; i++; }
      continue;
    }
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "/" && next === "*") { blockStart = i; i++; }
  }
  if (quote) {
    throw new Error(
      "blankComments: unterminated string literal in CSS — the walk ended inside a string, so " +
        "comments after that point were not blanked. Nothing was returned."
    );
  }
  if (blockStart !== -1) {
    throw new Error("blankComments: unterminated block comment in CSS — the file is truncated, or a `/*` was mis-read.");
  }
  return chars.join("");
}

export function blankComments(src, { syntax = "js" } = {}) {
  const out = syntax === "css" ? blankCss(src) : blankJs(src, syntax === "jsx");
  if (out.length !== src.length) {
    // Not a defence and never fires — it sits after every throwing path, and
    // blanking replaces characters in place so length cannot change. Kept as one
    // cheap line that would catch a future editing mistake in the blanking
    // itself, since callers slice on offsets computed from the raw text.
    throw new Error(
      `blankComments: length changed (${src.length} -> ${out.length}). Offsets are load-bearing for ` +
        "callers that slice on an index computed from the raw text."
    );
  }
  return out;
}

/** CSS convenience — see blankCss for why it is not the JS path. */
export const blankCssComments = (src) => blankComments(src, { syntax: "css" });
