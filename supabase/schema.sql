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
-- Umpires (version 3)
-- The organiser creates umpire accounts from the Tournament page. Those accounts
-- carry app_metadata.role = 'umpire' (set only by the server, users cannot change it)
-- and are linked to a tournament in tournament_members.
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);
create index if not exists idx_members_user on public.tournament_members(user_id);

create or replace function public.is_umpire() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'umpire'
$$;

create or replace function public.is_tournament_owner(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournaments t where t.id = tid and t.owner_id = auth.uid())
$$;

create or replace function public.is_tournament_member(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tournament_members m where m.tournament_id = tid and m.user_id = auth.uid())
$$;

create or replace function public.is_category_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.categories c
    join public.tournament_members m on m.tournament_id = c.tournament_id
    where c.id = cid and m.user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Row level security
--  * The organiser owns their rows and can do everything with them.
--  * Umpires can read the tournaments they were added to, and can create and
--    score matches in them. They cannot create, rename or delete anything else.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['tournaments', 'categories', 'pools', 'entries', 'matches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format(
      'create policy "owner full access" on public.%I for all to authenticated using (owner_id = auth.uid() and not public.is_umpire()) with check (owner_id = auth.uid() and not public.is_umpire())',
      t
    );
  end loop;
end $$;

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

-- Matches: the organiser sees and manages every match in their tournaments,
-- including the ones umpires created.
drop policy if exists "organiser tournament matches" on public.matches;
create policy "organiser tournament matches" on public.matches for all to authenticated
  using (tournament_id is not null and public.is_tournament_owner(tournament_id) and not public.is_umpire())
  with check (tournament_id is not null and public.is_tournament_owner(tournament_id) and not public.is_umpire());

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

-- Umpire list: the organiser manages it, an umpire can see their own rows.
alter table public.tournament_members enable row level security;
drop policy if exists "organiser manages umpires" on public.tournament_members;
create policy "organiser manages umpires" on public.tournament_members for all to authenticated
  using (public.is_tournament_owner(tournament_id) and not public.is_umpire())
  with check (public.is_tournament_owner(tournament_id) and not public.is_umpire());
drop policy if exists "umpire sees own membership" on public.tournament_members;
create policy "umpire sees own membership" on public.tournament_members for select to authenticated
  using (user_id = auth.uid());

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
