-- Fixes create_league_invite, which failed at runtime with
-- 'column reference "email" is ambiguous'.
--
-- The function's RETURNS TABLE declares an output column named `email`, and
-- plpgsql puts those names in the same scope as the query's own columns. The
-- DELETE that clears a superseded invite said `where ... and email = v_email`,
-- which could mean either — so Postgres refused rather than guessing.
--
-- Aliasing the table makes every reference explicit. Caught by the spike, not
-- by the push: the migration applied cleanly and only broke when a targeted
-- invite was actually created.

create or replace function public.create_league_invite(
  p_league_id uuid,
  p_email     text default null
)
returns table (id uuid, token text, email text, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  v_token   text;
  v_email   text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_invite  league_invites%rowtype;
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can invite members';
  end if;

  -- Already in? Then this is a no-op the caller should hear about, not a
  -- second membership.
  if v_email is not null and exists (
    select 1 from league_members lm
    join profiles p on p.id = lm.profile_id
    where lm.league_id = p_league_id and lower(p.email) = v_email
  ) then
    raise exception 'that person is already in this league';
  end if;

  -- One live invite per address per league. Re-inviting refreshes the existing
  -- one rather than littering the dashboard with duplicates. `li.` is
  -- load-bearing: unqualified, `email` collides with this function's own
  -- output column of the same name.
  if v_email is not null then
    delete from league_invites li
    where li.league_id = p_league_id
      and li.email = v_email
      and li.accepted_at is null;
  end if;

  -- 32 bytes of gen_random_bytes, hex-encoded. The token IS the credential for
  -- a link invite, so it must not be guessable.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into league_invites (league_id, email, token, created_by)
  values (p_league_id, v_email, v_token, auth.uid())
  returning * into v_invite;

  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'create_league_invite',
          jsonb_build_object('league_id', p_league_id,
                             'targeted', v_email is not null));

  return query select v_invite.id, v_invite.token, v_invite.email, v_invite.expires_at;
end;
$$;

revoke all on function public.create_league_invite(uuid, text) from public, anon;
grant execute on function public.create_league_invite(uuid, text) to authenticated;
