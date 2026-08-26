-- WHO HAS ACTUALLY PAID — a fact the app cannot compute.
--
-- WHY THIS DOES NOT BREACH "MONEY IS DERIVED, NEVER STORED", stated here
-- because a table with amounts in it will look like a violation to anyone who
-- meets it cold. The rule protects money the app CAN compute — bankrolls,
-- spend, points, who owes whom — from drifting out of sync with the game.
-- Everything owed is still derived: it falls out of the standings, the season
-- settings and the payout structure, and generate_settlement recomputes it
-- freely. A PAYMENT is not computable from the game at all. One human sent
-- another human twenty dollars, and nothing in the schema can know that unless
-- somebody writes it down.
--
-- KEYED ON (season_member) RATHER THAN ON THE SETTLEMENT, which is the one
-- structural decision worth defending. A settlement is REGENERABLE — the
-- portal offers "Regenerate draft" as a routine action so a commissioner can
-- re-run the ledger as late results land — so hanging payments off
-- settlement_id would mean every regeneration either orphans the payment
-- history or destroys it. A record of who has paid must not be collateral
-- damage of recomputing what was owed. season_member_id carries the season
-- with it, so the pair the debt actually belongs to is one column.
--
-- RECORDABLE ONLY AGAINST A FINAL SETTLEMENT. The owed figure is only stable
-- once finalize_settlement has run — before that it can be regenerated out
-- from under you. That is not a new gate, it is the next link in one that
-- already exists: every week final or skipped -> the season can be completed
-- -> the settlement can be finalized -> payments can be recorded.
--
-- THE STATES ARE DELIBERATELY FEW. `owed` is the absence of a row, not a value:
-- a member with no payment row owes whatever the ledger says. What gets stored
-- is only what someone did about it.

create type public.payment_status as enum ('paid', 'waived');

create table public.settlement_payments (
  id               uuid primary key default gen_random_uuid(),
  season_member_id uuid not null references public.season_members (id) on delete cascade,
  status           public.payment_status not null,
  /**
   * Whole dollars, ALWAYS POSITIVE, and the direction is read from the ledger
   * rather than from a sign. A member either owes the pot or is owed by it;
   * the settlement already says which, so encoding it again here would give
   * two places to disagree about who is paying whom.
   */
  amount           integer not null check (amount >= 0),
  note             text,
  recorded_by      uuid references public.profiles (id),
  recorded_at      timestamptz not null default now(),
  -- One row per member per season. A correction overwrites it rather than
  -- appending a second, so "how much has Ben paid" can never need summing.
  unique (season_member_id)
);

create index settlement_payments_member_idx
  on public.settlement_payments (season_member_id);

alter table public.settlement_payments enable row level security;

-- Every member of the season sees the whole picture, and that is the point:
-- the reason to track this at all is so a league can see who is square. It is
-- not private between the commissioner and the payer.
--
-- Gated on the settlement being FINAL, the same condition that lets a payment
-- exist — before then the ledger is provisional and publishing payments against
-- it would be publishing against a number that can still move.
create policy settlement_payments_select on public.settlement_payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.season_members sm
      join public.settlements s on s.season_id = sm.season_id
      where sm.id = settlement_payments.season_member_id
        and s.status = 'final'
        and public.is_season_member(sm.season_id)
    )
  );

grant select on table public.settlement_payments to authenticated;
grant select, insert, update, delete on table public.settlement_payments to service_role;

-- ---------------------------------------------------------------------------
-- record_settlement_payment — the commissioner marks someone square.
--
-- COMMISSIONER ONLY. The alternative — letting a player mark themselves paid —
-- makes the record an assertion by the person it benefits, which is the one
-- thing it must not be. The commissioner is already the settlement's author.
-- ---------------------------------------------------------------------------
create or replace function public.record_settlement_payment(
  p_season_member_id uuid,
  p_status public.payment_status,
  p_amount integer,
  p_note text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member     season_members%rowtype;
  v_settlement settlements%rowtype;
begin
  select * into v_member from season_members where id = p_season_member_id;
  if not found then
    raise exception 'season member not found';
  end if;
  if not is_commissioner(v_member.season_id) then
    raise exception 'only the commissioner can record a payment';
  end if;

  select * into v_settlement
  from settlements where season_id = v_member.season_id;
  if not found or v_settlement.status <> 'final' then
    raise exception
      'finalize the season settlement before recording payments — until then the amounts can still be regenerated';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'an amount is a whole number of dollars, 0 or more';
  end if;

  insert into settlement_payments
    (season_member_id, status, amount, note, recorded_by, recorded_at)
  values
    (p_season_member_id, p_status, p_amount, nullif(trim(coalesce(p_note, '')), ''),
     auth.uid(), now())
  on conflict (season_member_id) do update
    set status      = excluded.status,
        amount      = excluded.amount,
        note        = excluded.note,
        recorded_by = excluded.recorded_by,
        recorded_at = now();

  insert into audit_log (season_id, actor, action, detail)
  values (v_member.season_id, auth.uid(), 'record_settlement_payment',
          jsonb_build_object('season_member_id', p_season_member_id,
                             'status', p_status, 'amount', p_amount));
end;
$$;

-- Undo. Deleting the row returns the member to "owed", which is the absence of
-- a record rather than a third state — so taking a payment back and never
-- having recorded one are the same thing, as they should be.
create or replace function public.clear_settlement_payment(p_season_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member season_members%rowtype;
begin
  select * into v_member from season_members where id = p_season_member_id;
  if not found then
    raise exception 'season member not found';
  end if;
  if not is_commissioner(v_member.season_id) then
    raise exception 'only the commissioner can clear a payment';
  end if;

  delete from settlement_payments where season_member_id = p_season_member_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_member.season_id, auth.uid(), 'clear_settlement_payment',
          jsonb_build_object('season_member_id', p_season_member_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- get_league_payments — the cross-season view, which is the whole reason the
-- table is keyed the way it is.
--
-- A league can start its next season while money from the last one is still
-- moving, so "who is square" is a LEAGUE question that outlives any one
-- season. Scoped to finalized settlements: an unfinalized season has no
-- publishable ledger and therefore nothing to be square about.
-- ---------------------------------------------------------------------------
create or replace function public.get_league_payments(p_league_id uuid)
returns table (
  season_id        uuid,
  season_name      text,
  season_member_id uuid,
  display_name     text,
  status           text,
  amount           integer,
  recorded_at      timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not is_league_member(p_league_id) then
    raise exception 'not a member of this league';
  end if;

  return query
  select
    s.id,
    s.name,
    sm.id,
    p.display_name,
    sp.status::text,
    sp.amount,
    sp.recorded_at
  from seasons s
  join settlements st on st.season_id = s.id and st.status = 'final'
  join season_members sm on sm.season_id = s.id
  join profiles p on p.id = sm.profile_id
  left join settlement_payments sp on sp.season_member_id = sm.id
  where s.league_id = p_league_id
  order by s.created_at desc, p.display_name;
end;
$$;

revoke all on function public.record_settlement_payment(uuid, public.payment_status, integer, text) from public, anon;
revoke all on function public.clear_settlement_payment(uuid) from public, anon;
revoke all on function public.get_league_payments(uuid)      from public, anon;
grant execute on function public.record_settlement_payment(uuid, public.payment_status, integer, text) to authenticated;
grant execute on function public.clear_settlement_payment(uuid) to authenticated;
grant execute on function public.get_league_payments(uuid)      to authenticated;
