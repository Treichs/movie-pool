---
name: The Movie Pool
description: A trade paper for a fake-money film league — ink masthead, paper body, numbers set as evidence.
colors:
  ink: "#000000"
  paper: "#F5F4F3"
  sheet: "#FFFFFF"
  marquee-vermilion: "#C52F1B"
  marquee-vermilion-ink: "#EB4B37"
  rule: "#DCDBD9"
  edge: "#84827E"
  quiet-ink: "#6B6A68"
  wash: "#EDECEA"
  cobalt: "#14567A"
  settled-green: "#266445"
  caution-ochre: "#76550A"
  deep-oxblood: "#7A1D10"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "4rem"
    fontWeight: 800
    lineHeight: 0.86
    fontVariation: "wdth 62, wght 800"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 800
    lineHeight: 0.9
    fontVariation: "wdth 64, wght 800"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 0.96
    fontVariation: "wdth 70, wght 800"
  subtitle:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
    fontVariation: "wdth 100, wght 700"
  dek:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 300
    lineHeight: 1.35
    fontVariation: "wdth 100, wght 300"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "wdth 100, wght 400"
  ui:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
    fontVariation: "wdth 100, wght 500"
  eyebrow:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.08em"
    fontVariation: "wdth 62, wght 800"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
    fontVariation: "wdth 100, wght 700"
  numeral:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.1
    fontFeature: "tabular-nums"
    fontVariation: "wdth 78, wght 800"
  numeral-hero:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 800
    lineHeight: 0.82
    fontFeature: "tabular-nums"
    fontVariation: "wdth 78, wght 800"
rounded:
  sm: "2.4px"
  md: "3.2px"
  base: "4px"
  xl: "5.6px"
  2xl: "7.2px"
  3xl: "8.8px"
  4xl: "10.4px"
  perf: "7px"
spacing:
  panel-sm: "16px"
  panel: "20px"
  card: "24px"
  gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.marquee-vermilion}"
    textColor: "{colors.paper}"
    rounded: "{rounded.4xl}"
    padding: "0 12px"
    height: "36px"
    typography: "{typography.ui}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.4xl}"
    padding: "0 12px"
    height: "36px"
    typography: "{typography.ui}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.4xl}"
    padding: "0 12px"
    height: "36px"
    typography: "{typography.ui}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.4xl}"
    padding: "0 12px"
    height: "36px"
    typography: "{typography.ui}"
  input:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.3xl}"
    padding: "4px 12px"
    height: "36px"
    typography: "{typography.ui}"
  card-flat:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.base}"
    padding: "{spacing.panel}"
  card-raised:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.4xl}"
    padding: "{spacing.card}"
  nav-band:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    height: "56px"
    padding: "0 32px"
    typography: "{typography.eyebrow}"
---

# Design System: The Movie Pool

## Overview

**Creative North Star: "The Trade Paper"**

This is *Variety* for a league of friends. The app reports on a game the way a trade
publication reports on an industry: an ink masthead at the top of every page, a paper
body underneath it, headlines set narrow and heavy and shouted in uppercase, and figures
— box office, Tomatometer, bid, score — set as **evidence** rather than as decoration.
A number in this app is the story. Everything else is the column it sits in.

The material is film itself, but stated as geometry rather than as illustration. A
perforation is a rounded rectangle at 26 × 34 with a 7px corner, and that one ratio is
the whole visual signature: it repeats down the edge of the ink bands, and it is restated
in viewBox units inside the league mark so a league reads as a film cell rather than as a
rounded square. There are no photographs of projectors, no reel icons, no grain overlays.
The brand is a ratio, not a texture.

Controls are **tactile and confident**. Buttons carry a wide pill radius and physically
push down one pixel when pressed; fields have a real boundary, not a hairline. The app
should feel like something you play, not something you file. That tactility is spent on
the controls and withheld from the page: panels stay flat, borders stay quiet, and the
red is rationed hard enough that when it appears you look at it.

**Key Characteristics:**
- Hierarchy is built from **width**, not size — one variable family across eleven roles.
- **Ink and paper are two different grounds**, each with its own legal red.
- Flat by default; elevation is reserved for things that behave like physical objects.
- Numbers get a dedicated type role with tabular figures, so columns line up on digits.
- One geometric signature (26 : 34 : 7) carries the entire brand.

## Colors

A newsprint palette: warm-neutral paper, true black ink, one signal red, and a small set
of stated-meaning colors. Nothing decorative, nothing gradient.

### Primary
- **Marquee Vermilion** (`#C52F1B` on paper / `#EB4B37` on ink): the signal color. It
  says *live and yours* — an open week, a film you own, the wordmark. It measures 5.04:1
  on paper and 5.59:1 on ink, and these are **two different values for two different
  grounds**, not a color and its shade.

### Neutral
- **Paper** (`#F5F4F3`): the page ground. Warm rather than white, so a sheet can sit on
  it and read as a separate object.
- **Sheet** (`#FFFFFF`): panels and cards — the column of type on the page.
- **Ink** (`#000000`): body text, and the permanent black of the masthead band.
- **Quiet Ink** (`#6B6A68`): secondary text, labels, timestamps. Deliberately a different
  neutral per theme — its dark-mode counterpart is `#8E8D8B`, and the two must never be
  unified.
- **Rule** (`#DCDBD9`): panel edges and dividers. Decoration; it is allowed to be faint.
- **Edge** (`#84827E`): control boundaries only. It exists because a field boundary is a
  legal requirement (WCAG 1.4.11, 3:1) and a panel edge is not.
- **Wash** (`#EDECEA`): field fills, muted chips, secondary button ground.

### Tertiary
- **Cobalt** (`#14567A`): links, and only links. Lifted to `#249BDB` in dark.
- **Settled Green** (`#266445`), **Caution Ochre** (`#76550A`), **Deep Oxblood**
  (`#7A1D10`): state, not brand — a week settled, a deadline near, a destructive act.

### Named Rules

**The Two Grounds Rule.** No red is legible on both grounds. `--primary` is the
paper-side red and appears **nowhere** on an ink surface; `--nav-primary` is the ink-side
red and appears **nowhere** on paper. Reaching for one on the wrong ground is a contrast
failure, not a taste call.

**The One Meaning Rule.** Vermilion means *live and yours*. It is not the color of a Save
button — the ink button variant exists precisely so a screen can have a heaviest control
without spending the accent on it. A screen that paints its primary action red has
nothing left to mark the open week with.

**The Ten Percent Rule.** The accent covers no more than roughly a tenth of any screen.
Its rarity is the mechanism.

**The Sealed Palette Rule.** Tailwind's stock palette is deleted at the root
(`--color-*: initial`), so `bg-blue-500` emits no CSS at all. A raw palette class is
impossible here, not merely discouraged. Every color must be a token.

## Typography

**Display Font:** Archivo (with system-ui, sans-serif)
**Body Font:** Archivo — the same family, at normal width
**Label/Numeric Font:** Archivo, bound separately so the numeric role can be retuned alone

**Character:** a grotesque that can be squeezed. Archivo is variable on both `wdth`
(62–125) and `wght` (100–900), and the system makes **width** the primary hierarchy
signal rather than size — a headline is narrow and heavy at 62–70 width, body text is
normal at 100. That is what gives the app its newsprint compression: headlines that stack
tight, leading below 1.0, and uppercase across the top of the scale.

### Hierarchy
- **Display** (`wdth` 62 / `wght` 800, 4rem, line-height 0.86, uppercase): the landing
  hero and nothing else. A single size step up (`text-display-lg`, 6rem) exists for that
  hero on large screens only, so the promise still fits a phone.
- **Headline / h1** (`wdth` 64 / 800, 2.75rem, 0.9, uppercase): the page's subject.
- **Title / h2** (`wdth` 70 / 800, 1.875rem, 0.96, uppercase): a section within a page.
- **Subtitle / h3** (`wdth` 100 / 700, 1.125rem, 1.25): a panel's own heading. The width
  returns to normal here — this is the boundary between *headline* and *interface*.
- **Dek** (`wdth` 100 / 300, 1.5rem, 1.35): the standfirst under a display headline. The
  one light weight in the system.
- **Body** (`wdth` 100 / 400): prose, bounded by a measure container (45/65/80ch), never
  by guesswork.
- **UI** (`wdth` 100 / 500, 0.875rem): every control label, table cell and nav item.
- **Eyebrow** (`wdth` 62 / 800, 0.75rem, +0.08em, uppercase): the kicker above a headline,
  and the wordmark.
- **Button / Micro** (`wdth` 100 / 700 and 600, 0.6875rem, +0.06em, uppercase): the
  smallest type in the app, always uppercase and letterspaced so it survives.
- **Numeral** (`wdth` 78 / 800, tabular figures): every figure the game produces.
  `numeral-xl` (4.5rem) is reserved for the one number a screen is *about* — a bid
  deadline's countdown, a film's score.

### Named Rules

**The Width Rule.** Hierarchy is width first, size second. Two headings at the same size
and different widths are a legitimate distinction here; two at the same width and
different sizes usually are not.

**The Tabular Rule.** Any figure that could appear in a column uses the numeral role. A
standings table whose digits do not line up is a defect.

**The Axis Rule.** Naming `wdth` in the font binding is load-bearing. Omit it and the
loader ships weight-only Archivo, every width distinction collapses silently, and nothing
errors.

## Layout

**Measures are tokens, and there are four.** Three bound a line of text — tight (45ch),
default (65ch), wide (80ch) — and the fourth, page (72rem), bounds the page frame. Prose
is bounded in `ch` because that is what a line of text is measured in; a page is bounded
in `rem` because it is not text. A page and its loading skeleton must cite the same one.

**The signed-in frame is two bands.** An ink band 56px tall carries the wordmark, search,
notifications and the account menu; a paper nav band 52px tall carries navigation and the
league switcher below it. The split is deliberate — navigation reads as part of the page
rather than as a second black slab, and signing in does not change what the top of the
app looks like.

**Responsive is a change of structure, not a reflow.** Below `md` the desktop nav band is
removed entirely and replaced by a bottom nav plus a drawer, and by a 48px strip naming
the focused league. Exactly one element carries `aria-label="Primary"` at any viewport,
because `display: none` removes the other from the accessibility tree. Below `xl` the
perforated edge columns are hidden — at that width a band's content would reach them and
paint over the edge rather than beside it.

Panel padding is a variable, not a literal: `--card-spacing` is 20px on a page-width panel
and 16px on a rail panel, set once on the card and consumed by its header, content and
footer so the three can never drift apart.

## Elevation & Depth

**Flat by default; lift only for artifacts.** The ordinary panel is a bordered sheet with
the base 4px radius and no shadow at all — depth comes from the border and the
paper-to-sheet tonal step. Shadow and the large 10.4px radius are reserved for something
that behaves like a physical object on the page: a poster, a film cell, an overlay.

### Shadow Vocabulary
- **Raised object** (`shadow-md` plus `ring-1 ring-foreground/5`): the default `Card` —
  the container a poster sits in. The ring is what keeps the edge legible on paper, where
  a shadow alone is nearly invisible.
- **Overlay** (`shadow-lg` / `shadow-xl`): dialogs, popovers, dropdowns, sheets. These
  float above the page and must say so.

### Named Rules

**The Flat Panel Rule.** If it holds data, it is flat. If it holds an artifact, it may
lift. A dashboard of shadowed tiles is the failure mode this rule exists to prevent.

## Shapes

**Every corner in the app derives from one value.** The base radius is 4px, and the whole
scale is arithmetic on it (`sm` ×0.6 through `4xl` ×2.6). No component hardcodes a radius.
Retuning the app's corner language is a one-line edit.

The scale is used with intent rather than by size: panels take the base radius (4px) and
read as *paper*; controls take 8.8–10.4px and read as *objects you press*. That gap
between panel and control is the form language.

**One corner is exempt, and must stay exempt.** The perforation radius is a flat 7px,
because a film perforation is a specific rounded rectangle — 26 × 34 at rx 7, the brand
mark's own geometry. A perforation that squared itself when the corner language was
retuned would be a bug, not a restyle.

### Named Rules

**The One Perforation Rule.** The 26 : 34 : 7 ratio lives in exactly two files — the
`Perforation` component for full-height columns, and `LeagueMark`, which restates it in
viewBox units because a fixed-size div cannot scale into a 26px mark. Never invent a
second perforation rhythm.

**The Circle-and-Cell Rule.** A person is a circle. A league is a film cell. The shape is
the entity type, and it is the brand's geometry doing the work a generic rounded square
would otherwise do.

## Components

### Buttons
Confident and physical: the one control in the system allowed to respond to touch.

- **Shape:** full pill against a 36px control height (10.4px radius).
- **Primary:** vermilion ground, paper text; hover drops to 80% opacity.
- **Ink:** black ground, paper text — *weight without color*. The heaviest control on a
  surface where the accent is already committed elsewhere, and the correct default for a
  Save or Submit action.
- **Outline / Secondary / Ghost:** ascending quietness on the same box. Outline takes the
  panel border, secondary takes the wash, ghost takes nothing until hover.
- **Destructive:** oxblood text on a 10% oxblood tint, never a solid red slab.
- **Link variant:** cobalt with a 4px-offset underline — for a link standing where a
  button would. Inline links in prose use `TextLink` instead, which carries the same color
  without the button box.
- **Press:** one pixel down on `:active`, on every variant, except where the control opens
  a menu.
- **Focus:** border shifts to the ring color plus a 3px ring at 30% — never an outline
  swap.

### Cards / Containers
- **Flat (the default panel):** sheet ground, 1px rule border, 4px radius, padding from
  `--card-spacing`. Carries surface only — no gap, no type size, no direction.
- **Raised (the artifact):** 10.4px radius, `shadow-md`, a 5% ink ring, no border, and
  first/last child images clipped to the corner radius.

### Inputs / Fields
- **Style:** 8.8px radius, an `--edge` boundary (not `--border` — a field must reach 3:1),
  wash fill at 50% opacity so it works on both paper and sheet.
- **Focus:** ring-color border plus a 3px ring at 30%, transitioned on color, shadow and
  background only.
- **Invalid:** destructive border and a 20% destructive ring, driven by `aria-invalid`.
- **Autofill:** the browser's paint is removed by clipping the background to the glyphs
  rather than by an opaque inset shadow — the field has no opaque color to give, and this
  keeps `box-shadow` free for the focus ring.

### Navigation
- **Ink band:** wordmark in eyebrow type, vermilion on ink, at the left; search,
  notifications and account at the right. Sticky, 56px.
- **Paper band:** UI-type nav items with dropdown groups, league switcher at the right
  end. Desktop only.
- **Mobile:** bottom nav plus a drawer. The desktop band is removed, not collapsed.

### Signature: the perforated edge
A column of perforations absolutely positioned 28px inside each edge of a full-width ink
band, spaced by distribution rather than counted — the caller passes a count matched to
the band's height so the rhythm stays even. Decorative, hidden from assistive technology
at the column rather than the shape, and hidden below `xl`.

### Motion
Reduced motion is honored by **collapsing durations to 1ms, never by removing animation**
— an animation that never runs leaves the primitive waiting for an `animationend` that
never fires, and a closed menu stays in the DOM. Two exceptions: the spinner keeps turning
at 1.6s (it is the only channel a pending action has), and the skeleton pulse stops
outright (it is the one animation carrying no information).

## Do's and Don'ts

### Do:
- **Do** cite a token. The stock palette is deleted, so there is no fallback to reach for.
- **Do** pick the red by ground: the paper red on paper, the ink red on ink, never the
  reverse.
- **Do** use the ink button for the heaviest action on a screen, and keep vermilion for
  *live and yours*.
- **Do** set every game figure in the numeral role so columns align on their digits.
- **Do** use `--edge` for anything a user types in or clicks, and `--border` only for
  panels and dividers.
- **Do** build hierarchy by narrowing the width axis before reaching for a larger size.
- **Do** keep panels flat and let only artifacts lift.

### Don't:
- **Don't** ship anything that reads as a generic SaaS dashboard — indigo on white, Inter,
  large radii everywhere, three KPI tiles above a line chart. That is the default this
  system was built to escape.
- **Don't** borrow sportsbook language: neon on black, odds flashes, urgency banners,
  green money glow. This is fake money and a season-long game, not a wager.
- **Don't** hardcode a radius. Every corner derives from the base value, except the
  perforation's 7px, which derives from the mark.
- **Don't** invent a second perforation rhythm, or draw a league as a plain rounded square.
- **Don't** unify the muted foreground across themes, or treat the nav tokens as a
  dark-mode variant. The ink surface is ink in both modes on purpose.
- **Don't** add a second `<main>` inside the shell — every page owns its own landmark, and
  two fails the accessibility pass on every screen at once.
- **Don't** disable animation under reduced motion; collapse its duration instead.
