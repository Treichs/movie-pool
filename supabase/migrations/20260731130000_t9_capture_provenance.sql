-- T9 — capture provenance: record what a source SUGGESTED alongside what the
-- commissioner actually entered.
--
-- WHY THIS EXISTS AT ALL, AND WHY NOW. The suggestion-plus-confirmation pattern
-- is the correct END STATE, not a stopgap waiting for a better API. Rulebook §6
-- fixes the capture moment (Monday morning after opening weekend), and
-- films.tomatometer feeds a generated `score` column that flows to v_standings
-- and real-money settlement. An API read at an arbitrary page-load is a
-- DIFFERENT MEASUREMENT of a moving number, not a cheaper version of the same
-- one, and writing it automatically would make an unattributed money event.
-- So a human always submits the number — and this migration records what they
-- were shown when they did.
--
-- WHY A SINGLE jsonb PARAMETER RATHER THAN TWO OR FOUR SCALARS. Postgres cannot
-- add a parameter with CREATE OR REPLACE — the signature is part of the
-- identity, so a new parameter means DROP and recreate. On a function that
-- writes scoring inputs that is a real cost, and it is one this design pays
-- exactly ONCE: `p_suggested` is an open map, so when T10 finds a box-office
-- source (or a third value appears) it plugs in as another key with no further
-- surgery on the money path.
--
--   p_suggested => {
--     "tomatometer":  { "value": 89,    "source": "omdb" },
--     "box_office_m": { "value": 120.5, "source": "…"   }
--   }
--
-- A key with "value": null is meaningful and different from an absent key: it
-- records that the source WAS consulted and had nothing to say, which is the
-- honest answer for a film with no Rotten Tomatoes score yet.
--
-- THE PROPERTY THAT MATTERS: p_suggested is read for the audit record and
-- NOTHING ELSE. It cannot reach films.box_office_m or films.tomatometer by any
-- path in this function. The spike asserts that by capturing a value that
-- disagrees with its suggestion and checking which one was stored.

drop function if exists public.capture_film(uuid, numeric, integer, integer);

create or replace function public.capture_film(
  p_film_id      uuid,
  p_box_office_m numeric,
  p_tomatometer  integer,
  p_screen_count integer default null,
  p_suggested    jsonb   default null
)
returns void
language plpgsql security definer set search_path = public
as $$
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
  if v_week.status not in ('resolved', 'scored') then
    raise exception 'resolve winners before capturing results (status: %)', v_week.status;
  end if;
  -- Removed films are never evaluated (rulebook §3); the remove path is phase 7.
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the roster and is not scored';
  end if;
  if p_box_office_m is null or p_box_office_m < 0 then
    raise exception 'box office must be 0 or more, in $ millions (e.g. 81.4)';
  end if;
  if p_tomatometer is null or p_tomatometer < 0 or p_tomatometer > 100 then
    raise exception 'Tomatometer must be a whole number between 0 and 100';
  end if;

  -- ---- provenance -------------------------------------------------------
  -- Validated strictly. A malformed suggestion is a CALLER bug (the server
  -- action builds this, never the browser), and silently dropping it would
  -- lose the provenance record on a money event without anyone noticing.
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
        -- null (not false) when there was nothing to accept or reject.
        'accepted',  case
                       when v_node ->> 'value' is null then null
                       when v_key = 'tomatometer'
                         then (v_node ->> 'value')::numeric = p_tomatometer
                       else (v_node ->> 'value')::numeric = p_box_office_m
                     end));
    end loop;
  end if;

  -- p_suggested is deliberately absent from this statement. The stored numbers
  -- are the ones the human submitted, full stop.
  update films set
    box_office_m = p_box_office_m,
    tomatometer  = p_tomatometer,
    screen_count = coalesce(p_screen_count, screen_count),
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

  -- Once every active ELIGIBLE film has its numbers the week is scored.
  -- Ineligible films score for no one (ADR-011), so they don't hold this up.
  if v_week.status = 'resolved' and not exists (
    select 1 from films f
    where f.week_id = v_week.id
      and f.status = 'active'
      and f.eligible
      and f.captured_at is null
  ) then
    update weeks set status = 'scored' where id = v_week.id;
    insert into audit_log (season_id, actor, action, detail)
    values (v_week.season_id, auth.uid(), 'week_scored',
            jsonb_build_object('week_id', v_week.id, 'week_number', v_week.number));
  end if;
end;
$$;

comment on function public.capture_film(uuid, numeric, integer, integer, jsonb) is
  'Records the Monday-morning numbers (rulebook §6.1). p_suggested carries what an API offered and is written ONLY to audit_log — it can never reach a scoring column (T9).';

-- Re-grant by the FULL new signature. The old four-argument function was
-- dropped above, so its grants went with it.
revoke all on function public.capture_film(uuid, numeric, integer, integer, jsonb) from public, anon;
grant execute on function public.capture_film(uuid, numeric, integer, integer, jsonb) to authenticated;
