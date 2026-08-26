-- ADR-070, part 1 of 2: the labels, and the data behind them.
--
-- The week states were named after the machinery. `locked` and `resolved` were
-- the two sides of a button, and `scored` was something the app did on the
-- commissioner's behalf without telling them. The new model names states after
-- WHO ACTS:
--
--     draft   -> open      the clock (Monday, 12am, the week before)
--     open    -> closed    the clock (the league's bids-due moment)
--     closed  -> final     THE COMMISSIONER
--     draft   -> skipped   THE COMMISSIONER
--
-- so `locked` and `resolved` collapse into one `closed` — closing a week now
-- computes its winners in the same act (part 2) — and `scored` becomes `final`,
-- which the commissioner presses rather than trips over.
--
-- WHY `resolved` IS THE ONE RENAMED, and `locked` the one left behind. Postgres
-- cannot drop an enum value without recreating the type, which would mean
-- dropping every function and policy that depends on it. One of the two has to
-- survive as an orphan, and it should be the one whose MEANING is going away:
-- `resolved` already means "winners are computed", which is exactly what the
-- new `closed` means, so renaming it keeps every existing row honest. `locked`
-- meant "revealed but not yet resolved", a state that no longer exists — so it
-- is emptied here and no code path can produce it again.
--
-- Verified against the hosted database before writing: zero `locked` and zero
-- `resolved` rows exist today (12 draft, 5 open, 6 scored). The resolve pass
-- below is therefore a no-op in practice, and written anyway because a
-- migration has to be correct for any database it is ever run against — a
-- restored backup, another environment, or a season mid-flight on the day this
-- ships.

-- ---------------------------------------------------------------------------
-- 1. Any week sitting at `locked` has had its bids revealed but its winners
--    never computed. Under the new model that state is unreachable, so it has
--    to be finished rather than relabelled: renaming it to `closed` without
--    this pass would leave weeks CLAIMING their ownership was settled while
--    every is_winning on them was still null.
--
--    Same rule as resolve_week, which part 2 deletes: is_winning is true for a
--    bid on an eligible film whose amount is among the top N DISTINCT amounts
--    for that film.
-- ---------------------------------------------------------------------------
do $$
declare
  r       record;
  v_top_n integer;
begin
  for r in select w.id, w.season_id from weeks w where w.status = 'locked' loop
    select (settings_for_season(r.season_id)).top_n_distinct into v_top_n;
    if v_top_n is null then
      raise exception 'week % has no settings row — cannot resolve it', r.id;
    end if;

    update bids b
    set is_winning = (
      f.eligible
      and b.amount in (
        select distinct b2.amount
        from bids b2
        where b2.film_id = b.film_id
        order by b2.amount desc
        limit v_top_n
      )
    )
    from films f
    where f.id = b.film_id
      and f.week_id = r.id
      and f.status = 'active';

    insert into audit_log (season_id, actor, action, detail)
    values (r.season_id, null, 'resolve_week',
            jsonb_build_object('week_id', r.id,
                               'reason', 'ADR-070 rename: locked folded into closed'));
  end loop;
end $$;

-- Now that they mean the same thing, they can BE the same thing.
update weeks set status = 'resolved' where status = 'locked';

-- ---------------------------------------------------------------------------
-- 2. The renames.
--
--    Stored policy expressions hold enum values by OID, not by name, so
--    bids_select follows this automatically and keeps working. plpgsql and SQL
--    function bodies are stored as TEXT and do not — every one of them is
--    re-declared in part 2, which is a separate file so that these renames are
--    committed before those bodies are parsed.
-- ---------------------------------------------------------------------------
alter type public.week_status rename value 'resolved' to 'closed';
alter type public.week_status rename value 'scored'   to 'final';

comment on type public.week_status is
  'ADR-070. draft -> open -> closed by the clock; closed -> final and '
  'draft -> skipped by the commissioner. `locked` is a DEAD label kept only '
  'because Postgres cannot drop an enum value; nothing writes it and no row '
  'carries it.';
