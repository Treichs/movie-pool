-- ============================================================================
-- SCORING IS GATED UNTIL AFTER THE OPENING WEEKEND (ADR-080).
--
-- The first real-use walkthrough caught the commissioner entering box office and
-- Tomatometer — and finalizing a week — for films that had not opened yet. The
-- score is the OPENING WEEKEND gross, known the Monday after the Friday opening,
-- so capturing earlier scores a film against numbers that do not exist.
--
-- The gate: capture_film and finalize_week are refused until the week's opening
-- weekend has passed — current_date >= opening_date + 3 (Friday opening + 3 =
-- the following Monday). A `final` week's re-capture (a correction) passes,
-- because by then the weekend is in the past.
--
-- Both bodies start from their CURRENT live definitions (pg_get_functiondef
-- 2026-08-06) with only the gate added. `create or replace` preserves grants.
--
-- (The other half of ADR-080 — adding a film opening its week — is an app-side
-- cascade calling open_due_weeks_for_season after the picker adds films, so it
-- is not in this migration.)
-- ============================================================================

create or replace function public.capture_film(p_film_id uuid, p_box_office_m numeric, p_tomatometer integer, p_suggested jsonb default null::jsonb)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_film       films%rowtype;
  v_week       weeks%rowtype;
  v_score      numeric;
  v_key        text;
  v_node       jsonb;
  v_provenance jsonb := '{}'::jsonb;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;

  select * into v_week from weeks where id = v_film.week_id for update;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can capture results';
  end if;
  -- CHANGED (ADR-070). `final` stays on the list so a wrong number can be
  -- corrected without walking the week backwards.
  if v_week.status not in ('closed', 'final') then
    raise exception 'bidding has to close before results can be captured (status: %)',
      v_week.status;
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the roster and is not scored';
  end if;
  -- ADR-080: no scoring until the Monday–Sunday week has ended. week_of is the
  -- generated Monday, so the week ends on week_of + 6 (Sunday) and the weekend
  -- gross is known week_of + 7 (the next Monday). Gating on week_of is exact —
  -- opening_date is only "usually a Friday", week_of is always the Monday. A
  -- `final` re-capture passes because by then the week is in the past.
  if current_date <= v_week.week_of + 6 then
    raise exception
      'results can''t be entered until after the week ends — its box office is set on %, the Monday after',
      to_char(v_week.week_of + 7, 'FMDay, FMMon FMDD');
  end if;
  if p_box_office_m is null or p_box_office_m < 0 then
    raise exception 'box office must be 0 or more, in $ millions (e.g. 81.4)';
  end if;
  if p_tomatometer is null or p_tomatometer < 0 or p_tomatometer > 100 then
    raise exception 'Tomatometer must be a whole number between 0 and 100';
  end if;

  if p_suggested is not null then
    if jsonb_typeof(p_suggested) <> 'object' then
      raise exception 'p_suggested must be a json object';
    end if;
    for v_key, v_node in select * from jsonb_each(p_suggested) loop
      if v_key not in ('tomatometer', 'box_office_m') then
        raise exception 'unknown suggestion key "%" (expected tomatometer or box_office_m)', v_key;
      end if;
      if jsonb_typeof(v_node) <> 'object' then
        raise exception 'suggestion "%" must be an object with value and source', v_key;
      end if;
      if nullif(trim(coalesce(v_node ->> 'source', '')), '') is null then
        raise exception 'suggestion "%" must name its source', v_key;
      end if;
      if not (v_node ? 'value') then
        raise exception 'suggestion "%" must carry a value (use null for "asked, nothing to report")', v_key;
      end if;
      if v_node ->> 'value' is not null and jsonb_typeof(v_node -> 'value') <> 'number' then
        raise exception 'suggestion "%" value must be a number or null', v_key;
      end if;

      v_provenance := v_provenance || jsonb_build_object(v_key, jsonb_build_object(
        'suggested', v_node -> 'value',
        'entered',   case v_key when 'tomatometer' then to_jsonb(p_tomatometer)
                                else to_jsonb(p_box_office_m) end,
        'source',    v_node ->> 'source',
        'accepted',  case
                       when v_node ->> 'value' is null then null
                       when v_key = 'tomatometer'
                         then (v_node ->> 'value')::numeric = p_tomatometer
                       else (v_node ->> 'value')::numeric = p_box_office_m
                     end));
    end loop;
  end if;

  update films set
    box_office_m = p_box_office_m,
    tomatometer  = p_tomatometer,
    captured_at  = now()
  where id = p_film_id;

  select score into v_score from films where id = p_film_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'capture_film',
          jsonb_build_object(
            'film_id', p_film_id, 'title', v_film.title,
            'box_office_m', p_box_office_m, 'tomatometer', p_tomatometer,
            'score', v_score,
            'recapture', v_film.captured_at is not null)
          || case when v_film.captured_at is not null then
               jsonb_build_object('old', jsonb_build_object(
                 'box_office_m', v_film.box_office_m,
                 'tomatometer', v_film.tomatometer,
                 'score', v_film.score))
             else '{}'::jsonb end
          || case when v_provenance <> '{}'::jsonb then
               jsonb_build_object('provenance', v_provenance)
             else '{}'::jsonb end);

  -- ADR-060: the disclosure row. Only on a re-capture — a first capture is
  -- ordinary lifecycle, not a correction of anything.
  if v_film.captured_at is not null then
    insert into audit_log (season_id, actor, action, detail)
    values (v_week.season_id, auth.uid(), 'override_film_score',
            jsonb_build_object(
              'week_id', v_week.id, 'week_number', v_week.number,
              'film_id', p_film_id, 'title', v_film.title,
              'old', jsonb_build_object('box_office_m', v_film.box_office_m,
                                        'tomatometer', v_film.tomatometer,
                                        'score', v_film.score),
              'new', jsonb_build_object('box_office_m', p_box_office_m,
                                        'tomatometer', p_tomatometer,
                                        'score', v_score)));
  end if;
end;
$function$;

create or replace function public.finalize_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_week    weeks%rowtype;
  v_missing integer;
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
  -- the same gate capture_film applies, keyed on week_of.
  if current_date <= v_week.week_of + 6 then
    raise exception
      'this week can''t be finished until it ends — results open %, the Monday after',
      to_char(v_week.week_of + 7, 'FMDay, FMMon FMDD');
  end if;

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

  update weeks set status = 'final' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'finalize_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number));
end;
$function$;
