-- WicketWise — Phase 2: roles, player profiles, captain approval, scoring permissions
-- Run this AFTER db/schema.sql in your Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.player_status as enum
    ('registered','available','unavailable','selected','playing','suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('pending','approved','rejected');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------- profiles: personal + cricket
alter table public.profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists nationality text,
  add column if not exists city text,
  add column if not exists batting_style text,
  add column if not exists bowling_style text,
  add column if not exists primary_role text,
  add column if not exists secondary_role text,
  add column if not exists jersey_number int,
  add column if not exists preferred_position text,
  add column if not exists experience text,
  add column if not exists bio text,
  add column if not exists is_available boolean not null default false,
  add column if not exists status public.player_status not null default 'registered',
  add column if not exists onboarding_step int not null default 1,
  add column if not exists onboarding_complete boolean not null default false;

-- every signup is a player
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'player')
  on conflict (user_id, role) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- backfill for accounts created before this migration
insert into public.user_roles (user_id, role)
select id, 'player' from auth.users on conflict (user_id, role) do nothing;

-- admins may moderate any profile (suspend, correct data)
drop policy if exists "admin profile update" on public.profiles;
create policy "admin profile update" on public.profiles for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (true);

-- ------------------------------------------------- keep a player row per user
-- Rosters, scorecards and stats all key off public.players, so a completed
-- profile mirrors itself into that table.
create or replace function public.sync_player_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.onboarding_complete then
    if exists (select 1 from public.players where user_id = new.id) then
      update public.players set
        full_name = coalesce(nullif(new.full_name, ''), full_name),
        batting_style = new.batting_style,
        bowling_style = new.bowling_style,
        role = new.primary_role,
        photo_url = new.avatar_url
      where user_id = new.id;
    else
      insert into public.players (user_id, full_name, batting_style, bowling_style, role, photo_url, created_by)
      values (new.id, coalesce(nullif(new.full_name, ''), 'Player'), new.batting_style,
              new.bowling_style, new.primary_role, new.avatar_url, new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_profile_synced on public.profiles;
create trigger on_profile_synced after insert or update on public.profiles
  for each row execute function public.sync_player_from_profile();

-- ---------------------------------------------------------------- roles read
-- Captain badges and rosters are public information.
drop policy if exists "read own roles" on public.user_roles;
drop policy if exists "roles readable" on public.user_roles;
create policy "roles readable" on public.user_roles for select using (true);
grant select on public.user_roles to anon;

-- ------------------------------------------------- captain requests
create table if not exists public.captain_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text,
  status public.request_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists captain_requests_one_pending
  on public.captain_requests(user_id) where status = 'pending';
grant select, insert on public.captain_requests to authenticated;
grant update on public.captain_requests to authenticated;
grant all on public.captain_requests to service_role;
alter table public.captain_requests enable row level security;
drop policy if exists "own or admin request read" on public.captain_requests;
create policy "own or admin request read" on public.captain_requests for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
drop policy if exists "own request insert" on public.captain_requests;
create policy "own request insert" on public.captain_requests for insert to authenticated
  with check (auth.uid() = user_id and status = 'pending');
drop policy if exists "admin request review" on public.captain_requests;
create policy "admin request review" on public.captain_requests for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- approval grants the captain role; rejection revokes it
create or replace function public.apply_captain_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.user_roles (user_id, role) values (new.user_id, 'captain')
    on conflict (user_id, role) do nothing;
  elsif new.status = 'rejected' and old.status = 'approved' then
    delete from public.user_roles where user_id = new.user_id and role = 'captain';
  end if;
  new.reviewed_at := now();
  return new;
end $$;
drop trigger if exists on_captain_request_reviewed on public.captain_requests;
create trigger on_captain_request_reviewed before update on public.captain_requests
  for each row execute function public.apply_captain_request();

-- ------------------------------------------------- scoring permissions
-- A temporary, match-scoped grant. It expires the moment the match completes.
create table if not exists public.scoring_permissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);
grant select, insert, update, delete on public.scoring_permissions to authenticated;
grant all on public.scoring_permissions to service_role;
alter table public.scoring_permissions enable row level security;

create or replace function public.is_match_manager(_user_id uuid, _match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin')
      or exists (select 1 from public.matches m where m.id = _match_id and m.created_by = _user_id)
$$;

/** True when the user may write deliveries for this match right now. */
create or replace function public.can_score_match(_user_id uuid, _match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_match_manager(_user_id, _match_id)
      or exists (
        select 1 from public.scoring_permissions sp
        join public.matches m on m.id = sp.match_id
        where sp.match_id = _match_id
          and sp.user_id = _user_id
          and sp.revoked = false
          and m.status in ('scheduled','live')   -- auto-expires on completion
      )
$$;

drop policy if exists "scoring permissions readable" on public.scoring_permissions;
create policy "scoring permissions readable" on public.scoring_permissions for select to authenticated
  using (auth.uid() = user_id or public.is_match_manager(auth.uid(), match_id));
drop policy if exists "scoring permissions manage" on public.scoring_permissions;
create policy "scoring permissions manage" on public.scoring_permissions for all to authenticated
  using (public.is_match_manager(auth.uid(), match_id))
  with check (public.is_match_manager(auth.uid(), match_id));

-- ------------------------------------------------- tighten write policies
-- Only captains and admins create competitions and teams.
drop policy if exists "teams insert" on public.teams;
create policy "teams insert" on public.teams for insert to authenticated
  with check (auth.uid() = created_by
              and (public.has_role(auth.uid(), 'captain') or public.has_role(auth.uid(), 'admin')));

drop policy if exists "matches insert" on public.matches;
create policy "matches insert" on public.matches for insert to authenticated
  with check (auth.uid() = created_by
              and (public.has_role(auth.uid(), 'captain') or public.has_role(auth.uid(), 'admin')));

-- Scoring writes are match-scoped, not role-wide.
drop policy if exists "innings write" on public.innings;
create policy "innings write" on public.innings for all to authenticated
  using (public.can_score_match(auth.uid(), match_id))
  with check (public.can_score_match(auth.uid(), match_id));

drop policy if exists "deliveries write" on public.deliveries;
create policy "deliveries write" on public.deliveries for all to authenticated
  using (exists (select 1 from public.innings i
                 where i.id = innings_id and public.can_score_match(auth.uid(), i.match_id)))
  with check (exists (select 1 from public.innings i
                 where i.id = innings_id and public.can_score_match(auth.uid(), i.match_id)));

-- ------------------------------------------------- avatars bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public" on storage.objects for select
  using (bucket_id = 'avatars');
drop policy if exists "own avatar write" on storage.objects;
create policy "own avatar write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own avatar update" on storage.objects;
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------- make yourself an admin
-- Run once, with your own email:
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where email = 'you@example.com'
-- on conflict (user_id, role) do nothing;
