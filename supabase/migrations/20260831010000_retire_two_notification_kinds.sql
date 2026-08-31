-- RETIRE `slate_up` AND `deadline_reminder`.
--
-- Both announced something a player can already see on the board: a slate going
-- up is the week page, and a deadline approaching is the countdown in the nav.
-- Together they turned a weekly game into a weekly nagging. What is left is the
-- two that carry NEWS the app cannot show you until it happens — the sealed
-- sheet opening, and the scores landing.
--
-- WHAT THIS DOES NOT TOUCH, and the reason is the same both times: history is
-- true and must stay readable.
--
--   * `email_log_kind_check` still allows all five kinds. The ledger holds 37
--     slate_up rows and 37 deadline_reminder rows; narrowing the constraint
--     would make the table fail its own check on rows that were correct when
--     they were written.
--   * Those rows are left in place. They are the record of what the sweep did,
--     not a queue of work.
--
-- WHAT IS LOST: every player's two retired preferences. Nobody can express them
-- any more, so there is nothing for them to have been.

alter table public.profiles drop column if exists notify_slate_up;
alter table public.profiles drop column if exists notify_deadline_reminder;

-- The preference RPC narrows with the columns. Argument count changes, so this
-- is a drop and create rather than a replace.
drop function if exists public.update_email_preferences(boolean, boolean, boolean, boolean);

create function public.update_email_preferences(
  p_bids_revealed boolean,
  p_results_up boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  -- NULL is not "leave it alone" here: the form posts a checkbox, and an absent
  -- key already means false at the action. A null arriving this far is a caller
  -- that has lost track of what it is saying, and silently writing it as false
  -- would turn a bug into a preference the player never set.
  if p_bids_revealed is null or p_results_up is null then
    raise exception 'every preference must be true or false';
  end if;

  update profiles
     set notify_bids_revealed = p_bids_revealed,
         notify_results_up    = p_results_up
   where id = auth.uid();
end;
$$;

comment on function public.update_email_preferences(boolean, boolean) is
  'Set the caller''s own automatic-email preferences. Was four arguments until '
  '2026-08-31, when slate_up and deadline_reminder were retired; email_log.kind '
  'still allows those values because the rows already written are true.';

revoke all on function public.update_email_preferences(boolean, boolean) from public, anon;
grant execute on function public.update_email_preferences(boolean, boolean) to authenticated;
