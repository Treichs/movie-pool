-- ---------------------------------------------------------------------------
-- commit_week_results — the whole slate scored in one act. (ADR-097, ADR-100.)
--
-- THE PROBLEM THIS SOLVES.  films.score is a GENERATED column and v_standings
-- carries no week-status filter, so capturing film by film means points trickle
-- into the standings as the commissioner types: a player refreshing on Monday
-- morning watches their total climb one film at a time.  finalize_week, which
-- looks like the moment scoring completes, is a status flag no player-facing
-- surface waits on.  There was no single moment for the Monday ceremony to fire
-- on because there was no single moment.
--
-- THE SHAPE.  One RPC, one transaction: validate that the payload covers the
-- week exactly, capture every film, and finish the week.  Committing the slate
-- IS finalizing it — a separate press would be a formality, and a forgotten one
-- leaves a captured-but-not-final week that ADR-069 later refuses to complete a
-- season around, weeks after anyone remembers which week it was.
--
-- ALL OR NOTHING.  It refuses unless every active, eligible film in the week
-- carries both numbers — the same set finalize_week already demands, so the two
-- agree on "done" without a second definition.  A film whose box office genuinely
-- cannot be found is REMOVED (remove_film: reason mandatory, disclosed to
-- players, refunds by exclusion) rather than excused.  A film nobody can score
-- should not score for anyone, which is what removal already says; no new verb
-- is needed.
--
-- IT DELEGATES RATHER THAN RESTATES.  Every gate here is enforced by calling
-- capture_film and finalize_week, not by copying their checks — commissioner,
-- week status, the ADR-080 "not before the Monday after" date gate, the numeric
-- ranges, and the suggestion provenance all keep exactly one implementation.
-- A plpgsql function body is already atomic, so the loop plus the finalize is
-- the single transaction the ceremony needs.
--
-- capture_film survives unchanged as the per-film CORRECTION path.  It is
-- audit-logged and disclosed to players (ADR-060), which is the honest place
-- for a fix after finality — and finality now arrives earlier and cannot be
-- undone, so the UI's confirm copy has to say so.
-- ---------------------------------------------------------------------------
create or replace function public.commit_week_results(
  p_week_id uuid,
  p_results jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week      weeks%rowtype;
  v_expected  integer;
  v_supplied  integer;
  v_bad       text;
  v_row       jsonb;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  -- Checked here as well as in the delegates so an outsider gets "you may not"
  -- rather than a coverage complaint about a week they cannot see.
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can record results';
  end if;

  if p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception 'p_results must be a json array of {film_id, box_office_m, tomatometer}';
  end if;

  -- Materialise the payload once so it can be validated and then replayed.
  create temp table _commit on commit drop as
  select
    (r ->> 'film_id')::uuid        as film_id,
    (r ->> 'box_office_m')::numeric as box_office_m,
    (r ->> 'tomatometer')::integer  as tomatometer
  from jsonb_array_elements(p_results) as r;

  select count(*) into v_supplied from _commit;
  if exists (select 1 from _commit where film_id is null) then
    raise exception 'every entry needs a film_id';
  end if;
  if v_supplied <> (select count(distinct film_id) from _commit) then
    raise exception 'the same film appears more than once';
  end if;

  -- Nothing from another week, and nothing already removed from the roster.
  select string_agg(c.film_id::text, ', ') into v_bad
  from _commit c
  left join films f on f.id = c.film_id and f.week_id = p_week_id and f.status = 'active'
  where f.id is null;
  if v_bad is not null then
    raise exception 'these are not active films of this week: %', v_bad;
  end if;

  -- Coverage: exactly the set finalize_week will demand.
  select count(*) into v_expected
  from films f
  where f.week_id = p_week_id and f.status = 'active' and f.eligible;

  if v_supplied < v_expected then
    raise exception
      'the whole slate is scored at once — % of % film(s) still need an opening box office and a Tomatometer. Remove a film if it cannot be scored.',
      v_expected - v_supplied, v_expected;
  end if;

  -- Capture each film through the one implementation that knows how.
  for v_row in
    select jsonb_build_object('id', film_id, 'bo', box_office_m, 'rt', tomatometer)
    from _commit
  loop
    perform public.capture_film(
      (v_row ->> 'id')::uuid,
      (v_row ->> 'bo')::numeric,
      (v_row ->> 'rt')::integer
    );
  end loop;

  -- And finish the week through the one implementation that knows how.
  perform public.finalize_week(p_week_id);

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'commit_week_results',
          jsonb_build_object('week_id', p_week_id,
                             'week_number', v_week.number,
                             'films', v_supplied));
end;
$$;

comment on function public.commit_week_results(uuid, jsonb) is
  'Score a whole week in one act (ADR-097, ADR-100): capture every active '
  'eligible film and finalize the week, in one transaction, so points land '
  'together rather than trickling in film by film. Delegates every gate to '
  'capture_film and finalize_week. capture_film remains the per-film '
  'correction path.';

revoke all on function public.commit_week_results(uuid, jsonb) from public, anon;
grant execute on function public.commit_week_results(uuid, jsonb) to authenticated;
