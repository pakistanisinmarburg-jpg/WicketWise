-- WicketWise — Phase 4 & 5: teams, selection, match lifecycle, series & tournaments.
-- Run AFTER schema.sql and 02-roles-and-profiles.sql.
-- Everything numeric here is DERIVED from deliveries. Nothing is typed in by hand.

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.invite_status as enum ('pending','accepted','declined','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.match_state as enum
    ('DRAFT','SUBMITTED','APPROVED','SQUAD_SELECTION','READY','TOSS','LIVE','COMPLETED','VERIFIED','ARCHIVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.approval_status as enum ('draft','submitted','approved','rejected','changes_requested');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tournament_format as enum ('league','knockout','group_knockout');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- teams
alter table public.teams
  add column if not exists description text,
  add column if not exists city text,
  add column if not exists country text,
  add column if not exists vice_captain_player_id uuid references public.players(id) on delete set null,
  add column if not exists primary_color text default '#0f7a4d',
  add column if not exists secondary_color text default '#d9a441',
  add column if not exists founded_year int,
  add column if not exists is_active boolean not null default true;

-- --------------------------------------------------- two-sided selection
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  status public.invite_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists team_invitations_pending_uniq
  on public.team_invitations(team_id, player_id) where status = 'pending';
grant select, insert, update, delete on public.team_invitations to authenticated;
grant select on public.team_invitations to anon;
grant all on public.team_invitations to service_role;
alter table public.team_invitations enable row level security;

drop policy if exists "invitations readable" on public.team_invitations;
create policy "invitations readable" on public.team_invitations for select using (true);

drop policy if exists "invitations created by team managers" on public.team_invitations;
create policy "invitations created by team managers" on public.team_invitations
  for insert to authenticated with check (
    exists (select 1 from public.teams t where t.id = team_id
            and (t.created_by = auth.uid() or public.has_role(auth.uid(), 'admin')))
  );

-- The invited player answers; the captain may cancel.
drop policy if exists "invitations answered by player or manager" on public.team_invitations;
create policy "invitations answered by player or manager" on public.team_invitations
  for update to authenticated using (
    exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid())
    or exists (select 1 from public.teams t where t.id = team_id
               and (t.created_by = auth.uid() or public.has_role(auth.uid(), 'admin')))
  );

-- Accepting is the ONLY way a player lands on a roster.
create or replace function public.handle_invitation_response()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.team_members (team_id, player_id)
    values (new.team_id, new.player_id)
    on conflict (team_id, player_id) do nothing;
    new.responded_at := now();
  elsif new.status <> old.status then
    new.responded_at := now();
  end if;
  return new;
end $$;
drop trigger if exists on_invitation_response on public.team_invitations;
create trigger on_invitation_response before update on public.team_invitations
  for each row execute function public.handle_invitation_response();

-- ---------------------------------------------------------------- series
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  match_count int not null default 3,
  start_date date,
  end_date date,
  points_per_win int not null default 2,
  points_per_tie int not null default 1,
  approval_status public.approval_status not null default 'draft',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.series to authenticated;
grant select on public.series to anon;
grant all on public.series to service_role;
alter table public.series enable row level security;

drop policy if exists "approved series are public" on public.series;
create policy "approved series are public" on public.series for select using (
  approval_status = 'approved' or created_by = auth.uid() or public.has_role(auth.uid(), 'admin')
);
drop policy if exists "captains create series" on public.series;
create policy "captains create series" on public.series for insert to authenticated
  with check (created_by = auth.uid()
    and (public.has_role(auth.uid(), 'captain') or public.has_role(auth.uid(), 'admin')));
drop policy if exists "series owner or admin updates" on public.series;
create policy "series owner or admin updates" on public.series for update to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "series owner or admin deletes" on public.series;
create policy "series owner or admin deletes" on public.series for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------ tournaments
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  description text,
  organizer text,
  start_date date,
  end_date date,
  venue text,
  format public.tournament_format not null default 'league',
  team_count int not null default 8,
  rules text,
  points_per_win int not null default 2,
  points_per_tie int not null default 1,
  points_per_loss int not null default 0,
  approval_status public.approval_status not null default 'draft',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tournaments to authenticated;
grant select on public.tournaments to anon;
grant all on public.tournaments to service_role;
alter table public.tournaments enable row level security;

drop policy if exists "approved tournaments are public" on public.tournaments;
create policy "approved tournaments are public" on public.tournaments for select using (
  approval_status = 'approved' or created_by = auth.uid() or public.has_role(auth.uid(), 'admin')
);
drop policy if exists "captains create tournaments" on public.tournaments;
create policy "captains create tournaments" on public.tournaments for insert to authenticated
  with check (created_by = auth.uid()
    and (public.has_role(auth.uid(), 'captain') or public.has_role(auth.uid(), 'admin')));
drop policy if exists "tournament owner or admin updates" on public.tournaments;
create policy "tournament owner or admin updates" on public.tournaments for update to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists "tournament owner or admin deletes" on public.tournaments;
create policy "tournament owner or admin deletes" on public.tournaments for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

create table if not exists public.tournament_teams (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  group_name text,
  primary key (tournament_id, team_id)
);
grant select, insert, update, delete on public.tournament_teams to authenticated;
grant select on public.tournament_teams to anon;
grant all on public.tournament_teams to service_role;
alter table public.tournament_teams enable row level security;
drop policy if exists "tournament teams readable" on public.tournament_teams;
create policy "tournament teams readable" on public.tournament_teams for select using (true);
drop policy if exists "tournament teams write" on public.tournament_teams;
create policy "tournament teams write" on public.tournament_teams for all to authenticated
  using (exists (select 1 from public.tournaments t where t.id = tournament_id
                 and (t.created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))))
  with check (exists (select 1 from public.tournaments t where t.id = tournament_id
                 and (t.created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))));

-- ------------------------------------------------- match lifecycle + config
alter table public.matches
  add column if not exists match_type text default 'friendly',
  add column if not exists start_time text,
  add column if not exists format text default 'T20',
  add column if not exists ball_type text default 'leather',
  add column if not exists innings_count int not null default 2,
  add column if not exists series_id uuid references public.series(id) on delete set null,
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null,
  add column if not exists stage text,
  add column if not exists group_name text,
  add column if not exists state public.match_state not null default 'DRAFT',
  add column if not exists review_note text;

-- Backfill state for matches created before the lifecycle existed.
update public.matches set state = case
  when status = 'live' then 'LIVE'::public.match_state
  when status = 'completed' then 'COMPLETED'::public.match_state
  when status = 'abandoned' then 'ARCHIVED'::public.match_state
  else 'READY'::public.match_state end
where state = 'DRAFT' and status <> 'scheduled';

-- The state machine. No skipping steps; admins may step back one stage.
create or replace function public.enforce_match_state()
returns trigger language plpgsql set search_path = public as $$
declare
  allowed public.match_state[];
begin
  if new.state = old.state then return new; end if;

  allowed := case old.state
    when 'DRAFT'            then array['SUBMITTED']
    when 'SUBMITTED'        then array['APPROVED','DRAFT']
    when 'APPROVED'         then array['SQUAD_SELECTION']
    when 'SQUAD_SELECTION'  then array['READY']
    when 'READY'            then array['TOSS']
    when 'TOSS'             then array['LIVE']
    when 'LIVE'             then array['COMPLETED']
    when 'COMPLETED'        then array['VERIFIED']
    when 'VERIFIED'         then array['ARCHIVED']
    else array[]::text[]
  end::public.match_state[];

  -- Only admins can approve a submitted match or reject it back to draft.
  if old.state = 'SUBMITTED' and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an admin can review a submitted match';
  end if;

  if not (new.state = any(allowed)) then
    raise exception 'Invalid match transition % -> %', old.state, new.state;
  end if;

  new.status := case new.state
    when 'LIVE' then 'live'
    when 'COMPLETED' then 'completed'
    when 'VERIFIED' then 'completed'
    when 'ARCHIVED' then 'completed'
    else 'scheduled' end;

  return new;
end $$;
drop trigger if exists on_match_state_change on public.matches;
create trigger on_match_state_change before update of state on public.matches
  for each row execute function public.enforce_match_state();

-- Scoring is only legal while the match is actually live.
create or replace function public.can_score_match(_user_id uuid, _match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.matches m
    where m.id = _match_id
      and m.state not in ('COMPLETED','VERIFIED','ARCHIVED')
      and (
        m.created_by = _user_id
        or public.has_role(_user_id, 'admin')
        or exists (select 1 from public.scoring_permissions sp
                   where sp.match_id = _match_id and sp.user_id = _user_id and sp.revoked = false)
      )
  )
$$;

-- ---------------------------------------------------------- derived results
create or replace view public.match_results
with (security_invoker = true) as
with per_team as (
  select it.match_id, it.batting_team_id as team_id, it.bowling_team_id as opponent_id,
         sum(it.runs)::int as runs_scored, sum(it.legal_balls)::int as balls_faced,
         sum(it.wickets)::int as wickets_lost
  from public.innings_totals it
  group by it.match_id, it.batting_team_id, it.bowling_team_id
)
select
  m.id as match_id,
  m.series_id,
  m.tournament_id,
  m.state,
  a.team_id as team_a_id,
  b.team_id as team_b_id,
  coalesce(a.runs_scored, 0) as team_a_runs,
  coalesce(b.runs_scored, 0) as team_b_runs,
  coalesce(a.balls_faced, 0) as team_a_balls,
  coalesce(b.balls_faced, 0) as team_b_balls,
  case
    when m.state not in ('COMPLETED','VERIFIED','ARCHIVED') then null
    when a.runs_scored is null or b.runs_scored is null then null
    when a.runs_scored > b.runs_scored then a.team_id
    when b.runs_scored > a.runs_scored then b.team_id
    else null
  end as winner_team_id,
  case
    when m.state not in ('COMPLETED','VERIFIED','ARCHIVED') then 'pending'
    when a.runs_scored is null or b.runs_scored is null then 'no_result'
    when a.runs_scored = b.runs_scored then 'tie'
    else 'decided'
  end as outcome
from public.matches m
left join per_team a on a.match_id = m.id and a.team_id = m.team_a_id
left join per_team b on b.match_id = m.id and b.team_id = m.team_b_id;
grant select on public.match_results to anon, authenticated;

-- One row per team per completed match — the base for every table below.
create or replace view public.team_match_lines
with (security_invoker = true) as
select r.match_id, r.series_id, r.tournament_id, r.team_a_id as team_id, r.team_b_id as opponent_id,
       r.team_a_runs as runs_for, r.team_b_runs as runs_against,
       r.team_a_balls as balls_faced, r.team_b_balls as balls_bowled,
       r.winner_team_id, r.outcome
from public.match_results r
union all
select r.match_id, r.series_id, r.tournament_id, r.team_b_id, r.team_a_id,
       r.team_b_runs, r.team_a_runs, r.team_b_balls, r.team_a_balls,
       r.winner_team_id, r.outcome
from public.match_results r;
grant select on public.team_match_lines to anon, authenticated;

create or replace view public.team_stats
with (security_invoker = true) as
select
  t.id as team_id,
  t.name,
  count(l.match_id) filter (where l.outcome <> 'pending')::int as played,
  count(l.match_id) filter (where l.winner_team_id = t.id)::int as won,
  count(l.match_id) filter (where l.outcome = 'decided' and l.winner_team_id <> t.id)::int as lost,
  count(l.match_id) filter (where l.outcome = 'tie')::int as tied,
  count(l.match_id) filter (where l.outcome = 'no_result')::int as no_result,
  coalesce(sum(l.runs_for) filter (where l.outcome <> 'pending'), 0)::int as runs_for,
  coalesce(max(l.runs_for) filter (where l.outcome <> 'pending'), 0)::int as highest_score,
  coalesce(min(l.runs_for) filter (where l.outcome <> 'pending'), 0)::int as lowest_score,
  coalesce(sum(l.balls_faced) filter (where l.outcome <> 'pending'), 0)::int as balls_faced,
  coalesce(sum(l.balls_bowled) filter (where l.outcome <> 'pending'), 0)::int as balls_bowled,
  round(
    case when count(l.match_id) filter (where l.outcome <> 'pending') = 0 then 0
    else 100.0 * count(l.match_id) filter (where l.winner_team_id = t.id)
         / count(l.match_id) filter (where l.outcome <> 'pending') end, 1) as win_pct
from public.teams t
left join public.team_match_lines l on l.team_id = t.id
group by t.id, t.name;
grant select on public.team_stats to anon, authenticated;

create or replace view public.series_standings
with (security_invoker = true) as
select
  s.id as series_id,
  l.team_id,
  count(l.match_id) filter (where l.outcome <> 'pending')::int as played,
  count(l.match_id) filter (where l.winner_team_id = l.team_id)::int as won,
  count(l.match_id) filter (where l.outcome = 'decided' and l.winner_team_id <> l.team_id)::int as lost,
  count(l.match_id) filter (where l.outcome = 'tie')::int as tied,
  count(l.match_id) filter (where l.outcome = 'no_result')::int as no_result,
  (count(l.match_id) filter (where l.winner_team_id = l.team_id) * s.points_per_win
   + count(l.match_id) filter (where l.outcome = 'tie') * s.points_per_tie)::int as points,
  coalesce(sum(l.runs_for), 0)::int as runs_for,
  round(case when coalesce(sum(l.balls_faced), 0) = 0 then 0
        else 6.0 * sum(l.runs_for) / sum(l.balls_faced) end, 2) as run_rate
from public.series s
join public.team_match_lines l on l.series_id = s.id
group by s.id, l.team_id;
grant select on public.series_standings to anon, authenticated;

-- Points table: P, W, L, NR, Pts, NRR — computed, never editable.
create or replace view public.tournament_points
with (security_invoker = true) as
select
  t.id as tournament_id,
  tt.team_id,
  tt.group_name,
  count(l.match_id) filter (where l.outcome <> 'pending')::int as played,
  count(l.match_id) filter (where l.winner_team_id = tt.team_id)::int as won,
  count(l.match_id) filter (where l.outcome = 'decided' and l.winner_team_id <> tt.team_id)::int as lost,
  count(l.match_id) filter (where l.outcome = 'tie')::int as tied,
  count(l.match_id) filter (where l.outcome = 'no_result')::int as no_result,
  (coalesce(count(l.match_id) filter (where l.winner_team_id = tt.team_id), 0) * t.points_per_win
   + coalesce(count(l.match_id) filter (where l.outcome = 'tie'), 0) * t.points_per_tie
   + coalesce(count(l.match_id) filter (where l.outcome = 'decided' and l.winner_team_id <> tt.team_id), 0) * t.points_per_loss
  )::int as points,
  coalesce(sum(l.runs_for), 0)::int as runs_for,
  coalesce(sum(l.runs_against), 0)::int as runs_against,
  round(
    case when coalesce(sum(l.balls_faced), 0) = 0 or coalesce(sum(l.balls_bowled), 0) = 0 then 0
    else (6.0 * sum(l.runs_for) / sum(l.balls_faced)) - (6.0 * sum(l.runs_against) / sum(l.balls_bowled))
    end, 3) as nrr
from public.tournaments t
join public.tournament_teams tt on tt.tournament_id = t.id
left join public.team_match_lines l on l.tournament_id = t.id and l.team_id = tt.team_id
group by t.id, tt.team_id, tt.group_name;
grant select on public.tournament_points to anon, authenticated;

alter publication supabase_realtime add table public.team_invitations;
