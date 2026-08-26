-- ---------------------------------------------------------------------------
-- create_league stops writing the counter ADR-099 dropped.
--
-- Found the way these are always found: the ADR said season_start_number "has
-- no writer", meaning no caller could ever SET it — and that was true. What it
-- still had was an INSERT: create_league wrote the constant 1 into it on every
-- league. Dropping the column in 20260817000000 therefore broke league
-- creation outright ('column "season_start_number" of relation "leagues" does
-- not exist'), caught by the contract spike one command later.
--
-- Otherwise identical to the 20260805050000 definition — same signature, same
-- guards, same audit line. Only the column list changes.
-- ---------------------------------------------------------------------------
create or replace function public.create_league(
  p_name         text,
  p_league_type  text     default 'cash',
  p_avatar_pair  smallint default null,
  p_avatar_glyph text     default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_league_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'league needs a name';
  end if;
  if coalesce(p_league_type, 'cash') not in ('cash', 'practice') then
    raise exception 'league type must be cash or practice';
  end if;

  insert into leagues (name, created_by, avatar_pair, avatar_glyph)
  values (trim(p_name), auth.uid(), p_avatar_pair,
          nullif(trim(coalesce(p_avatar_glyph, '')), ''))
  returning id into v_league_id;

  insert into league_members (league_id, profile_id, role)
  values (v_league_id, auth.uid(), 'commissioner');

  insert into league_settings (league_id, league_type)
  values (v_league_id, coalesce(p_league_type, 'cash'));

  insert into audit_log (actor, action, detail)
  values (auth.uid(), 'create_league',
          jsonb_build_object('league_id', v_league_id, 'name', trim(p_name),
                             'league_type', coalesce(p_league_type, 'cash')));

  return v_league_id;
end;
$$;

grant execute on function public.create_league(text, text, smallint, text) to authenticated;
