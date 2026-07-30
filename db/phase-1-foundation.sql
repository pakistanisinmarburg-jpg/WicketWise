-- =====================================================================
-- WicketWise — PHASE 1: FOUNDATION
-- =====================================================================
-- Run this ONCE in your Supabase SQL editor. It is idempotent: safe to
-- re-run, and safe to run on top of the earlier db/*.sql files.
--
-- Covers: auth users -> profiles -> players -> captain roles/requests ->
--         teams -> team_members -> team_invitations -> venues.
--
-- Naming note: your brief lists `captain_roles`. Storing roles on a
-- captain-specific table (or on profiles) is a privilege-escalation
-- footgun, so roles live in ONE table, `public.user_roles`, keyed by the
-- `app_role` enum ('admin' | 'captain' | 'scorer' | 'player'), and every
-- policy reads it through the SECURITY DEFINER function `has_role()`.
-- A `public.captain_roles` view is provided for the name you asked for.
--
-- RLS is enabled on every table below, and every table has explicit
-- GRANTs (PostgREST needs both).
-- =====================================================================

create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('admin', 'scorer', 'captain', 'player');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. ROLES — the authorization spine. Never written from the client.
-- ---------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles add column if not exists granted_by uuid references auth.users(id) on delete set null;
alter table public.user_roles add column if not exists granted_at timestamptz not null default now();

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- Reads own roles. Admins read all. NOBODY writes roles over the API:
-- grants happen through SECURITY DEFINER triggers/functions only.
drop policy if exists "read own roles" on public.user_roles;
create policy "read own roles" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, anon;

drop policy if exists "admins read all roles" on public.user_roles;
create policy "admins read all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin')
$$;
grant execute on function public.is_admin() to authenticated, anon;

-- The `captain_roles` name from the brief, as a read-only projection.
create or replace view public.captain_roles as
  select user_id, granted_by, granted_at from public.user_roles where role = 'captain';
grant select on public.captain_roles to authenticated;

-- ---------------------------------------------------------------------
-- 2. PROFILES — one row per auth user, created automatically on signup.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Step 1 (account) + step 2 (cricket profile) + step 3 (availability).
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists date_of_birth date;
alter table public.profiles add column if not exists gender text;
alter table public.profiles add column if not exists nationality text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists jersey_number int;
alter table public.profiles add column if not exists batting_style text;
alter table public.profiles add column if not exists bowling_style text;
alter table public.profiles add column if not exists player_role text;
alter table public.profiles add column if not exists is_available boolean not null default true;
alter table public.profiles add column if not exists onboarded boolean not null default false;
alter table public.profiles add column if not exists suspended boolean not null default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- A player writes ONLY their own profile/availability. `suspended` is
-- admin-only and is protected by the trigger below, not by hope.
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not public.is_admin() then
    new.suspended := old.suspended;   -- only admins may suspend/unsuspend
    new.id        := old.id;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_update on public.profiles;
create trigger trg_guard_profile_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 3. SIGNUP TRIGGER — profile + player card + default 'player' role.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), '');
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, v_name, new.email)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'player')
  on conflict (user_id, role) do nothing;

  -- Every user is a player: this is the row every statistic hangs off.
  insert into public.players (user_id, full_name, created_by)
  select new.id, v_name, new.id
  where not exists (select 1 from public.players where user_id = new.id);

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. PLAYERS — the cricketing identity. USER -> PLAYER.
-- ---------------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  nickname text,
  batting_style text,
  bowling_style text,
  role text,
  photo_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.players add column if not exists jersey_number int;
alter table public.players add column if not exists is_available boolean not null default true;
create unique index if not exists players_user_id_key on public.players(user_id) where user_id is not null;

grant select, insert, update, delete on public.players to authenticated;
grant select on public.players to anon;
grant all on public.players to service_role;
alter table public.players enable row level security;

drop policy if exists "players readable" on public.players;
create policy "players readable" on public.players for select using (true);

drop policy if exists "players insert" on public.players;
create policy "players insert" on public.players for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "players update" on public.players;
create policy "players update" on public.players for update to authenticated
  using (auth.uid() = user_id or auth.uid() = created_by or public.is_admin())
  with check (auth.uid() = user_id or auth.uid() = created_by or public.is_admin());

drop policy if exists "players delete" on public.players;
create policy "players delete" on public.players for delete to authenticated
  using (auth.uid() = created_by or public.is_admin());

-- Keep the player card in step with the profile (single source of truth).
create or replace function public.sync_player_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.players set
    full_name     = coalesce(nullif(new.full_name, ''), full_name),
    batting_style = new.batting_style,
    bowling_style = new.bowling_style,
    role          = new.player_role,
    jersey_number = new.jersey_number,
    photo_url     = new.avatar_url,
    is_available  = new.is_available
  where user_id = new.id;
  return new;
end $$;
drop trigger if exists trg_sync_player_from_profile on public.profiles;
create trigger trg_sync_player_from_profile after update on public.profiles
  for each row execute function public.sync_player_from_profile();

-- ---------------------------------------------------------------------
-- 5. CAPTAIN REQUESTS — player asks, admin approves, role is granted
--    server-side by the trigger. The client never writes user_roles.
-- ---------------------------------------------------------------------
do $$ begin
  create type public.request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.captain_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default '',
  status public.request_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists captain_requests_one_open
  on public.captain_requests(user_id) where status = 'pending';

grant select, insert, update on public.captain_requests to authenticated;
grant all on public.captain_requests to service_role;
alter table public.captain_requests enable row level security;

drop policy if exists "own captain requests" on public.captain_requests;
create policy "own captain requests" on public.captain_requests
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "request captaincy" on public.captain_requests;
create policy "request captaincy" on public.captain_requests
  for insert to authenticated with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "admins review captain requests" on public.captain_requests;
create policy "admins review captain requests" on public.captain_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.apply_captain_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.user_roles (user_id, role, granted_by)
    values (new.user_id, 'captain', auth.uid())
    on conflict (user_id, role) do nothing;
  elsif new.status = 'rejected' and old.status = 'approved' then
    delete from public.user_roles where user_id = new.user_id and role = 'captain';
  end if;
  new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  new.reviewed_at := coalesce(new.reviewed_at, now());
  return new;
end $$;
drop trigger if exists trg_apply_captain_request on public.captain_requests;
create trigger trg_apply_captain_request before update on public.captain_requests
  for each row execute function public.apply_captain_request();

-- ---------------------------------------------------------------------
-- 6. VENUES — reference data, admin-managed, readable by everyone.
-- ---------------------------------------------------------------------
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  country text,
  surface text,             -- turf / matting / astro / concrete
  capacity int,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name, city)
);
grant select, insert, update, delete on public.venues to authenticated;
grant select on public.venues to anon;
grant all on public.venues to service_role;
alter table public.venues enable row level security;

drop policy if exists "venues readable" on public.venues;
create policy "venues readable" on public.venues for select using (true);

drop policy if exists "venues managed by captains" on public.venues;
create policy "venues managed by captains" on public.venues
  for insert to authenticated
  with check (auth.uid() = created_by and (public.has_role(auth.uid(), 'captain') or public.is_admin()));

drop policy if exists "venues edited by owner or admin" on public.venues;
create policy "venues edited by owner or admin" on public.venues
  for update to authenticated using (auth.uid() = created_by or public.is_admin());

drop policy if exists "venues deleted by admin" on public.venues;
create policy "venues deleted by admin" on public.venues
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- 7. TEAMS — created by captains/admins only.
-- ---------------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null default '',
  logo_url text,
  home_ground text,
  captain_player_id uuid references public.players(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.teams add column if not exists description text;
alter table public.teams add column if not exists city text;
alter table public.teams add column if not exists country text;
alter table public.teams add column if not exists vice_captain_player_id uuid references public.players(id) on delete set null;
alter table public.teams add column if not exists primary_color text;
alter table public.teams add column if not exists secondary_color text;
alter table public.teams add column if not exists founded_year int;
alter table public.teams add column if not exists home_venue_id uuid references public.venues(id) on delete set null;
alter table public.teams add column if not exists is_active boolean not null default true;

grant select, insert, update, delete on public.teams to authenticated;
grant select on public.teams to anon;
grant all on public.teams to service_role;
alter table public.teams enable row level security;

-- Is this user the creator, captain or vice-captain of the team?
create or replace function public.manages_team(_team_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.teams t
    left join public.players cp on cp.id = t.captain_player_id
    left join public.players vp on vp.id = t.vice_captain_player_id
    where t.id = _team_id
      and (t.created_by = _user_id or cp.user_id = _user_id or vp.user_id = _user_id)
  ) or public.has_role(_user_id, 'admin')
$$;
grant execute on function public.manages_team(uuid, uuid) to authenticated;

drop policy if exists "teams readable" on public.teams;
create policy "teams readable" on public.teams for select using (true);

drop policy if exists "teams insert" on public.teams;
create policy "teams insert" on public.teams for insert to authenticated
  with check (
    auth.uid() = created_by
    and (public.has_role(auth.uid(), 'captain') or public.is_admin())
  );

drop policy if exists "teams update" on public.teams;
create policy "teams update" on public.teams for update to authenticated
  using (public.manages_team(id)) with check (public.manages_team(id));

drop policy if exists "teams delete" on public.teams;
create policy "teams delete" on public.teams for delete to authenticated
  using (auth.uid() = created_by or public.is_admin());

-- ---------------------------------------------------------------------
-- 8. TEAM MEMBERS — the roster. USER -> PLAYER -> TEAM MEMBERSHIP.
-- ---------------------------------------------------------------------
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  jersey_number int,
  primary key (team_id, player_id)
);
alter table public.team_members add column if not exists role text;
alter table public.team_members add column if not exists joined_at timestamptz not null default now();
alter table public.team_members add column if not exists is_active boolean not null default true;

grant select, insert, update, delete on public.team_members to authenticated;
grant select on public.team_members to anon;
grant all on public.team_members to service_role;
alter table public.team_members enable row level security;

drop policy if exists "team members readable" on public.team_members;
create policy "team members readable" on public.team_members for select using (true);

drop policy if exists "team members write" on public.team_members;
create policy "team members write" on public.team_members for all to authenticated
  using (public.manages_team(team_id)) with check (public.manages_team(team_id));

-- A player may always remove themselves from a squad.
drop policy if exists "leave team" on public.team_members;
create policy "leave team" on public.team_members for delete to authenticated
  using (exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------
-- 9. TEAM INVITATIONS — the two-sided selection flow.
--    Captain invites -> player accepts/declines -> roster updates.
-- ---------------------------------------------------------------------
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  message text,
  status public.request_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists team_invitations_one_open
  on public.team_invitations(team_id, player_id) where status = 'pending';

grant select, insert, update, delete on public.team_invitations to authenticated;
grant all on public.team_invitations to service_role;
alter table public.team_invitations enable row level security;

drop policy if exists "invitations visible to both sides" on public.team_invitations;
create policy "invitations visible to both sides" on public.team_invitations
  for select to authenticated using (
    public.manages_team(team_id)
    or exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid())
  );

drop policy if exists "captains invite" on public.team_invitations;
create policy "captains invite" on public.team_invitations
  for insert to authenticated with check (public.manages_team(team_id));

-- The invited player responds; the captain may withdraw.
drop policy if exists "respond to invitation" on public.team_invitations;
create policy "respond to invitation" on public.team_invitations
  for update to authenticated using (
    public.manages_team(team_id)
    or exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid())
  );

drop policy if exists "withdraw invitation" on public.team_invitations;
create policy "withdraw invitation" on public.team_invitations
  for delete to authenticated using (public.manages_team(team_id));

create or replace function public.apply_team_invitation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> old.status then
    new.responded_at := now();
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.team_members (team_id, player_id)
    values (new.team_id, new.player_id)
    on conflict (team_id, player_id) do update set is_active = true;
  end if;
  return new;
end $$;
drop trigger if exists trg_apply_team_invitation on public.team_invitations;
create trigger trg_apply_team_invitation before update on public.team_invitations
  for each row execute function public.apply_team_invitation();

-- ---------------------------------------------------------------------
-- 10. ADMIN ACTIONS — who did what, from the very first phase.
-- ---------------------------------------------------------------------
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.admin_actions to authenticated;
grant all on public.admin_actions to service_role;
alter table public.admin_actions enable row level security;

drop policy if exists "admins read actions" on public.admin_actions;
create policy "admins read actions" on public.admin_actions
  for select to authenticated using (public.is_admin());

drop policy if exists "admins write actions" on public.admin_actions;
create policy "admins write actions" on public.admin_actions
  for insert to authenticated with check (public.is_admin() and auth.uid() = actor_id);

create or replace function public.log_captain_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> old.status then
    insert into public.admin_actions (actor_id, action, entity_table, entity_id, detail)
    values (auth.uid(), 'CAPTAIN_REQUEST_' || upper(new.status::text),
            'captain_requests', new.id,
            jsonb_build_object('user_id', new.user_id, 'note', new.review_note));
  end if;
  return new;
end $$;
drop trigger if exists trg_log_captain_review on public.captain_requests;
create trigger trg_log_captain_review after update on public.captain_requests
  for each row execute function public.log_captain_review();

-- ---------------------------------------------------------------------
-- 11. AVATAR STORAGE
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars own upload" on storage.objects;
create policy "avatars own upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars own update" on storage.objects;
create policy "avatars own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars own delete" on storage.objects;
create policy "avatars own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 12. BOOTSTRAP YOUR FIRST ADMIN
--     Run once, with your own email, after signing up:
--
--     insert into public.user_roles (user_id, role)
--     select id, 'admin' from auth.users where email = 'you@example.com'
--     on conflict do nothing;
-- ---------------------------------------------------------------------
