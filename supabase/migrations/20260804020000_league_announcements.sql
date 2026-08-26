-- ============================================================================
-- League announcements — what the commissioner CHOSE to say.
--
-- League Home now runs announcements and the activity feed as a pair, side by
-- side: what a person decided to tell the league, and what the league actually
-- did. They are deliberately NOT the same mechanism. Activity is derived from
-- audit_log — nobody writes it, it is the record of events — while an
-- announcement is authored, editable in the sense that it can be taken down,
-- and carries prose rather than a typed summary.
--
-- BECAUSE they sit beside each other, posting an announcement writes NO row to
-- the activity whitelist. If it did, every announcement would appear twice on
-- one screen: once as itself on the left, once as "X posted an announcement"
-- on the right. The audit row is still written (below) for the audit trail's
-- sake; it is simply not a whitelisted activity action, and
-- get_league_activity's default-invisible rule means that takes no extra work.
--
-- Writes go through RPCs only, per ADR-004. The table gets a SELECT policy and
-- nothing else, so a compromised anon key cannot post as a commissioner.
-- ============================================================================

create table if not exists public.league_announcements (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  -- The author is kept even after a commissioner is demoted: the announcement
  -- is a record of who said what at the time, and re-attributing it to whoever
  -- happens to run the league now would be a lie. Restricted rather than
  -- cascading for the same reason — deleting a profile must not silently
  -- rewrite league history.
  author_id  uuid not null references public.profiles(id) on delete restrict,
  body       text not null,
  created_at timestamptz not null default now()
);

-- The one read pattern: this league's announcements, newest first.
create index if not exists league_announcements_league_idx
  on public.league_announcements (league_id, created_at desc);

comment on table public.league_announcements is
  'Commissioner-authored notes shown on League Home. Distinct from the '
  'activity feed, which is derived from audit_log and authored by nobody. '
  'Writes are RPC-only; the SELECT policy is the whole of the RLS surface.';

alter table public.league_announcements enable row level security;

-- Every member of the league reads them; nobody else does. There is no
-- per-announcement visibility — an announcement is addressed to the league.
drop policy if exists league_announcements_select on public.league_announcements;
create policy league_announcements_select on public.league_announcements
  for select to authenticated
  using (public.is_league_member(league_id));

-- No insert/update/delete policy at all. The RPCs below are the only writers.

-- ---------------------------------------------------------------------------
-- Post one.
-- ---------------------------------------------------------------------------
create or replace function public.post_league_announcement(
  p_league_id uuid,
  p_body      text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_id   uuid;
begin
  -- ADR-060: any commissioner of the league, not a designated one. A league
  -- may have several and they are equals.
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can post an announcement';
  end if;
  if v_body is null then
    raise exception 'an announcement needs something to say';
  end if;
  -- Bounded so a paste accident cannot become the page. 2000 characters is
  -- several paragraphs — far past anything this surface is for — while still
  -- being a limit rather than a suggestion.
  if length(v_body) > 2000 then
    raise exception 'an announcement is limited to 2000 characters';
  end if;

  insert into league_announcements (league_id, author_id, body)
  values (p_league_id, auth.uid(), v_body)
  returning id into v_id;

  -- Audited but NOT whitelisted into get_league_activity — see the header.
  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'post_league_announcement',
          jsonb_build_object('league_id', p_league_id, 'announcement_id', v_id));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Take one down.
--
-- Deleted rather than flagged: there is no state between "the league can read
-- this" and "gone" worth modelling, which is the same call league_invites made
-- for revocation. Any commissioner may remove any announcement, including one
-- another commissioner wrote — co-commissioners are equals under ADR-060, and
-- a league whose only remaining commissioner cannot delete their predecessor's
-- typo would be a worse outcome than the one this allows.
-- ---------------------------------------------------------------------------
create or replace function public.delete_league_announcement(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_league uuid;
begin
  select league_id into v_league from league_announcements where id = p_id;
  if v_league is null then
    raise exception 'no such announcement';
  end if;
  if not is_league_commissioner(v_league) then
    raise exception 'only a league commissioner can remove an announcement';
  end if;

  delete from league_announcements where id = p_id;

  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'delete_league_announcement',
          jsonb_build_object('league_id', v_league, 'announcement_id', p_id));
end;
$$;

revoke all on function public.post_league_announcement(uuid, text) from public, anon;
revoke all on function public.delete_league_announcement(uuid)     from public, anon;
grant execute on function public.post_league_announcement(uuid, text) to authenticated;
grant execute on function public.delete_league_announcement(uuid)     to authenticated;
