-- update_week must not write week_of (2026-08-04). Fixes 20260804130000.
--
-- week_of is a GENERATED column — ADR-042 made it "the Monday of this week's
-- Mon-Sun range — generated, never written". The rewrite in 20260804130000 set
-- it explicitly alongside opening_date, on the reasoning that moving a weekend
-- moves the week it belongs to. That reasoning is right and the write was
-- unnecessary: Postgres recomputes week_of from opening_date on its own, and
-- assigning to it fails with "column can only be updated to DEFAULT".
--
-- Caught by the phase3 spike's "advisory deadline editable while open"
-- assertion, which is the only place update_week is exercised. The generated
-- column is exactly the kind of detail a re-declaration loses.

create or replace function public.update_week(
  p_week_id uuid,
  p_opening_date date,
  p_bid_deadline timestamptz default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can edit weeks';
  end if;
  if v_week.status not in ('draft', 'open') then
    raise exception 'week can no longer be edited (status: %)', v_week.status;
  end if;
  if p_opening_date is null then
    raise exception 'week needs an opening date';
  end if;

  -- p_bid_deadline is ACCEPTED AND IGNORED, deliberately. The parameter is kept
  -- so existing callers still resolve; the deadline is set through
  -- set_week_bid_deadline, which knows the difference between an override and
  -- an inherited value.
  --
  -- week_of is NOT set here: it is generated from opening_date, so it follows
  -- on its own and assigning to it is an error.
  update weeks
  set opening_date = p_opening_date,
      bids_open_at = week_bids_open_at(p_opening_date,
                                       (settings_for_season(v_week.season_id)).bids_due_tz)
  where id = p_week_id;

  -- Moving the weekend moves the week it belongs to, so its inherited deadline
  -- moves with it — the case that made the old function wrong even before
  -- defaults existed, since it changed opening_date and left the deadline
  -- pointing at the old week.
  perform sync_week_deadlines(v_week.season_id);
end;
$$;
