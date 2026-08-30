-- EDITING AN ANNOUNCEMENT.
--
-- The table has shipped since 20260804020000 with exactly two functions —
-- `post_league_announcement` and `delete_league_announcement` — so the only way
-- to fix a typo in a post the whole league can see was to delete it and write
-- it again, which loses its place in the list and its timestamp. Board 4.7
-- draws an Edit button beside Delete; it had nothing behind it until now.
--
-- ── IT IS ANY COMMISSIONER, NOT THE AUTHOR ────────────────────────────────
-- Matching `delete_league_announcement`, and for ADR-060's reason: a league may
-- have several commissioners and they are equals. A rule where only the author
-- may fix their own typo would also mean a departed commissioner's mistake is
-- permanent.
--
-- ── THE VALIDATION IS `post_league_announcement`'s, DELIBERATELY VERBATIM ──
-- Same limits (120 / 8000), same "one of the two has to carry the message",
-- same ADR-084 derivation: a title left blank is derived from the body, and a
-- short single-line body is promoted to the title rather than repeated twice.
-- An edit that accepted what a post refuses would let a row exist in a shape
-- the insert path cannot produce.
--
-- `created_at` is NOT touched. An edited announcement keeps its place in the
-- list and its "posted on" date, because it is the same announcement — the
-- audit row below is where the fact that it changed lives.

create or replace function public.update_league_announcement(
  p_id    uuid,
  p_body  text,
  p_title text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_league uuid;
  v_body   text := nullif(trim(coalesce(p_body, '')), '');
  v_title  text := nullif(trim(coalesce(p_title, '')), '');
  v_before jsonb;
begin
  select league_id, jsonb_build_object('title', title, 'body', body)
    into v_league, v_before
  from league_announcements
  where id = p_id
  for update;

  if v_league is null then
    raise exception 'no such announcement';
  end if;
  if not is_league_commissioner(v_league) then
    raise exception 'only a league commissioner can edit an announcement';
  end if;

  if v_title is null and v_body is null then
    raise exception 'an announcement needs something to say';
  end if;

  if v_title is null then
    v_title := announcement_title_from_body(v_body);
    if position(E'\n' in v_body) = 0 and length(v_body) <= 120 then
      v_body := null;
    end if;
  elsif length(v_title) > 120 then
    raise exception 'a title is limited to 120 characters';
  end if;

  if v_body is not null and length(v_body) > 8000 then
    raise exception 'an announcement is limited to 8000 characters';
  end if;

  update league_announcements
  set title = v_title,
      body  = v_body
  where id = p_id;

  -- The BEFORE values ride along: an edit to something the whole league has
  -- already read is exactly the change a commissioner may later be asked about.
  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'update_league_announcement',
          jsonb_build_object('league_id', v_league,
                             'announcement_id', p_id,
                             'before', v_before));
end;
$$;

comment on function public.update_league_announcement(uuid, text, text) is
  'Edit an announcement in place. Any commissioner of its league, the same as '
  'delete. Validation and ADR-084 title derivation are post_league_announcement''s, '
  'so an edit cannot produce a row the insert path could not. created_at is '
  'untouched; the audit row carries the previous title and body.';

revoke all on function public.update_league_announcement(uuid, text, text) from public, anon;
grant execute on function public.update_league_announcement(uuid, text, text) to authenticated;
