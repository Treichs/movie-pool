"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * THE BID WRITE — the only path a bid takes into the database.
 *
 * Moved out of `src/app/(member)/seasons/actions.ts`, which is now deleted. The
 * move is not cosmetic: that file reached transport through `@/lib/supabase/server`,
 * a compatibility forward left behind by Task 5 because the layer contract
 * refuses `app -> infra-clients`. From here the import is direct and permitted,
 * which is the removal condition that forward's own header names.
 *
 * These stay thin wrappers over the RPCs. The database functions are the rule
 * enforcers — week open, member of season, minimum bid, sum-exposure budget
 * check, one bid per film — and their exception messages are written to be
 * player-readable, so they are surfaced as-is rather than translated here.
 *
 * NO GATE CALL, DELIBERATELY, and this is the one place `SeasonContext` does not
 * appear. `requireSeasonMember` answers with `notFound()`, which renders a 404
 * page — correct for a navigation, meaningless as the result of a form POST that
 * expects a value back. The authorization that matters happens in the RPC under
 * RLS regardless of what any caller believes, so adding a gate here would buy a
 * worse failure mode and no extra safety.
 *
 * `revalidatePath`, NEVER `revalidateTag`. Not a style preference: the Supabase
 * client carries the user's JWT under RLS, so the same read returns different
 * rows per user. A tag-keyed cache over an RLS-scoped read is a cross-user data
 * leak.
 *
 * EVERY EXPORT HERE IS AN ASYNC FUNCTION because "use server" requires it — the
 * `ActionResult` type is imported from `@/domain`, and cannot be re-exported
 * from this file even as a type.
 */

// A placed bid changes three surfaces, not one: the week board, the season hub
// (its slate shows my bid, and the stat row my budget) and the dashboard (its
// action banner counts how many films I have bid on, and its budget meter).
// Revalidating only the week page left the other two showing stale money.
function revalidateBidSurfaces(seasonId: string, weekId: string) {
  // THE BID PAGE ITSELF IS A SEPARATE PATH from the week board, and it was
  // missing here until Task 18. `/seasons/x/weeks/y` and `/seasons/x/weeks/y/bid`
  // are two routes; `revalidatePath` with a plain path invalidates exactly the
  // one it is given. The screen still refreshed, because a Server Action's
  // response re-renders the current route regardless and this page is dynamic —
  // which is precisely why the omission was invisible. It is listed anyway: the
  // set is meant to name every surface a bid changes, and one that is right by
  // accident stops being right the moment the page's caching changes.
  revalidatePath(`/seasons/${seasonId}/weeks/${weekId}/bid`);
  revalidatePath(`/seasons/${seasonId}/weeks/${weekId}`);
  revalidatePath(`/seasons/${seasonId}`);
  revalidatePath("/leagues");
}

/** One bid on one film. */
export async function placeBid(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const seasonId = String(formData.get("season_id") ?? "");
  const weekId = String(formData.get("week_id") ?? "");
  const filmId = String(formData.get("film_id") ?? "");

  const raw = String(formData.get("amount") ?? "").trim();
  const amount = Number(raw);
  // `field` is the whole reason `ActionResult` exists rather than a bare
  // `{ error?: string }`: the form knows WHICH control to mark, so the message
  // can sit against the offending input instead of floating above the slate.
  if (raw === "" || !Number.isInteger(amount)) {
    return fail("Bid must be a whole number of dollars.", "amount");
  }

  const db = await createClient();
  const { error } = await db.rpc("place_bid", {
    p_film_id: filmId,
    p_amount: amount,
  });
  if (error) return fail(error.message, "amount");

  revalidateBidSurfaces(seasonId, weekId);
  return ok(undefined, `Bid placed: $${amount}.`);
}

/**
 * ADR-023 batch bidding: the whole basket lands or none of it does, checked
 * against the budget as one sum. The alternative — firing `place_bid` per film —
 * can reject mid-basket and leave the player with half the bids they reviewed
 * and a total that silently lied.
 *
 * The basket arrives as JSON rather than repeated fields because it is a
 * variable-length list of pairs, which is exactly what `place_bids(jsonb)` takes.
 */
export async function placeBids(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const seasonId = String(formData.get("season_id") ?? "");
  const weekId = String(formData.get("week_id") ?? "");

  let basket: { film_id: string; amount: number }[];
  try {
    basket = JSON.parse(String(formData.get("basket") ?? "[]"));
  } catch {
    return fail("Something went wrong reading your bids. Try again.");
  }

  // ADR-109: an all-$0 basket is a LEGAL submission — it is how a player sits a
  // week out now that `pass_week` is gone — so this can no longer say "enter at
  // least one bid". Empty here means the slate had nothing eligible on it, which
  // is a fact about the WEEK and therefore carries no `field`.
  if (!Array.isArray(basket) || basket.length === 0) {
    return fail("There is nothing on this slate to bid on yet.");
  }
  // The RPC re-checks this and every other rule; catching it here just spares a
  // round trip for the one mistake the form itself can see.
  //
  // IT NAMES THE FILM (Task 18). This used to `.some(...)` and return a bare
  // message, which on a six-film slate told the player a rule and left them to
  // find the row — and left `ActionResult.field` unexercised on the only write
  // in the app that had been migrated to it. `field` carries the FILM ID
  // because that is what a slate's controls are keyed by; the form marks that
  // one `Field` invalid and puts the message under it.
  const fractional = basket.find((b) => !Number.isInteger(b.amount));
  if (fractional) {
    return fail("Bids are whole dollars only.", fractional.film_id);
  }

  const db = await createClient();
  const { error } = await db.rpc("place_bids", { p_bids: basket });
  if (error) return fail(error.message);

  revalidateBidSurfaces(seasonId, weekId);
  const total = basket.reduce((sum, b) => sum + b.amount, 0);
  return ok(
    undefined,
    `${basket.length} ${basket.length === 1 ? "bid" : "bids"} placed — $${total} committed.`
  );
}

// REMOVED 2026-08-12, before this file existed: `setWeekPassed`, the wrapper
// over pass_week/resume_bidding (ADR-109). Sitting a week out is now a saved
// slate of $0 bids rather than a flag on the week plus a deletion of every bid
// behind it — which means it is recorded in the same data as every other
// decision, and no player-facing path deletes bids any more.

/**
 * THE EARLY CLOSE — the commissioner strip's one power on this page.
 *
 * Written here rather than ported from the old commissioner surface, which
 * types every action against `CommishFormState`. That is the second
 * form-result shape `ActionResult` exists to replace; reproducing it for one
 * button would spread it into the rebuild's first screen.
 *
 * The close CASCADES (ADR-056) — the next week opens — so the season is
 * revalidated as a layout rather than this week's path alone.
 */
export async function closeWeek(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const seasonId = String(formData.get("season_id") ?? "");
  const weekId = String(formData.get("week_id") ?? "");

  const db = await createClient();
  const { error } = await db.rpc("close_week", { p_week_id: weekId });
  if (error) return fail(error.message);

  revalidatePath(`/seasons/${seasonId}`, "layout");
  revalidatePath("/leagues");
  return ok(
    undefined,
    "Bidding closed — all bids are revealed, and the next week is now open."
  );
}
