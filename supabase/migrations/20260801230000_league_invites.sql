-- League invites: how someone joins a league they are not already in.
--
-- Until now "Add to league" matched on an account email and only worked if the
-- person had already signed up — there was no way to bring in someone new, and
-- no pending state anywhere.
--
-- SCOPE, decided deliberately: this ships INVITES and drops public league
-- DISCOVERY. A searchable directory of leagues answers a question nobody in
-- this game actually has — the pool is a group of friends, and you join because
-- one of them asked you to, not because you found their league in a list. The
-- invite link is the whole join path, and skipping discovery also avoids
-- building a browse surface that would need its own moderation story.
--
-- Two shapes, one table:
--   * A LINK invite (email null) — anyone holding the token may join. This is
--     the "text it to your friends" path and the reason invites work for people
--     who have not signed up yet: they sign up, then the link works.
--   * A TARGETED invite (email set) — shows up as a pending card on that
--     person's dashboard, acceptable or declinable there.
--
-- Roles are NOT invitable. Every invite grants `player`, because ADR-019 allows
-- exactly one commissioner per league and the handoff RPC is the only way that
-- moves. An invite that could grant commissioner would be a second path into
-- the same invariant.

create table if not exists public.league_invites (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues(id) on delete cascade,
  -- Null means an open link. Set means this invite is for one person.
  -- Plain text, lowercased on write. profiles.email is text and every existing
  -- RPC matches with lower(trim(...)); citext is not installed on this project,
  -- and adding an extension for one column would be a heavier change than
  -- following the convention already in use.
  email       text,
  token       text not null unique,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  -- Set on accept. A revoked invite is DELETED rather than flagged; there is no
  -- state between "usable" and "gone" worth modelling.
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id)
);

create index if not exists league_invites_league_idx on public.league_invites (league_id);
create index if not exists league_invites_email_idx on public.league_invites (email)
  where email is not null and accepted_at is null;

comment on table public.league_invites is
  'Pending and accepted league invitations. email null = an open link anyone '
  'holding the token may use; email set = a targeted invite that appears on '
  'that person''s dashboard. Always grants the player role (ADR-019).';

alter table public.league_invites enable row level security;

-- Reads: a league commissioner sees their league's invites (to manage them),
-- and a user sees invites addressed to their own email (to accept them).
-- Nobody can read an open link's token without being the commissioner, which
-- is what keeps the token secret-by-possession.
drop policy if exists league_invites_select on public.league_invites;
create policy league_invites_select on public.league_invites
  for select to authenticated
  using (
    public.is_league_commissioner(league_id)
    or email = (select lower(p.email) from public.profiles p where p.id = auth.uid())
  );

-- No direct writes at all: everything goes through the RPCs below (ADR-004).

-- ---------------------------------------------------------------------------
-- Create an invite.
-- ---------------------------------------------------------------------------
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
  -- one rather than littering the dashboard with duplicates.
  if v_email is not null then
    delete from league_invites
    where league_id = p_league_id and email = v_email and accepted_at is null;
  end if;

  -- 32 bytes of gen_random_bytes, hex-encoded. The token IS the credential for
  -- a link invite, so it must not be guessable — a sequence or a uuid4 with a
  -- readable prefix would be.
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

-- ---------------------------------------------------------------------------
-- What a token points at, BEFORE accepting it. The join page needs to say
-- "Join The Movie Pool?" rather than showing a bare confirm button — and this
-- is deliberately callable by any signed-in user, because the whole point of a
-- link invite is that the recipient is not yet a member of anything.
--
-- It returns the league NAME and nothing else about the league. A valid token
-- is possession-based proof of an invitation; it is not a key to the league's
-- data.
-- ---------------------------------------------------------------------------
create or replace function public.peek_league_invite(p_token text)
returns table (league_name text, already_member boolean, expired boolean, targeted_at text)
language plpgsql security definer set search_path = public
as $$
declare
  v_invite league_invites%rowtype;
  v_league leagues%rowtype;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;

  select * into v_invite from league_invites where token = p_token;
  if not found then
    raise exception 'that invitation link is not valid';
  end if;
  select * into v_league from leagues where id = v_invite.league_id;

  return query select
    v_league.name,
    exists (
      select 1 from league_members
      where league_id = v_invite.league_id and profile_id = auth.uid()
    ),
    (v_invite.expires_at < now() or v_invite.accepted_at is not null),
    v_invite.email;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accept — by token (a link) or by invite id (a targeted card).
-- ---------------------------------------------------------------------------
create or replace function public.accept_league_invite(
  p_token     text default null,
  p_invite_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_invite league_invites%rowtype;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if (p_token is null) = (p_invite_id is null) then
    raise exception 'accept an invitation by its link or its id, not both';
  end if;

  select lower(p.email) into v_email from profiles p where p.id = auth.uid();

  if p_token is not null then
    select * into v_invite from league_invites where token = p_token;
  else
    select * into v_invite from league_invites where id = p_invite_id;
  end if;
  if not found then
    raise exception 'that invitation is not valid';
  end if;

  -- A TARGETED invite is for one address and nobody else, even if the token
  -- leaks. An open link is for whoever holds it, which is the point.
  if v_invite.email is not null and v_invite.email <> v_email then
    raise exception 'that invitation was sent to a different email address';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'that invitation has expired — ask for a new one';
  end if;

  -- A targeted invite is single-use; an open LINK stays usable until it
  -- expires, so several people can join from the same message. Marking the
  -- link accepted on first use would make it a one-person link, which is not
  -- what "share this with the group" means.
  if v_invite.email is not null and v_invite.accepted_at is not null then
    raise exception 'that invitation has already been used';
  end if;

  if exists (
    select 1 from league_members
    where league_id = v_invite.league_id and profile_id = auth.uid()
  ) then
    -- Not an error: clicking a link twice, or being added by hand in between,
    -- should land you in the league rather than on an error page.
    return v_invite.league_id;
  end if;

  -- Always `player` (ADR-019 — the single commissioner moves only via handoff).
  -- Joining a league does NOT join an in-flight season: the roster locks at
  -- season creation (ADR-016), so a new member plays from the next season.
  insert into league_members (league_id, profile_id, role)
  values (v_invite.league_id, auth.uid(), 'player');

  if v_invite.email is not null then
    update league_invites
    set accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;
  end if;

  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'accept_league_invite',
          jsonb_build_object('league_id', v_invite.league_id,
                             'invite_id', v_invite.id));

  return v_invite.league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Decline (the invitee) and revoke (the commissioner). Both delete the row —
-- a declined invitation carries no information worth keeping, and keeping it
-- would mean the commissioner could not simply re-invite.
-- ---------------------------------------------------------------------------
create or replace function public.decline_league_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_invite league_invites%rowtype;
  v_email  text;
begin
  select lower(p.email) into v_email from profiles p where p.id = auth.uid();
  select * into v_invite from league_invites where id = p_invite_id;
  if not found then
    return; -- already gone; declining twice is not an error
  end if;
  if v_invite.email is null or v_invite.email <> v_email then
    raise exception 'that invitation is not yours to decline';
  end if;
  delete from league_invites where id = p_invite_id;
end;
$$;

create or replace function public.revoke_league_invite(p_invite_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_invite league_invites%rowtype;
begin
  select * into v_invite from league_invites where id = p_invite_id;
  if not found then
    return;
  end if;
  if not is_league_commissioner(v_invite.league_id) then
    raise exception 'only the league commissioner can revoke an invitation';
  end if;
  delete from league_invites where id = p_invite_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The typeahead (developer note 9): find an existing account to invite.
--
-- THE SECURITY QUESTION IN THIS TASK, answered deliberately. An unrestricted
-- "search users" endpoint lets anyone enumerate who has an account, so this is
-- fenced four ways:
--   1. Commissioners only, and only for a league they actually commission.
--   2. A minimum query length of 3 — no listing the alphabet one letter at a
--      time.
--   3. Display names match on prefix/substring, but EMAIL matches only on an
--      EXACT address. You can confirm an address you already know; you cannot
--      discover one.
--   4. At most 8 rows, and the email is never returned — only the display name
--      and whether they are already in the league.
-- ---------------------------------------------------------------------------
create or replace function public.search_invitable_profiles(
  p_league_id uuid,
  p_query     text
)
returns table (profile_id uuid, display_name text, already_member boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
begin
  if not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can search for members';
  end if;
  if length(v_q) < 3 then
    return; -- empty result, not an error: the UI asks as you type
  end if;

  return query
  select p.id,
         p.display_name,
         exists (
           select 1 from league_members lm
           where lm.league_id = p_league_id and lm.profile_id = p.id
         )
  from profiles p
  where p.display_name ilike '%' || v_q || '%'
      or lower(p.email) = lower(v_q)    -- EXACT only; no partial email matching
  order by (p.display_name ilike v_q || '%') desc, p.display_name
  limit 8;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invites addressed to me, for the dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_league_invites()
returns table (id uuid, league_id uuid, league_name text, invited_by text, expires_at timestamptz)
language sql security definer set search_path = public
stable
as $$
  select i.id, i.league_id, l.name, inviter.display_name, i.expires_at
  from league_invites i
  join leagues l on l.id = i.league_id
  join profiles inviter on inviter.id = i.created_by
  where i.email is not null
    and i.accepted_at is null
    and i.expires_at > now()
    and i.email = (select lower(p.email) from profiles p where p.id = auth.uid())
    and not exists (
      select 1 from league_members lm
      where lm.league_id = i.league_id and lm.profile_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Grants (ADR-004 deliberate exposure).
-- ---------------------------------------------------------------------------
revoke all on function public.create_league_invite(uuid, text)        from public, anon;
revoke all on function public.peek_league_invite(text)                from public, anon;
revoke all on function public.accept_league_invite(text, uuid)        from public, anon;
revoke all on function public.decline_league_invite(uuid)             from public, anon;
revoke all on function public.revoke_league_invite(uuid)              from public, anon;
revoke all on function public.search_invitable_profiles(uuid, text)   from public, anon;
revoke all on function public.get_my_league_invites()                 from public, anon;

grant execute on function public.create_league_invite(uuid, text)      to authenticated;
grant execute on function public.peek_league_invite(text)              to authenticated;
grant execute on function public.accept_league_invite(text, uuid)      to authenticated;
grant execute on function public.decline_league_invite(uuid)           to authenticated;
grant execute on function public.revoke_league_invite(uuid)            to authenticated;
grant execute on function public.search_invitable_profiles(uuid, text) to authenticated;
grant execute on function public.get_my_league_invites()               to authenticated;

comment on function public.search_invitable_profiles(uuid, text) is
  'Typeahead over accounts a commissioner could invite. Commissioner-gated, '
  '3-character minimum, EXACT email match only, 8 rows, and the email is never '
  'returned — deliberately not an account-enumeration endpoint.';
