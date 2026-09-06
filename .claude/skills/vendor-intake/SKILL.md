---
name: vendor-intake
description: How a registry component or block enters this repo — which registry, how to preview it, how to prove it before adapting it, and where a change to it belongs. Use before any `shadcn add`, when choosing between registries, when a dry run reports an overwrite, or when an installed file needs to behave differently. Triggers on "add a component", "install a block", "shadcn add", "registry", "@reui", "@shadcnblocks", "overwrite", "vendor", "intake".
---

# Taking a component in

CLAUDE.md owns the search-first rule and what `~ overwrite` means in a dry run.
This skill owns everything after you have found a candidate: proving it, placing
a change to it, and recording what you changed.

## Preview is three commands, not one

```bash
npx shadcn add <item> --dry-run          # the plan, and the overwrite count
npx shadcn add <item> --diff <path>      # what an overwrite would change
npx shadcn add <item> --view <path>      # a new file's contents, writes nothing
```

`--dry-run` says a file **differs**. Only `--diff` says whether the difference is
yours. Every `~ overwrite` is a stop, and in this repo most of them are real:
registry files are edited in place, so a flagged path is usually a change
somebody made on purpose.

## The style segment is load-bearing for `@reui`

`https://reui.io/r/{style}/{name}.json` — `{style}` resolves to `base-luma` from
`components.json`. Dropping it does not fall back gracefully: the bare form
307-redirects to `/r/styles/base-nova/`, so the repo silently installs Nova
builds while calling itself Luma. `stepper` is `rounded-full` in Luma and
`rounded-sm` in Nova.

**Probe a style-templated registry with a styled item.** `frame` returns a
byte-identical payload under every style, so testing with it proves nothing.

## Prove it before you adapt it

Three checks, in this order, before editing a single line of what landed:

1. **Compile.** `npm run typecheck`. A manifest naming a dependency version is
   not the same claim as the vendored code targeting that version.
2. **Engine.** This repo is `@base-ui/react`. An item importing `@radix-ui/*` or
   branching on `asChild` is a rewrite, not an install — and only the fetched
   source says so. A registry's docs page will tell you it works with your setup.
   This check has already decided a component here: every `@shadcnblocks` stepper
   pulls in `radix-ui` and wants to overwrite `ui/button.tsx`, which is how the
   create-league wizard ended up on `@reui/stepper` — one file, Base UI, no
   overwrites.
3. **Anatomy.** Read the vendor's own example source before composing it. Renders
   plausibly is not composed correctly: a mis-nested subcomponent usually
   inherits its padding through CSS and looks right.

**Zero new npm dependencies is the default.** If an item needs one, that is a
decision with a reason, not a line that rides along with the component.

## Where a change to an installed file goes

Registry code is edited in place here — one `button`, one `card`. That rule says
*which file*; this says *whether the file is the right place at all*.

| The change is | It goes | Never |
|---|---|---|
| A colour, radius, shadow, spacing — **a value** | `src/app/globals.css` | Hardcoded in the component |
| A variant, a prop, a different default — **a capability** | A variant on the one existing file | A second file next to it |
| A different component — **an implementation** | A new install | Reshaping an unrelated primitive into it |

The failure this prevents: reaching for a class name in a registry file when the
thing that actually needs to move is a token. A class name there is a step on a
scale, not a value.

## Record the divergence in the file that diverged

Editing in place means the file is the only place the change can be recorded — a
git blame five months from now is not the same thing as a reader knowing why.
Write the note at the point of change, and name three things: what was replaced,
why, and whether behaviour moved.

[src/components/reui/stepper.tsx](../../../src/components/reui/stepper.tsx) is
the model — a `useRef` swapped for a callback ref because `react-hooks/refs`
rejects a ref read during render, behaviour unchanged. Without that note, the
next `add -o` reverts it and the lint error comes back looking new.

It is 1 of 37 files today. Every file you adapt should make that number better.

## The registries

`components.json` is the ledger — a registry is usable because it is declared
there. What each one is actually for:

| Namespace | Auth | Good for | What it has actually given us |
|---|---|---|---|
| `@shadcn` | none | Primitives. The default answer | `ui/` — nearly everything |
| `@reui` | none | The primitive shadcn has no equivalent for | `reui/frame`, `reui/stepper` |
| `@shadcnblocks` | Bearer key, from the environment | Layout ideas for a whole screen | Read as reference; nothing installed |
| `@animate-ui` | none | — | **Nothing. Unproven** |
| `@8bitcn` | none | — | **Nothing. Unproven** |

`@shadcnblocks` earns its key as a **reference** — its blocks have shaped the
account page and the league switcher without a file being installed from it, and
its steppers were rejected outright on the engine check. Price a block from it as
a layout to read, not a drop-in.

**Unproven means declared but never vetted.** Search `@animate-ui` and `@8bitcn`
freely; treat the first install from either as an intake, not a drop-in.

Two more rules that only bite across registries:

- **`ui/<name>.tsx` is always `@shadcn`'s.** Four registries can all ship a
  `popover`, and they disagree about `"use client"` in inconsistent directions.
  Whichever ran last would win, which makes the file's identity depend on install
  order. Decline a colliding name at the overwrite prompt.
- **`@reui/c-<name>` is a composed example, not a primitive.** Read the prefix,
  not the name, so the test holds for items nobody has installed. A `c-` item is
  a demo assembling several components — it belongs in the route's
  `_components/`, not in `reui/` alongside the primitives.

A registry passing intake settles whether it *works*, not whether its license is
worth paying for. That is a separate call, made per registry.

## Landed

`npm run verify` green, then driven in a real browser through the `ui-review`
skill on the first screen that uses it.

Known gap, accepted: a primitive that no screen uses yet is never exercised.
There is no story catalogue and no render net here — `ui-review` is per-screen,
so an item's proof arrives when a screen needs it.
