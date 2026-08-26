-- Invite a known account by its PROFILE ID, not by typing its email.
--
-- THE BUG THIS FIXES. The invite typeahead finds people by display name, and
-- clicking a result filled the text box with that NAME. The box is submitted as
-- `email`, so "Send invite" then failed the address check with "Enter a full
-- email address" — the suggestion list found the right person and handed the
-- form something it could not use. Picking someone the app already knows was
-- the one path guaranteed to fail.
--
-- WHY NOT JUST PUT THEIR EMAIL IN THE BOX. Because search_invitable_profiles
-- deliberately never returns one. Its fourth fence reads "at most 8 rows, and
-- the email is never returned — only the display name and whether they are
-- already in the league", which is what stops a commissioner typing three
-- letters and harvesting the address of every account on the site. Sending the
-- address to the browser to put it in an input would dismantle that fence for a
-- convenience the profile id already provides.
--
-- So the id crosses instead, and the EMAIL IS RESOLVED HERE. The browser learns
-- nothing it did not already have; the invite row is byte-identical to the one
-- typing the address by hand produces, so acceptance, expiry and the one-live-
-- invite-per-address rule all behave exactly as before.
--
-- Body taken from pg_get_functiondef, per the lesson 20260804060000 was written
-- for: only the resolution block at the top is new.

drop function if exists public.create_league_invite(uuid, text);

create or replace function public.create_league_invite(
  p_league_id  uuid,
  p_email      text default null,
  p_profile_id uuid default null
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

  -- A picked suggestion. The id names an account that already exists, so its
  -- address is looked up rather than typed, and it WINS over any text left in
  -- the box — the UI clears that on selection, and if the two ever disagree the
  -- explicit choice is the one the commissioner made.
  if p_profile_id is not null then
    select lower(p.email) into v_email from profiles p where p.id = p_profile_id;
    if v_email is null then
      raise exception 'that account no longer exists';
    end if;
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

revoke all on function public.create_league_invite(uuid, text, uuid) from public, anon;
grant execute on function public.create_league_invite(uuid, text, uuid) to authenticated;
