/**
 * ONE FORM result shape, replacing two near-identical ones: `CommishFormState`
 * and `BidFormState`. The smell that argued for this was invite-cards.tsx
 * importing `CommishFormState` — a COMMISSIONER type — to type an ACCOUNT form.
 *
 * ONLY ONE OF THE TWO IS ACTUALLY GONE YET, and saying "replacing" without
 * saying which would be this comment claiming work the code has not done.
 * `BidFormState` is deleted: its file (`src/app/(member)/season/actions.ts`)
 * moved to `src/orchestration/actions/bid.ts` in the same commit and both bid
 * actions now return this. `CommishFormState` survives in
 * `src/app/(member)/commish/actions.ts`, where THIRTY-FOUR actions and the
 * shared `ActionForm` are typed against it — folding it in is a whole-surface
 * migration, not a line in the task that introduces the type. It is the next
 * caller, and the invite-cards smell above stays live until it lands.
 *
 * `ApiResult<T>` is deliberately NOT absorbed. Ruling 10, from Task 5's review:
 * it is a different concept wearing a similar shape. `ApiResult` carries
 * `status?: number` — an HTTP status from a vendor — and lives at
 * `src/infrastructure/clients/api-result.ts`, because a dead vendor becoming a
 * value is a transport concern. `ActionResult` carries `field?: string` — the
 * name of a form control to mark — and lives here. Merging them yields a union
 * carrying both, where neither applies to half its callers.
 *
 * `field` is what lets a registry form component mark the offending control and
 * therefore have an honest `error` story.
 *
 * WHY THE DISCRIMINANT IS `ok` AND NOT THE PRESENCE OF `error`. The two shapes
 * being replaced were both bags of optionals (`{ error?: string; notice?: string }`),
 * so "did this succeed" was answered by a truthiness test on a message string —
 * which makes an empty-string error read as a success and gives TypeScript
 * nothing to narrow on. A literal boolean tag is what turns `isOk` into a real
 * type guard instead of a convention.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T; notice?: string }
  | { ok: false; error: string; field?: string };

export const ok = <T>(data: T, notice?: string): ActionResult<T> => ({
  ok: true,
  data,
  notice,
});

export const fail = (error: string, field?: string): ActionResult<never> => ({
  ok: false,
  error,
  field,
});

export const isOk = <T>(
  r: ActionResult<T>
): r is Extract<ActionResult<T>, { ok: true }> => r.ok;
