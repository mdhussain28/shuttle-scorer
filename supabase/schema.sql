-- Shuttle Scorer database schema
-- Run once in Supabase: SQL Editor -> New query -> paste this file -> Run.
-- Safe to re-run: every statement uses IF NOT EXISTS / DROP IF EXISTS.

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
-- Row level security: each signed-in organiser sees and edits only their own rows.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['tournaments', 'categories', 'pools', 'entries', 'matches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner full access" on public.%I', t);
    execute format(
      'create policy "owner full access" on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t
    );
  end loop;
end $$;

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
