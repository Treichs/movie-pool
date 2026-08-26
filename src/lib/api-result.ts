// The return shape shared by every external-API helper.
//
// Errors are RETURNED, never thrown. That matches the CommishFormState posture
// the rest of the app already uses, and it has one property that matters more
// than style: a missing API key, a rate limit, or a dead vendor becomes a value
// the caller must handle, not an exception that turns a page into a 500. The
// release calendar degrading to "we can't reach TMDB right now" is a feature;
// the whole app failing to render because a third party is down is not.
//
// LIVES AT THE OUTERMOST RING, NOT THE FLOOR — a Task 5 review correction to
// this file's own earlier claim. Zero imports means it trivially satisfies
// `infra-clients`' "may import only itself and infra-schema" policy, but that
// is not why it is here: it sits in `infrastructure/clients` because it IS a
// transport concern, the shape a vendor call returns, not because it is the
// bottom of the dependency graph — `infra-schema` is that floor.
//
// DELIBERATELY NOT `src/domain/action-result.ts` (Task 17), even though both
// are a two-branch result type. They describe different things: `status` here
// is an HTTP status code from a vendor (TMDB, OMDb) — meaningless to a form.
// `ActionResult`'s `field` names a form control so a component can mark the
// offending input — meaningless to a fetch. Merging them would produce a union
// carrying both fields where neither applies to half its callers.
//
// PLACEMENT IS A CONTROLLER RULING FROM TASK 5'S REVIEW, recorded here so the
// next reader does not re-litigate it: the reviewer proposed moving this shape
// to `infrastructure/schema/result.ts` with a re-export from `domain/`, on the
// grounds that `src/domain/README.md` and the 2026-08-19 spec both said
// `api-result` lands in `domain/`. The controller declined that move and is
// amending those two documents instead, so the code and the docs agree without
// this file moving twice. Moving it to `infra-schema` later remains available
// if that ruling changes.

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export function apiOk<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function apiFail<T>(error: string, status?: number): ApiResult<T> {
  return status === undefined ? { ok: false, error } : { ok: false, error, status };
}
