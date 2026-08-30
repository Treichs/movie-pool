/**
 * THE BODY, WITH ITS LINE BREAKS INTACT.
 *
 * ── THIS IS A SHIPPED BUG CLASS IN THIS REPO, NOT A HYPOTHETICAL ────────
 * The body is plain text typed into a textarea. Rendered as `{body}` in a
 * single `<p>`, HTML collapses every newline to one space and the whole post
 * becomes one paragraph — which is exactly what happened before, and is why
 * the task carries a step of its own for it.
 *
 * ── BLANK LINES MAKE PARAGRAPHS; SINGLE NEWLINES STAY BREAKS ────────────
 * Both are fixed, because they mean different things to whoever typed them.
 * Splitting on a blank line gives real `<p>` elements — which is what the gap
 * between them and a screen reader's paragraph navigation both need — and
 * `whitespace-pre-line` keeps a single newline inside one as a break rather
 * than swallowing it. `pre-line` alone would have produced one enormous
 * paragraph that merely LOOKED right.
 *
 * ── `measure`, NOT THE PAGE FRAME ──────────────────────────────────────
 * 65ch is where prose stops being comfortable, and this is the only screen in
 * the app that is genuinely read rather than scanned.
 *
 * ── 16px IS `text-base`, BECAUSE THE SCALE HAS NO 16px TOKEN ────────────
 * The named sizes jump 14px (`ui`) to 18px (`h3`) to 24px (`dek`), and board
 * 4.7 sets this body at 16/1.6 — deliberately larger than the app's 14px UI
 * prose, because this is the one surface someone sits and reads. Tailwind's
 * stock sizes survive the theme (only `--color-*` is zeroed), and `input.tsx`
 * and `textarea.tsx` already reach for `text-base` for the same reason.
 */
export function AnnouncementBody({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="flex max-w-measure-default flex-col gap-4">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="type-body text-base leading-relaxed whitespace-pre-line"
        >
          {p}
        </p>
      ))}
    </div>
  );
}
