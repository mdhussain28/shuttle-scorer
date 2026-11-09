-- Shuttle Scorer database schema
-- Run in Supabase: SQL Editor -> New query -> paste this file -> Run.
-- Safe to re-run: every statement uses IF NOT EXISTS / DROP IF EXISTS.
-- Re-run it whenever you update the app, to pick up new columns and rules.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.tournaments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 3 and 80),
  venue          text,
  start_date     date default current_date,
  points_per_win int  not null default 2 check (points_per_win between 1 and 10),
  created_at     timestamptz not null default now(),
  -- Everything under a tournament is deleted 3 months after it was created.
  expires_at     timestamptz not null default (now() + interval '3 months')
);

create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  created_at    timestamptz not null default now()
);

create table if not exists public.pools (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  created_at  timestamptz not null default now()
);

-- A "team" (doubles) or a single player (singles) inside a category.
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  pool_id     uuid references public.pools(id) on delete set null,
  entry_type  text not null check (entry_type in ('singles', 'doubles')),
  team_name   text,
  player1     text not null check (char_length(btrim(player1)) > 0),
  player2     text,
  created_at  timestamptz not null default now(),
  constraint entries_shape check (
    (entry_type = 'singles' and player2 is null)
    or (entry_type = 'doubles' and player2 is not null and team_name is not null)
  )
);

-- Tournament matches and casual matches live in the same table.
-- Casual matches have tournament_id = null.
-- `events` is the full rally-by-rally log; the live state is rebuilt from it,
-- which is what makes undo possible. The other columns are a summary used
-- for lists and pool standings.
create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete cascade,
  pool_id       uuid references public.pools(id) on delete set null,
  entry_a_id    uuid references public.entries(id) on delete set null,
  entry_b_id    uuid references public.entries(id) on delete set null,
  match_type    text not null check (match_type in ('singles', 'doubles')),
  a_label       text not null,
  b_label       text not null,
  a_players     text[] not null,
  b_players     text[] not null,
  config        jsonb not null,
  events        jsonb not null default '[]'::jsonb,
  status        text not null default 'live' check (status in ('live', 'finished')),
  winner        text check (winner in ('a', 'b')),
  set_scores    jsonb not null default '[]'::jsonb,
  sets_a        int not null default 0,
  sets_b        int not null default 0,
  points_a      int not null default 0,
  points_b      int not null default 0,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,
  -- Casual matches are also kept for 3 months. Change the interval here if you
  -- want them kept longer.
  expires_at    timestamptz not null default (now() + interval '3 months')
);

-- ---------------------------------------------------------------------------
-- Version 2 columns (tie-break rules, knockout stage, decider matches).
-- These ALTERs add the columns to a database created with the first version
-- and do nothing if they already exist, so re-running this whole file is safe.
-- ---------------------------------------------------------------------------

alter table public.tournaments
  add column if not exists tie_two text not null default 'head_to_head'
    check (tie_two in ('head_to_head', 'decider'));
alter table public.tournaments
  add column if not exists tie_multi text not null default 'set_point_diff'
    check (tie_multi in ('set_point_diff', 'decider'));

-- Knockout bracket for a category: { stage, slots, thirdPlace }, null until generated.
alter table public.categories add column if not exists knockout jsonb;

-- Knockout matches carry their round and position; decider matches are flagged.
alter table public.matches
  add column if not exists stage text check (stage in ('qf', 'sf', 'final', 'third'));
alter table public.matches add column if not exists slot int;
alter table public.matches add column if not exists is_decider boolean not null default false;

create index if not exists idx_categories_tournament on public.categories(tournament_id);
create index if not exists idx_pools_category        on public.pools(category_id);
create index if not exists idx_entries_category      on public.entries(category_id);
create index if not exists idx_entries_pool          on public.entries(pool_id);
create index if not exists idx_matches_category      on public.matches(category_id);
create index if not exists idx_matches_tournament    on public.matches(tournament_id);
create index if not exists idx_matches_expires       on public.matches(expires_at);
create index if not exists idx_tournaments_expires   on public.tournaments(expires_at);
create index if not exists idx_tournaments_owner     on public.tournaments(owner_id);

-- ---------------------------------------------------------------------------
-- Accounts, roles and access (versions 3 and 4)
--
--  * Admin: full rights over every tournament and user. Any account that is not
--    marked as a user counts as an admin, so your existing login keeps working.
--  * User: an account created by an admin (app_metadata.role = 'umpire'; the role
--    is set by the server and cannot be changed by the user). Users see only the
--    tournaments they are assigned to and can start and score matches there.
--  * A user can have an expiry time. After it passes they lose all access
--    immediately, and the daily cleanup deletes the account.
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index if not exists idx_members_user on public.tournament_members(user_id);

-- One row per account created from the Admin page.
create table if not exists public.app_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'user' check (role in ('user', 'admin')),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_app_users_expires on public.app_users(expires_at);

-- Accounts made with the first umpire version get a row too.
insert into public.app_users (user_id, email, role)
select id, email, 'user' from auth.users
where raw_app_meta_data ->> 'role' = 'umpire'
on conflict (user_id) do nothing;

create or replace function public.is_umpire() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'umpire'
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select auth.uid() is not null and not public.is_umpire()
$$;

-- False once the signed-in account's expiry time has passed.
create or replace function public.user_active() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.app_users u
    where u.user_id = auth.uid() and u.expires_at is not null and u.expires_at <= now()
  )
$$;

create or replace function public.is_tournament_member(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_active() and exists (
    select 1 from public.tournament_members m where m.tournament_id = tid and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_category_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_active() and exists (
    select 1 from public.categories c
    join public.tournament_members m on m.tournament_id = c.tournament_id
    where c.id = cid and m.user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['tournaments', 'categories', 'pools', 'entries', 'matches', 'tournament_members', 'app_users'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format('drop policy if exists "admin full access" on public.%I', t);
    execute format(
      'create policy "admin full access" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t
    );
  end loop;
end $$;

drop policy if exists "organiser tournament matches" on public.matches;
drop policy if exists "organiser manages umpires" on public.tournament_members;

drop policy if exists "umpire read" on public.tournaments;
create policy "umpire read" on public.tournaments for select to authenticated
  using (public.is_tournament_member(id));

drop policy if exists "umpire read" on public.categories;
create policy "umpire read" on public.categories for select to authenticated
  using (public.is_tournament_member(tournament_id));

drop policy if exists "umpire read" on public.pools;
create policy "umpire read" on public.pools for select to authenticated
  using (public.is_category_member(category_id));

drop policy if exists "umpire read" on public.entries;
create policy "umpire read" on public.entries for select to authenticated
  using (public.is_category_member(category_id));

drop policy if exists "umpire read matches" on public.matches;
create policy "umpire read matches" on public.matches for select to authenticated
  using (tournament_id is not null and public.is_tournament_member(tournament_id));

drop policy if exists "umpire start matches" on public.matches;
create policy "umpire start matches" on public.matches for insert to authenticated
  with check (owner_id = auth.uid() and tournament_id is not null and public.is_tournament_member(tournament_id));

drop policy if exists "umpire score matches" on public.matches;
create policy "umpire score matches" on public.matches for update to authenticated
  using (tournament_id is not null and public.is_tournament_member(tournament_id))
  with check (tournament_id is not null and public.is_tournament_member(tournament_id));

drop policy if exists "umpire sees own membership" on public.tournament_members;
create policy "umpire sees own membership" on public.tournament_members for select to authenticated
  using (user_id = auth.uid() and public.user_active());

drop policy if exists "user sees own account" on public.app_users;
create policy "user sees own account" on public.app_users for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Public live view (version 5)
-- Anyone with the link can watch public tournaments without signing in, read only.
--   * tournaments.is_public: the admin switches a whole tournament on or off.
--   * matches.is_public: the admin chooses which matches the public may see.
--     A private match is hidden completely, including from the public points table.
-- Accounts, umpire assignments and casual matches are never public.
-- ---------------------------------------------------------------------------

alter table public.tournaments add column if not exists is_public boolean not null default true;
alter table public.matches     add column if not exists is_public boolean not null default true;

create or replace function public.is_public_tournament(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments t where t.id = tid and t.is_public)
$$;

create or replace function public.is_public_category(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.categories c
    join public.tournaments t on t.id = c.tournament_id
    where c.id = cid and t.is_public
  )
$$;

drop policy if exists "public read" on public.tournaments;
create policy "public read" on public.tournaments for select to anon
  using (is_public);

drop policy if exists "public read" on public.categories;
create policy "public read" on public.categories for select to anon
  using (public.is_public_tournament(tournament_id));

drop policy if exists "public read" on public.pools;
create policy "public read" on public.pools for select to anon
  using (public.is_public_category(category_id));

drop policy if exists "public read" on public.entries;
create policy "public read" on public.entries for select to anon
  using (public.is_public_category(category_id));

drop policy if exists "public read" on public.matches;
create policy "public read" on public.matches for select to anon
  using (tournament_id is not null and is_public and public.is_public_tournament(tournament_id));

-- Users can score matches but cannot change who may see them.
create or replace function public.guard_match_visibility() returns trigger
language plpgsql as $$
begin
  if public.is_umpire() then
    if tg_op = 'INSERT' then
      new.is_public := true;
    elsif new.is_public is distinct from old.is_public then
      new.is_public := old.is_public;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_match_visibility on public.matches;
create trigger trg_guard_match_visibility
  before insert or update on public.matches
  for each row execute function public.guard_match_visibility();

-- ---------------------------------------------------------------------------
-- Optional: run the 3-month cleanup inside Supabase instead of the Vercel cron job.
-- Enable the pg_cron extension (Database -> Extensions), then uncomment:
--
-- select cron.schedule(
--   'purge-expired-shuttle-data', '30 21 * * *',
--   $$ delete from public.tournaments where expires_at < now();
--      delete from public.matches where tournament_id is null and expires_at < now(); $$
-- );
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Version 6: what a user may do is chosen by the admin per account
--
--  * can_host          the user can create and manage their own tournaments
--  * can_add_umpires   the user can create umpire accounts (and assign them) for
--                      tournaments they own or are assigned to
--  * A user with neither switch on only scores matches in assigned tournaments.
--  Admins can see and delete every account, including umpires added by users.
-- ---------------------------------------------------------------------------

alter table public.app_users add column if not exists can_host boolean not null default false;
alter table public.app_users add column if not exists can_add_umpires boolean not null default false;

create or replace function public.is_host() returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_active() and exists (
    select 1 from public.app_users u where u.user_id = auth.uid() and u.can_host
  )
$$;

create or replace function public.can_add_umpires() returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_active() and exists (
    select 1 from public.app_users u where u.user_id = auth.uid() and u.can_add_umpires
  )
$$;

create or replace function public.is_tournament_owner(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_active() and exists (
    select 1 from public.tournaments t where t.id = tid and t.owner_id = auth.uid()
  )
$$;

create or replace function public.is_category_owner(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.user_active() and exists (
    select 1 from public.categories c
    join public.tournaments t on t.id = c.tournament_id
    where c.id = cid and t.owner_id = auth.uid()
  )
$$;

-- Hosts manage their own tournaments.
drop policy if exists "host own" on public.tournaments;
create policy "host own" on public.tournaments for all to authenticated
  using (public.is_host() and owner_id = auth.uid())
  with check (public.is_host() and owner_id = auth.uid());

drop policy if exists "host own" on public.categories;
create policy "host own" on public.categories for all to authenticated
  using (public.is_host() and public.is_tournament_owner(tournament_id))
  with check (public.is_host() and public.is_tournament_owner(tournament_id));

drop policy if exists "host own" on public.pools;
create policy "host own" on public.pools for all to authenticated
  using (public.is_host() and public.is_category_owner(category_id))
  with check (public.is_host() and public.is_category_owner(category_id));

drop policy if exists "host own" on public.entries;
create policy "host own" on public.entries for all to authenticated
  using (public.is_host() and public.is_category_owner(category_id))
  with check (public.is_host() and public.is_category_owner(category_id));

drop policy if exists "host own" on public.matches;
create policy "host own" on public.matches for all to authenticated
  using (public.is_host() and (owner_id = auth.uid() or (tournament_id is not null and public.is_tournament_owner(tournament_id))))
  with check (
    public.is_host() and (
      (tournament_id is null and owner_id = auth.uid())
      or (tournament_id is not null and public.is_tournament_owner(tournament_id))
    )
  );

-- Umpire management: owners and permitted users manage the umpires they created.
drop policy if exists "managers read members" on public.tournament_members;
create policy "managers read members" on public.tournament_members for select to authenticated
  using (public.is_tournament_owner(tournament_id) or (public.can_add_umpires() and public.is_tournament_member(tournament_id)));

drop policy if exists "managers add members" on public.tournament_members;
create policy "managers add members" on public.tournament_members for insert to authenticated
  with check (
    public.can_add_umpires()
    and (public.is_tournament_owner(tournament_id) or public.is_tournament_member(tournament_id))
    and exists (select 1 from public.app_users u where u.user_id = tournament_members.user_id and u.created_by = auth.uid())
  );

drop policy if exists "managers remove members" on public.tournament_members;
create policy "managers remove members" on public.tournament_members for delete to authenticated
  using (
    (public.is_host() and public.is_tournament_owner(tournament_id))
    or (
      public.can_add_umpires()
      and (public.is_tournament_owner(tournament_id) or public.is_tournament_member(tournament_id))
      and exists (select 1 from public.app_users u where u.user_id = tournament_members.user_id and u.created_by = auth.uid())
    )
  );

drop policy if exists "creator sees own accounts" on public.app_users;
create policy "creator sees own accounts" on public.app_users for select to authenticated
  using (created_by = auth.uid() and public.user_active());

-- Only admins and hosts can change who sees a match.
create or replace function public.guard_match_visibility() returns trigger
language plpgsql as $$
begin
  if not public.is_admin() and not public.is_host() then
    if tg_op = 'INSERT' then
      new.is_public := true;
    elsif new.is_public is distinct from old.is_public then
      new.is_public := old.is_public;
    end if;
  end if;
  return new;
end
$$;

-- Version 6b: every active account may start, score and delete its own casual matches
-- (matches that belong to no tournament), whether or not it may host tournaments.
drop policy if exists "own casual matches" on public.matches;
create policy "own casual matches" on public.matches for all to authenticated
  using (tournament_id is null and owner_id = auth.uid() and public.user_active())
  with check (tournament_id is null and owner_id = auth.uid() and public.user_active());
