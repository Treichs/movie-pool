-- ---------------------------------------------------------------------------
-- move_film_to_week — the commissioner's one-click answer to release drift.
--
-- checkReleaseDrift (20260801120000) already notices when TMDB moves a film to
-- a different weekend, and it deliberately offered no control: the note told
-- the commissioner to remove the film and add it to the right week by hand,
-- because players may already have bid and that is not a decision to take
-- behind their backs. The telling was right; making them do it in four
-- navigations was not.
--
-- A MOVE IS A REMOVAL PLUS AN ARRIVAL, and it is built that way rather than as
-- an UPDATE of week_id. Two reasons, and the second is the load-bearing one:
--
--   1. The rulebook already covers the leaving half. "The commissioner may also
--      remove a film from the roster for other reasons... the film scores for
--      no one, and every player who bid on or won it is fully refunded." So the
--      refund is not a new rule invented for this feature — it is the existing
--      rule applied to the leg the film leaves.
--
--   2. Rewriting week_id in place would carry the bids across, and a sealed bid
--      is an agreement about ONE weekend's slate. The target week can have a
--      different deadline, can already be open with different bidders, and the
--      player never consented to committing that money there. Refund-by-
--      derivation (build plan §3) means the old row simply stops counting, and
--      its bids stay attached to it as a record of what happened.
--
-- So the source row is soft-removed through remove_film itself — not a copy of
-- its logic — which means the refund, the audit entry and the player-facing
-- disclosure all come from the one tested path. The removal REASON carries the
-- destination, so a player reading the corrections list is told where the film
-- went, not merely that it vanished.
--
-- The arriving row is new and clean: no bids, no captured numbers. It inherits
-- only identity (title, tmdb_id, imdb_id, eligibility) and takes TMDB's new
-- date. box_office_m / tomatometer / captured_at are deliberately NOT copied —
-- a film that has not opened yet cannot have them, and a move only ever happens
-- before the weekend it moved to.
--
-- release_calendar_week_id is left to films_set_calendar_anchor, and the date /
-- week agreement is enforced by films_gate_release_date (ADR-042). Both fire on
-- insert. The explicit check below exists only so the commissioner gets a
-- sentence instead of a trigger exception.
-- ---------------------------------------------------------------------------
create or replace function public.move_film_to_week(
  p_film_id        uuid,
  p_target_week_id uuid,
  p_release_date   date,
  /** Overrides the generated reason. The generated one already names the
   *  destination, so this is for the commissioner who wants to say more. */
  p_reason         text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_film        films%rowtype;
  v_from_week   weeks%rowtype;
  v_to_week     weeks%rowtype;
  v_to_week_of  date;
  v_reason      text;
  v_new_id      uuid;
  v_bid_count   integer;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;
  if v_film.status <> 'active' then
    raise exception 'that film has already been removed';
  end if;

  select * into v_from_week from weeks where id = v_film.week_id for update;
  if not is_commissioner(v_from_week.season_id) then
    raise exception 'only the commissioner can move films between weeks';
  end if;
  -- A closed week is history. Moving a film out of one would rewrite what the
  -- season already settled, which no amount of TMDB drift justifies.
  if v_from_week.status not in ('draft', 'open') then
    raise exception 'week % has closed — its slate is now a matter of record (status: %)',
      v_from_week.number, v_from_week.status;
  end if;

  select * into v_to_week from weeks where id = p_target_week_id for update;
  if not found then
    raise exception 'that week does not exist on this season';
  end if;
  -- Same season, checked explicitly: a week id is guessable, and without this
  -- a commissioner of one season could push a film into another one's slate.
  if v_to_week.season_id <> v_from_week.season_id then
    raise exception 'that week belongs to a different season';
  end if;
  if v_to_week.id = v_from_week.id then
    raise exception 'that film is already on week %', v_from_week.number;
  end if;
  if v_to_week.status not in ('draft', 'open') then
    raise exception 'week % is no longer taking films (status: %)',
      v_to_week.number, v_to_week.status;
  end if;

  if p_release_date is null then
    raise exception 'a moved film needs the date it now opens on';
  end if;
  v_to_week_of := v_to_week.opening_date
                  - (extract(isodow from v_to_week.opening_date)::int - 1);
  if p_release_date not between v_to_week_of and v_to_week_of + 6 then
    raise exception '% opens on % — that is not inside week % (the week of %)',
      v_film.title, p_release_date, v_to_week.number, v_to_week_of;
  end if;

  select count(*) into v_bid_count from bids where film_id = p_film_id;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := format('Moved to Week %s — it now opens %s',
                       v_to_week.number, to_char(p_release_date, 'FMDay, FMMon FMDD'));
  end if;

  -- The refund, the audit row and the player-facing disclosure, all from the
  -- one path that already does them.
  perform remove_film(p_film_id, v_reason);

  insert into films (week_id, title, imdb_id, tmdb_id, release_date, eligible)
  values (p_target_week_id, v_film.title, v_film.imdb_id, v_film.tmdb_id,
          p_release_date, v_film.eligible)
  returning id into v_new_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_from_week.season_id, auth.uid(), 'move_film_to_week',
          jsonb_build_object(
            'film_id', p_film_id, 'new_film_id', v_new_id,
            'title', v_film.title,
            'week_id', v_from_week.id, 'from_week', v_from_week.number,
            'to_week_id', v_to_week.id, 'to_week', v_to_week.number,
            'release_date', p_release_date,
            'refunded_bids', v_bid_count,
            'reason', v_reason));

  return v_new_id;
end;
$$;

revoke all on function public.move_film_to_week(uuid, uuid, date, text) from public, anon;
grant execute on function public.move_film_to_week(uuid, uuid, date, text) to authenticated;

comment on function public.move_film_to_week(uuid, uuid, date, text) is
  'Release-drift correction: soft-remove a film from its week (refunding every '
  'bid through remove_film) and re-add it to another week of the same season '
  'with its new date. Both weeks must still be draft or open. Bids do NOT '
  'travel — a sealed bid is an agreement about one weekend''s slate.';
