-- ============================================================================
-- Phase 2 — Auth + profiles wiring
--
-- Phase 1 created the profiles table but nothing fills it: the spike seeded
-- rows by hand with the service role. Real accounts need the standard
-- Supabase pattern — a trigger on auth.users that creates the matching
-- profiles row the moment a user signs up.
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §3 (profiles 1:1 with auth users) §6 (auth)
--   ADR-004 deny-by-default: every new grant below is deliberate.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auto-create a profile on signup.
--    display_name comes from signup metadata; falls back to the part of the
--    email before the @ so a profile row always has a usable name.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;  -- idempotent if a profile was pre-seeded
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync if the auth email ever changes.
create or replace function public.handle_user_email_updated()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.handle_user_email_updated();

-- ---------------------------------------------------------------------------
-- 2. Let users edit their own display name — and nothing else.
--    The row policy limits UPDATE to your own profile; the column-level
--    grant limits it further to display_name only (email/id stay read-only,
--    email is owned by the auth system via the trigger above).
-- ---------------------------------------------------------------------------

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Function hygiene (same convention as phase 1): trigger functions are
--    never called directly by API roles.
-- ---------------------------------------------------------------------------

revoke all on function public.handle_new_user()          from public, anon, authenticated;
revoke all on function public.handle_user_email_updated() from public, anon, authenticated;
