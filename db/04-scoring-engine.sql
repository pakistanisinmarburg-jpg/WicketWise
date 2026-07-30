-- WicketWise · 04 · Live scoring engine
-- Run after db/schema.sql, db/02-roles-and-profiles.sql and db/03-teams-competitions.sql.

/* ------------------------------------------------------------ deliveries */
alter table public.deliveries
  add column if not exists fielder2_id uuid references public.players(id) on delete set null,
  add column if not exists scored_by uuid references auth.users(id) on delete set null;

-- Extra wicket types required by the scoring engine.
do $$
begin
  begin
    alter table public.deliveries drop constraint if exists deliveries_wicket_type_check;
  exception when others then null;
  end;
  alter table public.deliveries
    add constraint deliveries_wicket_type_check
    check (wicket_type is null or wicket_type in (
      'bowled','caught','lbw','run out','stumped','hit wicket',
      'retired','retired out','obstructing the field'
    ));
end $$;

create index if not exists deliveries_innings_seq_idx
  on public.deliveries (innings_id, over_number, ball_number);
create index if not exists deliveries_fielder_idx on public.deliveries (fielder_id);
create index if not exists deliveries_scored_by_idx on public.deliveries (scored_by);

/* ------------------------------------ scoring permission auto-expiry on complete */
create or replace function public.expire_scoring_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed','abandoned') or new.state in ('COMPLETED','VERIFIED','ARCHIVED') then
    update public.scoring_permissions
       set revoked = true
     where match_id = new.id and revoked = false;
  end if;
  return new;
end $$;

drop trigger if exists trg_expire_scoring on public.matches;
create trigger trg_expire_scoring
  after update on public.matches
  for each row execute function public.expire_scoring_permissions();

/* ----------------------------------------------------------- notifications */
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter table public.notifications enable row level security;

drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "update own notifications" on public.notifications;
create policy "update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid());

drop policy if exists "signed in users can notify" on public.notifications;
create policy "signed in users can notify" on public.notifications
  for insert to authenticated with check (true);

-- Notify a player when they are granted scoring rights for a match.
create or replace function public.notify_scorer_granted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link)
  values (
    new.user_id,
    'scorer_granted',
    'You are the scorer for a match',
    'You now have live-scoring access. It expires when the match is completed.',
    '/matches/' || new.match_id || '/score'
  );
  return new;
end $$;

drop trigger if exists trg_notify_scorer on public.scoring_permissions;
create trigger trg_notify_scorer
  after insert on public.scoring_permissions
  for each row execute function public.notify_scorer_granted();

/* ------------------------------------------------------- correction requests */
create table if not exists public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  delivery_id uuid references public.deliveries(id) on delete set null,
  requested_by uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  proposed jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update on public.correction_requests to authenticated;
grant all on public.correction_requests to service_role;

alter table public.correction_requests enable row level security;

drop policy if exists "read corrections" on public.correction_requests;
create policy "read corrections" on public.correction_requests
  for select to authenticated
  using (requested_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "request corrections" on public.correction_requests;
create policy "request corrections" on public.correction_requests
  for insert to authenticated with check (requested_by = auth.uid());

drop policy if exists "admins review corrections" on public.correction_requests;
create policy "admins review corrections" on public.correction_requests
  for update to authenticated using (public.has_role(auth.uid(), 'admin'));

/* ------------------------------------------------------------- realtime */
alter publication supabase_realtime add table public.notifications;
