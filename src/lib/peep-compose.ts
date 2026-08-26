import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PeepParts } from "@/lib/peep-atoms";

// SERVER-SIDE PEEP COMPOSITION — the one implementation behind both the
// /api/peep-head route (avatar circles, builder preview) and the profile
// page's inlined full figure. Node:fs lives here and in peep-svg.ts only,
// per the 2026-08-07 client/server split.
//
// THE ANCHORS, all probe-calibrated (2026-08-08). Every atom category is
// exported on a uniform canvas, so one offset per category places every
// member of it:
//   face on head    (100, 190) of 473x567 — probe phase 1/2
//   facial hair     (104, 320)            — probe phase 2
//   accessory       (30, 232)             — probe phase 3, eye line; one
//                   anchor serves glasses and sunglasses both
//   head on body    (170, 0), body at y 317 of an 818x1050 bust frame —
//                   probe phase 3 (after fixing the probe's own double-strip
//                   bug, which had been distorting the grid it measured)

const HEAD_W = 473;
const HEAD_H = 567;
const FACE = { x: 100, y: 190, w: 289, h: 293 };
const FACIAL_HAIR = { x: 104, y: 320, w: 280, h: 230 };
const ACCESSORY = { x: 30, y: 232, w: 392, h: 138 };
const BUST_W = 818;
const BUST_H = 1050;
const BODY = { x: 0, y: BUST_H - 733, w: 818, h: 733 };
const HEAD_ON_BODY = { x: 170, y: 0 };

const cache = new Map<string, string>();

async function atom(category: string, slug: string): Promise<string> {
  const key = `${category}/${slug}`;
  let raw = cache.get(key);
  if (raw === undefined) {
    raw = await readFile(
      path.join(process.cwd(), "public", "peeps", "atoms", category, `${slug}.svg`),
      "utf8",
    );
    cache.set(key, raw);
  }
  return raw;
}

const strip = (svg: string) =>
  svg.replace(/<\?xml[^?]*\?>/, "").replace(/\s(width|height)="[^"]*"/g, "");

const nest = (svg: string, box: { x: number; y: number; w: number; h: number }) =>
  strip(svg).replace(
    /<svg /,
    `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" `,
  );

/** Head + face (+ facial hair + accessory) inside the head canvas — the
 *  markup shared by both compositions, WITHOUT an outer wrapper. */
async function headInner(parts: PeepParts): Promise<string> {
  const [headSvg, faceSvg, fhSvg, accSvg] = await Promise.all([
    atom("head", parts.head),
    atom("face", parts.face),
    parts.facialHair ? atom("facial-hair", parts.facialHair) : Promise.resolve(null),
    parts.accessory ? atom("accessories", parts.accessory) : Promise.resolve(null),
  ]);
  return (
    nest(headSvg, { x: 0, y: 0, w: HEAD_W, h: HEAD_H }) +
    nest(faceSvg, FACE) +
    (fhSvg ? nest(fhSvg, FACIAL_HAIR) : "") +
    (accSvg ? nest(accSvg, ACCESSORY) : "")
  );
}

// THROUGH PLACEHOLDERS, NOT SEQUENTIAL REPLACES. The naive pair —
// #000000→ink then #FFFFFF→paper — self-destructs the moment ink IS white:
// the second replace clobbers every stroke the first just wrote, and the
// avatar renders blank. That shipped, into an immutable cache, on 2026-08-08.
// Exported so peep-svg.ts recolours through the SAME implementation — its
// private copy was still the naive pair until the 2026-08-09 state audit.
export const recolourPeep = (svg: string, ink: string, paper: string) =>
  svg
    .replace(/#000000/gi, "__PEEP_INK__")
    .replace(/#FFFFFF/gi, "__PEEP_PAPER__")
    .replaceAll("__PEEP_INK__", ink)
    .replaceAll("__PEEP_PAPER__", paper);
const recolour = recolourPeep;

/** The avatar-circle composition. */
export async function composePeepHeadSvg(
  parts: PeepParts,
  colours: { ink: string; paper: string },
): Promise<string> {
  const inner = await headInner(parts);
  return recolour(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${HEAD_W} ${HEAD_H}">${inner}</svg>`,
    colours.ink,
    colours.paper,
  );
}

/** The full figure: body below, head above — the profile page's illustration
 *  and the builder's preview. Falls back to head-only when no body is set. */
export async function composePeepBustSvg(
  parts: PeepParts,
  colours: { ink: string; paper: string },
): Promise<string> {
  if (!parts.body) return composePeepHeadSvg(parts, colours);
  const [bodySvg, inner] = await Promise.all([
    atom("body", parts.body),
    headInner(parts),
  ]);
  const headGroup =
    `<svg x="${HEAD_ON_BODY.x}" y="${HEAD_ON_BODY.y}" width="${HEAD_W}" height="${HEAD_H}" viewBox="0 0 ${HEAD_W} ${HEAD_H}">` +
    inner +
    `</svg>`;
  return recolour(
    `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" viewBox="0 0 ${BUST_W} ${BUST_H}">` +
      nest(bodySvg, BODY) +
      headGroup +
      `</svg>`,
    colours.ink,
    colours.paper,
  );
}
