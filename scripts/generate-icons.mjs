// Regenerate the raster app icons from the Movie Pool mark.
//
// Run: npm run icons
//
// WHY GENERATE RATHER THAN HAND-DRAW: every size a browser asks for should be
// the same mark. Drawing them separately is how a favicon ends up subtly
// different from the touch icon.
//
// Only the sizes actually REFERENCED in layout.tsx's metadata are produced. An
// unreferenced icon file is dead weight that looks like it is doing something.
//
// The SVG remains the primary favicon — these are the fallback for clients that
// do not take SVG, plus the one case where a PNG is mandatory: iOS ignores SVG
// for apple-touch-icon.
//
// TWO SOURCES, because the mark has two drawings:
//   · movie-pool-favicon.svg   square canvas, the TMP filmstrip, for tab sizes
//   · movie-pool-app-icon.svg  the mark on its own ink tile, with the name set
//                              beneath it, for home screens and iOS
//
// sharp is not a declared dependency — it resolves from Next's own install, the
// same way it did in the repo this mark came from. If that ever stops being
// true, this script is where it breaks, and `npm i -D sharp` is the fix.

import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const FAVICON = readFileSync("public/movie-pool-favicon.svg");
const APP_ICON = readFileSync("public/movie-pool-app-icon.svg");

// apple-touch-icon is FLATTENED onto the app's own ground. iOS composites a
// transparent touch icon onto black, which is why this uses the tile drawing
// and fills the corners it rounds off with the same ink — iOS applies its own
// mask on top, and an ink-on-ink seam is invisible where a black one is not.
const TARGETS = [
  { file: "public/apple-touch-icon.png", size: 180, svg: APP_ICON, background: "#000000" },
  // 192 is a HOME-SCREEN size, not a tab size — it gets the tile drawing, which
  // carries the name under the mark. That line is unreadable at 32 and is the
  // reason the two drawings exist.
  { file: "public/icon-192.png", size: 192, svg: APP_ICON, background: null },
  { file: "public/icon-32.png", size: 32, svg: FAVICON, background: null },
];

for (const { file, size, svg, background } of TARGETS) {
  let pipeline = sharp(svg).resize(size, size);
  if (background) pipeline = pipeline.flatten({ background });
  await pipeline.png().toFile(file);
  console.log(`  ${file}  ${size}x${size}`);
}

// public/favicon.ico — for the clients that ask for /favicon.ico by PATH rather
// than reading the link tags.
//
// No browser needs this: with the link tags present, none of them probes the
// root path. But link-preview bots, feed readers and other crawlers do ask
// blindly, and without it they get a 404 and fall back to nothing.
//
// Hand-written container because sharp cannot ENCODE ico. The format allows
// PNG-compressed entries (Vista and later), so this is a directory of three
// PNGs of the one drawing.
const entries = [];
for (const size of [16, 32, 48]) {
  entries.push({ size, png: await sharp(FAVICON).resize(size, size).png().toBuffer() });
}

const HEADER = 6;
const DIR_ENTRY = 16;
const dir = Buffer.alloc(HEADER + DIR_ENTRY * entries.length);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type: 1 = icon
dir.writeUInt16LE(entries.length, 4);

let offset = dir.length;
entries.forEach(({ size, png }, i) => {
  const at = HEADER + DIR_ENTRY * i;
  dir.writeUInt8(size, at); // width  (0 would mean 256)
  dir.writeUInt8(size, at + 1); // height
  dir.writeUInt8(0, at + 2); // palette size: 0 = truecolour
  dir.writeUInt8(0, at + 3); // reserved
  dir.writeUInt16LE(1, at + 4); // colour planes
  dir.writeUInt16LE(32, at + 6); // bits per pixel
  dir.writeUInt32LE(png.length, at + 8);
  dir.writeUInt32LE(offset, at + 12);
  offset += png.length;
});

writeFileSync("public/favicon.ico", Buffer.concat([dir, ...entries.map((e) => e.png)]));
console.log(`  public/favicon.ico  ${entries.map((e) => e.size).join(" / ")} (png-in-ico)`);

console.log(`Generated ${TARGETS.length + 1} icons.`);
