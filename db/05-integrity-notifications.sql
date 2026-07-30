-- WicketWise · 05 · Verification chain, corrections, audit log & notifications
-- Run after db/04-scoring-engine.sql.

/* ------------------------------------------------- match verification chain */
alter table public.matches
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists admin_verified_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_verified_at timestamptz,
  add column if not exists requires_admin_verification boolean not null default false,
  add column if not exists stats_official boolean not null default false;

-- Stats become official when the captain verifies, unless the match is flagged
-- for the extra admin step — then only admin verification makes them official.
create or replace function public.sync_stats_official()
returns trigger
language plpgsql
as $$
begin
  new.stats_official := case
    when new.requires_admin_verification then new.admin_verified_at is not null
    else new.verified_at is not null
  end;
  return new;
end $$;

drop trigger if exists trg_stats_official on public.matches;
create trigger trg_stats_official
  before insert or update on public.matches
  for each row execute function public.sync_stats_official();

/* ------------------------------------------------------------- audit logs */
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  match_id uuid references public.matches(id) on delete set null,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_table, entity_id);
create index if not exists audit_logs_match_idx on public.audit_logs (match_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

-- Admins see everything; a captain or scorer can see the trail for their own actions.
drop policy if exists "read audit logs" on public.audit_logs;
create policy "read audit logs" on public.audit_logs
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or actor_id = auth.uid());

drop policy if exists "append audit logs" on public.audit_logs;
create policy "append audit logs" on public.audit_logs
  for insert to authenticated with check (actor_id = auth.uid() or actor_id is null);

-- Every delivery edit or removal on a completed match is written to the trail
-- automatically, so nothing can be changed silently.
create or replace function public.audit_delivery_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match uuid;
begin
  select i.match_id into v_match
    from public.innings i
   where i.id = coalesce(new.innings_id, old.innings_id);

  insert into public.audit_logs (actor_id, action, entity_table, entity_id, match_id, before_value, after_value)
  values (
    auth.uid(),
    tg_op,
    'deliveries',
    coalesce(new.id, old.id),
    v_match,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_audit_delivery on public.deliveries;
create trigger trg_audit_delivery
  after update or delete on public.deliveries
  for each row execute function public.audit_delivery_change();

/* --------------------------------------------------- correction requests v2 */
alter table public.correction_requests
  add column if not exists field text,
  add column if not exists current_value text,
  add column if not exists requested_value text,
  add column if not exists applied_at timestamptz,
  add column if not exists review_note text;

/* ----------------------------------------------------- notification helpers */
create or replace function public.notify_user(
  _user_id uuid, _kind text, _title text, _body text, _link text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _user_id is null then return; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  values (_user_id, _kind, _title, _body, _link);
end $$;

create or replace function public.notify_admins(_kind text, _title text, _body text, _link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  select ur.user_id, _kind, _title, _body, _link
    from public.user_roles ur
   where ur.role = 'admin';
end $$;

/* ------------------------------------------------ squad selection two-sided */
create or replace function public.notify_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team text;
  v_player_user uuid;
  v_player text;
begin
  select name into v_team from public.teams where id = new.team_id;
  select user_id, full_name into v_player_user, v_player from public.players where id = new.player_id;

  if tg_op = 'INSERT' then
    perform public.notify_user(
      v_player_user, 'team_invitation',
      'Squad invitation from ' || coalesce(v_team, 'a team'),
      'You have been selected. Accept or decline from your profile.',
      '/teams/' || new.team_id
    );
  elsif new.status <> old.status and new.status in ('accepted', 'declined') then
    perform public.notify_user(
      new.invited_by, 'selection_response',
      coalesce(v_player, 'A player') || ' ' || new.status || ' your invitation',
      coalesce(v_team, 'Your team') || ' squad update.',
      '/teams/' || new.team_id
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_invitation on public.team_invitations;
create trigger trg_notify_invitation
  after insert or update on public.team_invitations
  for each row execute function public.notify_invitation();

/* ---------------------------------------------------------- captain requests */
create or replace function public.notify_captain_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'captain_request', 'New captain request',
      'A player has requested captain access.', '/admin'
    );
  elsif new.status <> old.status and new.status in ('approved', 'rejected') then
    perform public.notify_user(
      new.user_id, 'captain_request_reviewed',
      'Captain request ' || new.status,
      case when new.status = 'approved'
        then 'Captain tools are now unlocked in your navigation.'
        else 'An admin reviewed your request.' end,
      '/profile'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_captain_request on public.captain_requests;
create trigger trg_notify_captain_request
  after insert or update on public.captain_requests
  for each row execute function public.notify_captain_request();

/* ------------------------------------------------- competition approvals */
create or replace function public.notify_competition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := tg_table_name;
  v_link text := '/' || tg_table_name || '/' || new.id;
begin
  if tg_table_name = 'series' then v_link := '/series/' || new.id; end if;
  if tg_table_name = 'tournaments' then v_link := '/tournaments/' || new.id; end if;

  if new.approval_status = 'submitted'
     and (tg_op = 'INSERT' or new.approval_status is distinct from old.approval_status) then
    perform public.notify_admins(
      'competition_submitted',
      'A ' || v_kind || ' needs approval',
      new.name || ' was submitted for review.', '/admin'
    );
  elsif tg_op = 'UPDATE'
        and new.approval_status is distinct from old.approval_status
        and new.approval_status in ('approved', 'rejected', 'changes_requested') then
    perform public.notify_user(
      new.created_by, 'competition_reviewed',
      new.name || ' was ' || replace(new.approval_status, '_', ' '),
      coalesce(new.review_note, 'Reviewed by an admin.'), v_link
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_series on public.series;
create trigger trg_notify_series
  after insert or update on public.series
  for each row execute function public.notify_competition();

drop trigger if exists trg_notify_tournament on public.tournaments;
create trigger trg_notify_tournament
  after insert or update on public.tournaments
  for each row execute function public.notify_competition();

/* --------------------------------------------- match lifecycle notifications */
create or replace function public.notify_match_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := coalesce(new.title, 'Match');
  v_link text := '/matches/' || new.id;
begin
  if new.state is distinct from old.state then
    if new.state = 'COMPLETED' then
      perform public.notify_user(new.created_by, 'match_result',
        v_title || ' is awaiting your verification',
        'Check the scorecard, then verify it to make the statistics official.', v_link);
    elsif new.state = 'VERIFIED' then
      perform public.notify_user(new.submitted_by, 'match_verified',
        v_title || ' has been verified',
        'The captain accepted the scorecard you submitted.', v_link);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_match on public.matches;
create trigger trg_notify_match
  after update on public.matches
  for each row execute function public.notify_match_lifecycle();

/* ------------------------------------------- correction request notifications */
create or replace function public.notify_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins('correction_filed', 'Correction request filed',
      'A completed match needs a data correction reviewed.', '/admin');
  elsif new.status <> old.status then
    perform public.notify_user(new.requested_by, 'correction_reviewed',
      'Your correction request was ' || new.status,
      coalesce(new.review_note, 'Reviewed by an admin.'),
      '/matches/' || new.match_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_correction on public.correction_requests;
create trigger trg_notify_correction
  after insert or update on public.correction_requests
  for each row execute function public.notify_correction();

/* ---------------------------------------------------------------- realtime */
do $$
begin
  begin
    alter publication supabase_realtime add table public.audit_logs;
  exception when duplicate_object then null;
  end;
end $$;
