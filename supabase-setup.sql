-- ══════════════════════════════════════════════════════════════════
--  P.I.N.G. — Full Database & Auth Schema v2
--  Run once in: Supabase → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════

-- ── 1. User profiles (extends Supabase auth.users) ───────────────
create table if not exists ping_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  email         text,
  phone         text,
  username      text unique,
  role          text not null default 'resident'
                  check (role in ('resident','vanguard','admin')),
  village_id    text,
  village_name  text,
  village_key   text,
  language      text default 'en',
  trusted_device boolean not null default false,
  is_active     boolean not null default true,
  last_seen     timestamptz,
  created_at    timestamptz not null default now()
);

-- Add username column if upgrading from v1
alter table ping_users add column if not exists username text unique;
alter table ping_users add column if not exists email text;
alter table ping_users add column if not exists language text default 'en';
alter table ping_users alter column phone drop not null;
alter table ping_users alter column village_id drop not null;
alter table ping_users alter column village_name drop not null;
alter table ping_users alter column village_key drop not null;

-- ── 2. Villages registry ──────────────────────────────────────────
create table if not exists ping_villages (
  id          text primary key,
  name        text not null,
  access_key  text not null unique,
  region      text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into ping_villages (id, name, access_key, region) values
  ('v000', 'Test Community',       'TEST00', 'Test'),
  ('v001', 'Zamfara North Sector', 'PING01', 'Zamfara'),
  ('v002', 'Kaduna East Sector',   'PING02', 'Kaduna'),
  ('v003', 'Katsina West Sector',  'PING03', 'Katsina')
on conflict (id) do nothing;

-- ── 3. Messages / alerts ──────────────────────────────────────────
create table if not exists ping_messages (
  id          uuid primary key default gen_random_uuid(),
  village_id  text not null,
  user_id     uuid references ping_users(id) on delete set null,
  username    text not null,
  message     text not null,
  type        text not null default 'MSG'
                check (type in ('MSG','SOS','ALL_CLEAR','SYSTEM')),
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ping_messages_village
  on ping_messages(village_id, created_at desc);

-- ── 4. SOS events ─────────────────────────────────────────────────
create table if not exists ping_sos_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references ping_users(id) on delete set null,
  village_id  text not null,
  username    text not null,
  phone       text,
  lat         double precision,
  lng         double precision,
  status      text not null default 'active'
                check (status in ('active','resolved','false_alarm')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ── 5. Row Level Security ─────────────────────────────────────────

alter table ping_users enable row level security;

-- Allow users to view own profile
drop policy if exists "Users can view own profile" on ping_users;
create policy "Users can view own profile"
  on ping_users for select
  using (auth.uid() = id);

-- Allow users to search other users (for @mention feature)
drop policy if exists "Users can search all profiles" on ping_users;
create policy "Users can search all profiles"
  on ping_users for select
  using (auth.uid() is not null);

drop policy if exists "Users can update own profile" on ping_users;
create policy "Users can update own profile"
  on ping_users for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on ping_users;
create policy "Users can insert own profile"
  on ping_users for insert
  with check (auth.uid() = id);

alter table ping_villages enable row level security;

drop policy if exists "Anyone can read villages" on ping_villages;
create policy "Anyone can read villages"
  on ping_villages for select using (true);

alter table ping_messages enable row level security;

drop policy if exists "Village members can read messages" on ping_messages;
create policy "Village members can read messages"
  on ping_messages for select using (true);

drop policy if exists "Authenticated users can insert messages" on ping_messages;
create policy "Authenticated users can insert messages"
  on ping_messages for insert
  with check (auth.uid() is not null);

alter table ping_sos_events enable row level security;

drop policy if exists "Village members can read SOS events" on ping_sos_events;
create policy "Village members can read SOS events"
  on ping_sos_events for select using (true);

drop policy if exists "Authenticated users can insert SOS" on ping_sos_events;
create policy "Authenticated users can insert SOS"
  on ping_sos_events for insert
  with check (auth.uid() is not null);

-- ── 6. Village key validation function ───────────────────────────
create or replace function validate_village_key(key text)
returns json language sql security definer as $$
  select json_build_object(
    'valid',        (count(*) > 0),
    'village_id',   max(id),
    'village_name', max(name)
  )
  from ping_villages
  where access_key = upper(trim(key))
    and is_active = true;
$$;

-- ── 7. Realtime — IMPORTANT: enable for chat ──────────────────────
-- Run these in Supabase Dashboard → Database → Replication
-- OR uncomment if your Supabase version supports it here:
alter publication supabase_realtime add table ping_messages;
alter publication supabase_realtime add table ping_sos_events;

-- ── 8. Auto-cleanup: delete messages older than 7 days ────────────
create or replace function delete_old_ping_messages()
returns void language sql as $$
  delete from ping_messages where created_at < now() - interval '7 days';
$$;

-- ── 7. Direct Messages ────────────────────────────────────────────
create table if not exists ping_direct_messages (
  id              uuid primary key default gen_random_uuid(),
  from_username   text not null,
  to_username     text not null,
  from_user_id    uuid references ping_users(id) on delete set null,
  message         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ping_dm_participants
  on ping_direct_messages(from_username, to_username, created_at desc);

-- RLS: users can only read DMs they're part of
alter table ping_direct_messages enable row level security;

create policy if not exists "users_see_own_dms"
  on ping_direct_messages for select
  using (
    from_username = (select username from ping_users where id = auth.uid())
    or
    to_username   = (select username from ping_users where id = auth.uid())
  );

create policy if not exists "users_send_dms"
  on ping_direct_messages for insert
  with check (
    from_username = (select username from ping_users where id = auth.uid())
  );
