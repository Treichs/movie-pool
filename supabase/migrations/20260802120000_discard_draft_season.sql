-- discard_draft_season — the season setup wizard's escape hatch.
--
-- The wizard creates the season as a DRAFT partway through, because films
-- carry a week_id and so cannot be picked before the season and its weeks
-- exist. ADR-020 permits only one draft-or-active season per league, so an
-- abandoned wizard would otherwise leave a draft sitting in the way of ever
-- starting another one — with no UI able to clear it.
--
-- Deliberately narrow: DRAFT only. A season that has been activated has
-- bids, budgets and standings derived from it, and deleting one is not an
-- undo — it is data loss wearing an undo's clothes. There is still no way to
-- delete an active or completed season through the API, and that is correct.
--
-- The cascade from seasons already removes weeks, films, bids, rule_configs
-- and season_members, so this is a single delete rather than a teardown.

create or replace function public.discard_draft_season(p_season_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_season seasons%rowtype;
begin
  select * into v_season from seasons where id = p_season_id for update;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can discard a season';
  end if;
  if v_season.status <> 'draft' then
    raise exception
      'only a season that has not started can be discarded (status: %)', v_season.status;
  end if;

  -- Logged BEFORE the delete, and audit_log.season_id is ON DELETE SET NULL,
  -- so the row survives the season with its season_id nulled — which is why
  -- league_id is written into detail: it is the only thing left tying the
  -- event to a league afterwards.
  --
  -- NOT whitelisted in get_league_activity, so it does not appear in the
  -- member-facing feed. That is ADR-054's default (an unlisted action is
  -- invisible rather than leaky) and it is the right call here: discarding a
  -- setup wizard nobody else ever saw is not league news. Whitelist it later
  -- if that turns out to be wrong.
  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'discard_draft_season',
          jsonb_build_object('league_id', v_season.league_id,
                             'name', v_season.name));

  delete from seasons where id = p_season_id;
end;
$$;

revoke all on function public.discard_draft_season(uuid) from public, anon;
grant execute on function public.discard_draft_season(uuid) to authenticated;

comment on function public.discard_draft_season(uuid) is
  'Deletes a season that has not started, freeing the league to start another '
  '(ADR-020 allows only one draft-or-active season). Draft only, by design.';
