-- ADR-084 — an announcement is a TITLE plus an optional BODY.
--
-- It was a single `body`, which was fine while the whole thing rendered inline
-- on League Home. It is not fine now that announcements are a horizontal rail
-- of cards linking to a page: a card needs a short label, and a page needs
-- something to show that the card did not.
--
-- WHY THIS NEEDS NO DEPLOYMENT WINDOW. `title` is NOT NULL, but it is DERIVED
-- when the caller does not supply one — so the currently-deployed code, which
-- calls post_league_announcement(p_league_id, p_body), goes on working against
-- the new function untouched and every row it writes still gets a title. The
-- old 2-argument function is dropped rather than left beside the new one:
-- leaving both would give PostgREST two candidates for {p_league_id, p_body}
-- and neither would resolve, which is the ambiguity that bit create_season on
-- 2026-08-05. Dropping it is safe precisely BECAUSE the replacement keeps the
-- first two parameters in the same order under the same names.

-- ---------------------------------------------------------------------------
-- 1. The derivation rule, as a function so the backfill below and the RPC
--    cannot drift apart.
--
--    First line becomes the title. If that is the whole announcement and it is
--    short enough to read on a card, the body is emptied rather than repeated —
--    a detail page showing "No slate this weekend" as its heading AND again as
--    its only paragraph reads as a bug. Otherwise the title is a truncated
--    first line and the body keeps the original text in full, so nothing a
--    commissioner wrote is ever lost to the split.
-- ---------------------------------------------------------------------------
create or replace function public.announcement_title_from_body(p_body text)
returns text
language sql
immutable strict parallel safe
as $$
  select case
    when length(first_line) <= 120 then first_line
    else left(first_line, 119) || '…'
  end
  from (select trim(split_part(coalesce(p_body, ''), E'\n', 1)) as first_line) s;
$$;

comment on function public.announcement_title_from_body(text) is
  'ADR-084: the title an announcement gets when its author did not write one — '
  'its first line, truncated to 120 characters.';

-- ---------------------------------------------------------------------------
-- 2. The columns.
-- ---------------------------------------------------------------------------
alter table public.league_announcements add column if not exists title text;

-- BEFORE the backfill, not after: the backfill empties the body of a
-- single-line announcement, which the original NOT NULL would refuse.
alter table public.league_announcements alter column body drop not null;

update public.league_announcements
set
  title = public.announcement_title_from_body(body),
  body  = case
            -- Single short line: the title says everything, so the body goes.
            when position(E'\n' in trim(body)) = 0 and length(trim(body)) <= 120
              then null
            -- Anything longer keeps its full original text under the title.
            else body
          end
where title is null;

alter table public.league_announcements alter column title set not null;

alter table public.league_announcements
  drop constraint if exists league_announcements_title_len;
alter table public.league_announcements
  add constraint league_announcements_title_len
  check (length(title) between 1 and 120);

comment on column public.league_announcements.title is
  'ADR-084: the one-line label shown on the League Home rail. Required; '
  'derived from the body''s first line when the author does not write one.';
comment on column public.league_announcements.body is
  'ADR-084: the long form, read on the announcement''s own page. NULL when the '
  'title said everything there was to say.';

-- ---------------------------------------------------------------------------
-- 3. post_league_announcement — the backward-compatible superset.
--
--    p_title is THIRD, not second, purely so the existing two-argument call
--    still resolves. It reads oddly next to the new composer, which collects a
--    title first; that is the price of not breaking a deployed caller, and it
--    is the same shape ADR-078's create_season settled on.
-- ---------------------------------------------------------------------------
drop function if exists public.post_league_announcement(uuid, text);

create or replace function public.post_league_announcement(
  p_league_id uuid,
  p_body      text,
  p_title     text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_body  text := nullif(trim(coalesce(p_body, '')), '');
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_id    uuid;
begin
  -- ADR-060: any commissioner of the league, not a designated one. A league
  -- may have several and they are equals.
  if not is_league_commissioner(p_league_id) then
    raise exception 'only a league commissioner can post an announcement';
  end if;

  -- One of the two has to carry the message. A title-only announcement is
  -- ordinary; a body-only one is what every pre-ADR-084 caller sends.
  if v_title is null and v_body is null then
    raise exception 'an announcement needs something to say';
  end if;

  if v_title is null then
    v_title := announcement_title_from_body(v_body);
    -- Same rule as the backfill: do not repeat a short single line twice.
    if position(E'\n' in v_body) = 0 and length(v_body) <= 120 then
      v_body := null;
    end if;
  elsif length(v_title) > 120 then
    raise exception 'a title is limited to 120 characters';
  end if;

  -- Still bounded so a paste accident cannot become the page, but raised from
  -- 2000 to 8000: the old limit was sized for a two-row textarea on League
  -- Home, and ADR-084 exists precisely so a rule change can run to several
  -- paragraphs on a page of its own.
  if v_body is not null and length(v_body) > 8000 then
    raise exception 'an announcement is limited to 8000 characters';
  end if;

  insert into league_announcements (league_id, author_id, title, body)
  values (p_league_id, auth.uid(), v_title, v_body)
  returning id into v_id;

  -- Audited but NOT whitelisted into get_league_activity — see the header of
  -- the migration that created this table.
  insert into audit_log (season_id, actor, action, detail)
  values (null, auth.uid(), 'post_league_announcement',
          jsonb_build_object('league_id', p_league_id, 'announcement_id', v_id));

  return v_id;
end;
$$;

comment on function public.post_league_announcement(uuid, text, text) is
  'ADR-084: post an announcement. p_title is optional and derived from the '
  'body when absent, which is what lets the pre-ADR-084 two-argument call keep '
  'working against this function unchanged.';

revoke all on function public.post_league_announcement(uuid, text, text) from public, anon;
grant execute on function public.post_league_announcement(uuid, text, text) to authenticated;

revoke all on function public.announcement_title_from_body(text) from public, anon;
grant execute on function public.announcement_title_from_body(text) to authenticated;
