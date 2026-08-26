-- set_week_bid_deadline states the week-range rule itself (2026-08-04).
--
-- ADR-042's gate_week_bid_deadline trigger requires a week's deadline to fall
-- inside that week's own Mon-Sun range — it exists to catch week 3's deadline
-- landing in week 7. My set_week_bid_deadline leaned on that trigger without
-- mentioning it, so pinning a week to a date three weeks out was refused with
-- the trigger's raw message and no hint of what the caller should have done.
--
-- The catalog spike caught the gap from the other side: its assertion drove the
-- rule through update_week, which no longer writes the deadline at all, so
-- nothing was refused and the invariant looked untested. It is re-pointed at
-- this function, which is now the only door to a week's deadline.
--
-- The check here duplicates the trigger deliberately. The trigger is the
-- invariant — it holds on every write path including service-role ones — and
-- this is the sentence a commissioner reads. Same UTC comparison, so the two
-- can never disagree about which dates are legal.

create or replace function public.set_week_bid_deadline(
  p_week_id  uuid,
  p_deadline timestamptz
)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_week_of date;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can change a week''s deadline';
  end if;
  if v_week.status not in ('draft', 'open') then
    raise exception 'bidding on this week has closed — its deadline is now a matter of record (status: %)', v_week.status;
  end if;
  if p_deadline is not null and p_deadline <= now() then
    raise exception 'that moment has already passed — a deadline can only be moved to the future';
  end if;

  -- ADR-042: a week's deadline belongs to that week.
  if p_deadline is not null then
    v_week_of := v_week.opening_date - (extract(isodow from v_week.opening_date)::int - 1);
    if (p_deadline at time zone 'utc')::date not between v_week_of and v_week_of + 6 then
      raise exception
        'bids for week % have to close during that week — pick a moment between % and %',
        v_week.number, to_char(v_week_of, 'FMMon FMDD'), to_char(v_week_of + 6, 'FMMon FMDD');
    end if;
  end if;

  update weeks set bid_deadline_override = p_deadline where id = p_week_id;
  perform sync_week_deadlines(v_week.season_id);

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'set_week_bid_deadline',
          jsonb_build_object('week_id', p_week_id,
                             'week_number', v_week.number,
                             'from', v_week.bid_deadline,
                             'override', p_deadline));

  return (select bid_deadline from weeks where id = p_week_id);
end;
$$;
