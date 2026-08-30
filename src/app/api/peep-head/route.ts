import { NextRequest, NextResponse } from "next/server";
import {
  ACCESSORY_ATOMS,
  BODY_ATOMS,
  FACE_ATOMS,
  FACIAL_HAIR_ATOMS,
  HEAD_ATOMS,
} from "@/lib/peep-atoms";
import { composePeepBustSvg, composePeepHeadSvg } from "@/lib/peep-compose";

// COMPOSED PEEPS AS AN IMAGE ENDPOINT (2026-08-08).
//
// The avatar circles are CLIENT-rendered (standings tables sort client-side,
// the bump chart hovers), and composition needs node:fs — the same wall that
// split lib/peep from lib/peep-svg. An <img src> across it is the clean
// seam: the client derives WHICH parts and builds a URL; lib/peep-compose
// owns the filesystem, the anchors and the recolouring. With `body` set the
// response is the full-figure bust — the dress-up builder's live preview.
//
// The response is IMMUTABLE-cacheable, so the URL carries a version param
// (see PEEP_HEAD_VERSION in lib/peep-atoms) — a change to the composition
// must change the URL or every returning browser keeps the old bytes for a
// year, which is how v1's blank-avatar bug briefly became permanent.
//
// INPUT IS ALLOWLISTED, NOT SANITISED. Part names must be members of the
// committed manifests — not paths, not patterns — and colours must be plain
// hex. Nothing user-authored can reach the SVG text.

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const head = q.get("head") ?? "";
  const face = q.get("face") ?? "";
  const fh = q.get("fh");
  const acc = q.get("acc");
  const body = q.get("body");
  const ink = q.get("ink") ?? "#000000";
  const paper = q.get("paper") ?? "#ffffff";

  const oneOf = (list: readonly string[], v: string | null) =>
    v === null || list.includes(v);

  if (
    !(HEAD_ATOMS as readonly string[]).includes(head) ||
    !(FACE_ATOMS as readonly string[]).includes(face) ||
    !oneOf(FACIAL_HAIR_ATOMS, fh) ||
    !oneOf(ACCESSORY_ATOMS, acc) ||
    !oneOf(BODY_ATOMS, body) ||
    !HEX.test(ink) ||
    !HEX.test(paper)
  ) {
    return new NextResponse("bad peep", { status: 400 });
  }

  const parts = { head, face, facialHair: fh, accessory: acc, body };
  const svg = body
    ? await composePeepBustSvg(parts, { ink, paper })
    : await composePeepHeadSvg(parts, { ink, paper });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
