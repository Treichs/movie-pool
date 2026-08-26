-- Release-date drift — let a commissioner correct a film's stored date when
-- TMDB moves it, WITHOUT giving anyone a way to move a film between weeks.
--
-- THE PROBLEM. A film is added to week 5 on the strength of TMDB's wide-release
-- date. Studios move dates. Nothing re-checks, so the film sits on week 5
-- silently while TMDB now says it opens in week 7 — and the first anyone knows
-- is when the weekend arrives and the slate is wrong. This was open question 4
-- in the film-catalog plan and was left unbuilt.
--
-- THE SHAPE OF THE FIX. Drift comes in two degrees and they are NOT the same
-- problem:
--
--   SAME WEEK  — the film still opens in the week it is on, just on a different
--                day. films.release_date is a DISPLAY field, not a scoring
--                input, so correcting it changes nothing anyone bid on. Safe to
--                offer as one click.
--
--   OTHER WEEK — the film is on the wrong week. Bids may already exist against
--                it. Moving it would silently change what players bid on and
--                which weekend it scores in. That is a judgement call with
--                money attached, so the app REPORTS it and the commissioner
--                decides (remove and re-add, or leave it).
--
-- WHY THIS FUNCTION CANNOT MOVE A FILM. It does not check the week range
-- itself, and deliberately so: `gate_film_release_date` (ADR-042) already
-- fires on any update of films.release_date and rejects a date outside the
-- week's Mon-Sun range. The safe operation is therefore safe BY CONSTRUCTION —
-- if the UI ever offered a cross-week "fix", the database would refuse it.
-- One invariant, enforced in one place.

create or replace function public.update_film_release_date(
  p_film_id      uuid,
  p_release_date date
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film films%rowtype;
  v_week weeks%rowtype;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;

  select * into v_week from weeks where id = v_film.week_id;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can correct a release date';
  end if;
  -- Same window as add_film/update_film: a locked week and everything after it
  -- is history, and history does not get retconned.
  if v_week.status not in ('draft', 'open') then
    raise exception 'this week can no longer be edited (status: %)', v_week.status;
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the slate';
  end if;
  if p_release_date is null then
    raise exception 'a release date is required';
  end if;

  -- The gate trigger decides whether this date is legal for this week.
  update films set release_date = p_release_date where id = p_film_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'update_film_release_date',
          jsonb_build_object('film_id', p_film_id, 'title', v_film.title,
                             'week_id', v_week.id, 'week_number', v_week.number,
                             'from', v_film.release_date, 'to', p_release_date,
                             'source', 'tmdb-drift'));
end;
$$;

comment on function public.update_film_release_date(uuid, date) is
  'Corrects films.release_date when TMDB moves a film WITHIN its week. Cannot move a film between weeks — gate_film_release_date refuses a date outside the week range (ADR-042).';

revoke all on function public.update_film_release_date(uuid, date) from public, anon;
grant execute on function public.update_film_release_date(uuid, date) to authenticated;
