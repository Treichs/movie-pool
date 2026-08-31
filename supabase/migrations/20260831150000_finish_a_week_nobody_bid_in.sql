-- ============================================================================
-- A WEEK NOBODY BID IN CAN BE FINISHED WITHOUT CAPTURING ANYTHING.
--
-- `finalize_week` refuses until every ACTIVE, ELIGIBLE film carries an opening
-- box office and a Tomatometer. That gate asks about eligibility and never
-- about ownership, so on a week where the whole league passed it demanded real
-- data entry for films that cannot score for anybody — the numbers change no
-- total, move no standing, and settle nothing.
--
-- There was no way out of it either. `skip_week` requires status 'draft', so a
-- closed week cannot be skipped; there is no reopen. The only escape was to
-- `remove_film` every film on the slate, which needs a removal reason and
-- writes a correction claiming films were pulled — a lie about films that
-- opened perfectly normally and simply went unwanted.
--
-- So: when a week produced NO WINNING BIDS AT ALL, the capture gate does not
-- apply and the commissioner can finish it in one press.
--
-- ── WHY THE CONDITION IS THE WHOLE WEEK, NOT THE FILM ────────────────────
-- The narrower rule — "skip the gate for any film nobody owns" — was rejected.
-- On a MIXED week the reveal prints every film's score, owned or not, and that
-- is half of what the board is for: seeing what you passed on. Dropping the
-- requirement per film would quietly hollow that out. A week with no owners at
-- all has no such reading to protect, because there is nothing to compare.
--
-- ── THIS IS NOT A SKIPPED WEEK AND MUST NEVER BECOME ONE ─────────────────
-- It keeps its films and its status trail. A skipped week never had a slate;
-- this one had films that opened and were passed over, which is a result the
-- league will argue about. The app records what happened.
--
-- Body is the LIVE definition (pg_get_functiondef, 2026-08-31) with the gate
-- made conditional. Nothing else changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_week(p_week_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_week    weeks%rowtype;
  v_missing integer;
  v_owners  integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can finish a week';
  end if;
  if v_week.status = 'final' then
    raise exception 'this week is already final';
  end if;
  if v_week.status <> 'closed' then
    raise exception 'bidding has to close before a week can be finished (status: %)',
      v_week.status;
  end if;
  -- ADR-080: a week cannot be finished until its Monday–Sunday week has ended —
  -- the same gate capture_film applies, keyed on week_of. This still holds for
  -- an unbid week: the weekend has to be over before it is history.
  if current_date <= v_week.week_of + 6 then
    raise exception
      'this week can''t be finished until it ends — results open %, the Monday after',
      to_char(v_week.week_of + 7, 'FMDay, FMMon FMDD');
  end if;

  -- OWNERSHIP DECIDES WHETHER THE CAPTURE GATE APPLIES. Counted over films
  -- still on the slate: a removed film's bids were refunded and score for
  -- nobody, so owners on a pulled film are not owners.
  select count(*) into v_owners
  from bids b
  join films f on f.id = b.film_id
  where f.week_id = p_week_id
    and f.status = 'active'
    and b.is_winning;

  if v_owners > 0 then
    select count(*) into v_missing
    from films f
    where f.week_id = p_week_id
      and f.status = 'active'
      and f.eligible
      and (f.captured_at is null or f.box_office_m is null or f.tomatometer is null);
    if v_missing > 0 then
      raise exception
        '% film(s) still need an opening box office and a Tomatometer before this week can be finished',
        v_missing;
    end if;
  end if;

  update weeks set status = 'final' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'finalize_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'owners', v_owners));
end;
$function$;
