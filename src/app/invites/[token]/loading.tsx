import { SkeletonLine } from "@/components/page-skeleton";
import { PublicHeader } from "@/components/public-header";

/**
 * THE INVITATION WHILE `peekInvite` READS.
 *
 * ── THE ONLY SKELETON THAT KEEPS ITS HEADER ───────────────────────────────
 * This page lives outside the member shell, so nothing else on screen tells the
 * reader where they are. Someone arriving here has clicked a link from an
 * email and has no other context; a bare column of grey bars is the worst
 * possible first frame for the one screen most likely to be a stranger's first.
 * `PublicHeader` needs no read, so it is drawn for real.
 *
 * THE DECISION BUTTON IS NOT DRAWN. Everything above it is a fact being
 * fetched; the button is a commitment, and a full-width shape where "Join the
 * league" is about to appear invites a click at nothing.
 */
export default function InviteLoading() {
  return (
    <>
      <PublicHeader signedIn />
      <main id="main" tabIndex={-1}
        aria-busy="true"
        className="flex items-center justify-center px-6 py-20"
      >
        <span className="sr-only" role="status">
          Loading this invitation
        </span>
        <div aria-hidden className="flex w-full max-w-160 flex-col gap-7">
          <div className="flex flex-col items-center gap-2.5">
            <SkeletonLine w="w-28" h="h-2.5" />
            <SkeletonLine w="w-80" h="h-9" />
            <SkeletonLine w="w-64" h="h-4" />
          </div>
          <div className="flex flex-col divide-y rounded border bg-card">
            {["w-20", "w-32", "w-24", "w-24"].map((w, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <SkeletonLine w={w} h="h-3.5" />
                <SkeletonLine w="w-12" h="h-3.5" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
