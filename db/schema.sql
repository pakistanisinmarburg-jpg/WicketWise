-- WicketWise — core schema (run this in your Supabase project's SQL editor)
-- Single source of truth: public.deliveries. Every statistic is a derived view.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- roles
do $$ begin
  create type public.app_role as enum ('admin', 'scorer', 'captain', 'player');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "read own roles" on public.user_roles;
create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- players
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
grant select, insert, update, delete on public.players to authenticated;
grant select on public.players to anon;
grant all on public.players to service_role;
alter table public.players enable row level security;
drop policy if exists "players readable" on public.players;
create policy "players readable" on public.players for select using (true);
drop policy if exists "players insert" on public.players;
create policy "players insert" on public.players for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "players update" on public.players;
create policy "players update" on public.players for update to authenticated
  using (auth.uid() = created_by or auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
drop policy if exists "players delete" on public.players;
create policy "players delete" on public.players for delete to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------- teams
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
grant select, insert, update, delete on public.teams to authenticated;
grant select on public.teams to anon;
grant all on public.teams to service_role;
alter table public.teams enable row level security;
drop policy if exists "teams readable" on public.teams;
create policy "teams readable" on public.teams for select using (true);
drop policy if exists "teams insert" on public.teams;
create policy "teams insert" on public.teams for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "teams update" on public.teams;
create policy "teams update" on public.teams for update to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));
drop policy if exists "teams delete" on public.teams;
create policy "teams delete" on public.teams for delete to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  jersey_number int,
  primary key (team_id, player_id)
);
grant select, insert, update, delete on public.team_members to authenticated;
grant select on public.team_members to anon;
grant all on public.team_members to service_role;
alter table public.team_members enable row level security;
drop policy if exists "team members readable" on public.team_members;
create policy "team members readable" on public.team_members for select using (true);
drop policy if exists "team members write" on public.team_members;
create policy "team members write" on public.team_members for all to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and (t.created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))))
  with check (exists (select 1 from public.teams t where t.id = team_id and (t.created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))));

-- ---------------------------------------------------------------- matches
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  title text,
  venue text,
  match_date timestamptz not null default now(),
  overs_per_innings int not null default 20,
  team_a_id uuid not null references public.teams(id) on delete cascade,
  team_b_id uuid not null references public.teams(id) on delete cascade,
  toss_winner_team_id uuid references public.teams(id) on delete set null,
  toss_decision text check (toss_decision in ('bat','bowl')),
  status text not null default 'scheduled' check (status in ('scheduled','live','completed','abandoned')),
  result_text text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.matches to authenticated;
grant select on public.matches to anon;
grant all on public.matches to service_role;
alter table public.matches enable row level security;
drop policy if exists "matches readable" on public.matches;
create policy "matches readable" on public.matches for select using (true);
drop policy if exists "matches insert" on public.matches;
create policy "matches insert" on public.matches for insert to authenticated with check (auth.uid() = created_by);
drop policy if exists "matches update" on public.matches;
create policy "matches update" on public.matches for update to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));
drop policy if exists "matches delete" on public.matches;
create policy "matches delete" on public.matches for delete to authenticated
  using (auth.uid() = created_by or public.has_role(auth.uid(), 'admin'));

create table if not exists public.innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  innings_number int not null default 1,
  batting_team_id uuid not null references public.teams(id) on delete cascade,
  bowling_team_id uuid not null references public.teams(id) on delete cascade,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, innings_number)
);
grant select, insert, update, delete on public.innings to authenticated;
grant select on public.innings to anon;
grant all on public.innings to service_role;
alter table public.innings enable row level security;
drop policy if exists "innings readable" on public.innings;
create policy "innings readable" on public.innings for select using (true);
drop policy if exists "innings write" on public.innings;
create policy "innings write" on public.innings for all to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and (m.created_by = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'scorer'))))
  with check (exists (select 1 from public.matches m where m.id = match_id and (m.created_by = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'scorer'))));

-- ------------------------------------------------- deliveries (source of truth)
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references public.innings(id) on delete cascade,
  over_number int not null,
  ball_number int not null,
  striker_id uuid references public.players(id) on delete set null,
  non_striker_id uuid references public.players(id) on delete set null,
  bowler_id uuid references public.players(id) on delete set null,
  runs_off_bat int not null default 0,
  extra_type text check (extra_type in ('wide','noball','bye','legbye','penalty')),
  extra_runs int not null default 0,
  wicket_type text check (wicket_type in ('bowled','caught','lbw','run out','stumped','hit wicket','retired')),
  dismissed_player_id uuid references public.players(id) on delete set null,
  fielder_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists deliveries_innings_idx on public.deliveries(innings_id, over_number, ball_number);
grant select, insert, update, delete on public.deliveries to authenticated;
grant select on public.deliveries to anon;
grant all on public.deliveries to service_role;
alter table public.deliveries enable row level security;
drop policy if exists "deliveries readable" on public.deliveries;
create policy "deliveries readable" on public.deliveries for select using (true);
drop policy if exists "deliveries write" on public.deliveries;
create policy "deliveries write" on public.deliveries for all to authenticated
  using (exists (
    select 1 from public.innings i join public.matches m on m.id = i.match_id
    where i.id = innings_id and (m.created_by = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'scorer'))))
  with check (exists (
    select 1 from public.innings i join public.matches m on m.id = i.match_id
    where i.id = innings_id and (m.created_by = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'scorer'))));

-- ---------------------------------------------------------------- derived stats
-- Nothing below is ever written by hand. Every number comes from deliveries.

create or replace view public.innings_totals
with (security_invoker = true) as
select
  i.id as innings_id,
  i.match_id,
  i.innings_number,
  i.batting_team_id,
  i.bowling_team_id,
  coalesce(sum(d.runs_off_bat + d.extra_runs), 0)::int as runs,
  count(d.id) filter (where d.wicket_type is not null and d.wicket_type <> 'retired')::int as wickets,
  count(d.id) filter (where d.extra_type is null or d.extra_type in ('bye','legbye','penalty'))::int as legal_balls
from public.innings i
left join public.deliveries d on d.innings_id = i.id
group by i.id;
grant select on public.innings_totals to anon, authenticated;

create or replace view public.batting_stats
with (security_invoker = true) as
select
  p.id as player_id,
  p.full_name,
  count(distinct d.innings_id)::int as innings_played,
  coalesce(sum(d.runs_off_bat), 0)::int as runs,
  count(d.id) filter (where d.extra_type is null or d.extra_type = 'noball')::int as balls_faced,
  count(*) filter (where d.runs_off_bat = 4)::int as fours,
  count(*) filter (where d.runs_off_bat = 6)::int as sixes,
  (select count(*) from public.deliveries x
    where x.dismissed_player_id = p.id and x.wicket_type is not null and x.wicket_type <> 'retired')::int as dismissals
from public.players p
left join public.deliveries d on d.striker_id = p.id
group by p.id;
grant select on public.batting_stats to anon, authenticated;

create or replace view public.bowling_stats
with (security_invoker = true) as
select
  p.id as player_id,
  p.full_name,
  count(distinct d.innings_id)::int as innings_bowled,
  count(d.id) filter (where d.extra_type is null or d.extra_type in ('bye','legbye'))::int as legal_balls,
  coalesce(sum(d.runs_off_bat + case when d.extra_type in ('wide','noball','penalty') then d.extra_runs else 0 end), 0)::int as runs_conceded,
  count(*) filter (where d.wicket_type in ('bowled','caught','lbw','stumped','hit wicket'))::int as wickets
from public.players p
left join public.deliveries d on d.bowler_id = p.id
group by p.id;
grant select on public.bowling_stats to anon, authenticated;

-- optional: enable realtime for live scoring
alter publication supabase_realtime add table public.deliveries;
alter publication supabase_realtime add table public.matches;
