-- WHICH OF THE FOUR EMAILS YOU WANT.
--
-- Until now `getSeasonRecipients` selected every member of a season and the
-- four sweeps mailed all of them, unconditionally. The account screen draws
-- four toggles (board 4.10) and had nothing to write to.
--
-- ── THE COLUMN NAMES ARE THE CRON'S OWN `Kind` VALUES, ON PURPOSE ──────────
-- `api/cron/notify/route.ts` types its work as
--   Kind = "slate_up" | "deadline_reminder" | "bids_revealed" | "results_up"
-- and each sweep already knows its own kind. Naming these columns
-- `notify_<kind>` lets the recipient query build its filter from that value
-- rather than from a second mapping table that can drift out of step with it.
-- Rename a kind and the filter fails loudly at the database instead of quietly
-- mailing everyone.
--
-- ── DEFAULT TRUE, AND NOT NULL ────────────────────────────────────────────
-- Every existing member is already receiving all four; defaulting to false
-- would silently switch off everyone's mail on deploy. NOT NULL so the filter
-- never has to reason about a third state — a null preference is not "off", it
-- is a bug, and the column type refuses to hold one.
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
-- Not an unsubscribe list, and not a suppression list. `email_log` already
-- records what was SENT and why it failed; this records what a person WANTS.
-- The two are different facts and are deliberately not merged: a bounce is not
-- a preference, and a preference is not a delivery outcome.

alter table public.profiles
  add column if not exists notify_slate_up          boolean not null default true,
  add column if not exists notify_deadline_reminder boolean not null default true,
  add column if not exists notify_bids_revealed     boolean not null default true,
  add column if not exists notify_results_up        boolean not null default true;

comment on column public.profiles.notify_slate_up is
  'Email me when a week''s slate opens for bidding.';
comment on column public.profiles.notify_deadline_reminder is
  'Email me before bidding closes, if I have not bid.';
comment on column public.profiles.notify_bids_revealed is
  'Email me when a week closes and bids are revealed.';
comment on column public.profiles.notify_results_up is
  'Email me when box office and Tomatometer land and standings move.';

-- ---------------------------------------------------------------------------
-- The write. All four at once, because the screen saves the section rather
-- than the switch — a per-column RPC would be four round trips to express one
-- decision, and would let the four drift apart mid-save.
--
-- `auth.uid()` is the only row this can touch. There is deliberately no
-- profile-id parameter: a function that takes one is a function somebody can
-- be persuaded to call with somebody else's id.
-- ---------------------------------------------------------------------------
create or replace function public.update_email_preferences(
  p_slate_up          boolean,
  p_deadline_reminder boolean,
  p_bids_revealed     boolean,
  p_results_up        boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if p_slate_up is null
     or p_deadline_reminder is null
     or p_bids_revealed is null
     or p_results_up is null then
    raise exception 'every preference must be true or false';
  end if;

  update profiles
     set notify_slate_up          = p_slate_up,
         notify_deadline_reminder = p_deadline_reminder,
         notify_bids_revealed     = p_bids_revealed,
         notify_results_up        = p_results_up
   where id = auth.uid();
end;
$$;

revoke all on function public.update_email_preferences(boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.update_email_preferences(boolean, boolean, boolean, boolean)
  to authenticated;
