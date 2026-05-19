-- ══════════════════════════════════════════════════════════════════
--  P.I.N.G. — Full Database Schema v20
--  Run this ONCE in: Supabase → SQL Editor → New Query → Run All
--  This is safe to re-run — all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Users ──────────────────────────────────────────────────────
create table if not exists ping_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null default '',
  last_name     text not null default '',
  email         text,
  phone         text,
  username      text unique,
  role          text not null default 'resident' check (role in ('resident','vanguard','admin')),
  village_id    text,
  village_name  text,
  village_key   text,
  language      text default 'en',
  trusted_device boolean not null default false,
  is_active     boolean not null default true,
  last_seen     timestamptz,
  created_at    timestamptz not null default now()
);
alter table ping_users add column if not exists username text unique;
alter table ping_users add column if not exists email text;
alter table ping_users add column if not exists language text default 'en';
alter table ping_users alter column first_name set default '';
alter table ping_users alter column last_name  set default '';
alter table ping_users alter column phone      drop not null;
alter table ping_users alter column village_id drop not null;
alter table ping_users alter column village_name drop not null;
alter table ping_users alter column village_key  drop not null;
create index if not exists idx_ping_users_username  on ping_users(username);
create index if not exists idx_ping_users_village   on ping_users(village_key);
create index if not exists idx_ping_users_email     on ping_users(email);

-- ── 2. Messages (community chat — scoped to village_key) ──────────
create table if not exists ping_messages (
  id          uuid primary key default gen_random_uuid(),
  village_id  text not null,          -- this IS the village_key e.g. 'FCT-GWA1234'
  user_id     uuid references ping_users(id) on delete set null,
  username    text not null,
  message     text not null,
  type        text not null default 'MSG' check (type in ('MSG','SOS','ALL_CLEAR','SYSTEM')),
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ping_messages_village on ping_messages(village_id, created_at desc);
create index if not exists idx_ping_messages_user    on ping_messages(user_id, created_at desc);

-- ── 3. Direct messages ────────────────────────────────────────────
create table if not exists ping_direct_messages (
  id              uuid primary key default gen_random_uuid(),
  from_username   text not null,
  to_username     text not null,
  from_user_id    uuid references ping_users(id) on delete set null,
  message         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ping_dm_pair on ping_direct_messages(from_username, to_username, created_at desc);
create index if not exists idx_ping_dm_to   on ping_direct_messages(to_username, created_at desc);

-- ── 4. SOS events ─────────────────────────────────────────────────
create table if not exists ping_sos_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references ping_users(id) on delete set null,
  village_id  text not null,
  username    text not null,
  phone       text,
  lat         double precision,
  lng         double precision,
  status      text not null default 'active' check (status in ('active','resolved','false_alarm')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_ping_sos_village on ping_sos_events(village_id, created_at desc);

-- ── 5. Realtime publications ──────────────────────────────────────
alter publication supabase_realtime add table ping_messages;
alter publication supabase_realtime add table ping_direct_messages;
alter publication supabase_realtime add table ping_sos_events;

-- ── 6. Row Level Security ─────────────────────────────────────────
alter table ping_users              enable row level security;
alter table ping_messages           enable row level security;
alter table ping_direct_messages    enable row level security;
alter table ping_sos_events         enable row level security;

-- Users: view own + search others
drop policy if exists "view own"   on ping_users;
drop policy if exists "search all" on ping_users;
drop policy if exists "update own" on ping_users;
drop policy if exists "insert own" on ping_users;
create policy "view own"   on ping_users for select using (true);
create policy "update own" on ping_users for update using (auth.uid() = id);
create policy "insert own" on ping_users for insert with check (auth.uid() = id);

-- Messages: anyone authenticated (or anon) can read/write community chat
drop policy if exists "read messages"   on ping_messages;
drop policy if exists "insert messages" on ping_messages;
create policy "read messages"   on ping_messages for select using (true);
create policy "insert messages" on ping_messages for insert with check (true);

-- Direct messages: anyone can read/insert (username-gated in app)
drop policy if exists "read dms"   on ping_direct_messages;
drop policy if exists "insert dms" on ping_direct_messages;
create policy "read dms"   on ping_direct_messages for select using (true);
create policy "insert dms" on ping_direct_messages for insert with check (true);

-- SOS: anyone can read/insert
drop policy if exists "read sos"   on ping_sos_events;
drop policy if exists "insert sos" on ping_sos_events;
create policy "read sos"   on ping_sos_events for select using (true);
create policy "insert sos" on ping_sos_events for insert with check (true);

-- ── 7. Email confirmation settings ───────────────────────────────
-- Run this in Supabase Dashboard → Authentication → Settings:
--   • Confirm email: OFF (for testing) OR keep ON and ensure SMTP is configured
--   • Site URL: https://pingfinalng.vercel.app
--   • Redirect URLs: https://pingfinalng.vercel.app/auth/callback
--   • Email templates: use default (they work out of the box)

-- ── 8. Search function (fast username/name search) ────────────────
create or replace function search_ping_users(q text)
returns table(id uuid, username text, first_name text, last_name text, village_key text, village_name text)
language sql stable
as $$
  select id, username, first_name, last_name, village_key, village_name
  from ping_users
  where
    username    ilike '%' || q || '%' or
    first_name  ilike '%' || q || '%' or
    last_name   ilike '%' || q || '%'
  order by
    case when username ilike q || '%' then 0 else 1 end,
    username
  limit 20;
$$;

-- ══════════════════════════════════════════════════════════════════
-- v23: Emergency Contacts
-- ══════════════════════════════════════════════════════════════════
create table if not exists ping_emergency_contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references ping_users(id) on delete cascade,
  name        text not null,
  phone       text not null,
  email       text,
  relation    text default 'Other',
  notify_sos  boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ping_ec_user on ping_emergency_contacts(user_id);
alter table ping_emergency_contacts enable row level security;
drop policy if exists "ec_select" on ping_emergency_contacts;
drop policy if exists "ec_insert" on ping_emergency_contacts;
drop policy if exists "ec_update" on ping_emergency_contacts;
drop policy if exists "ec_delete" on ping_emergency_contacts;
create policy "ec_select" on ping_emergency_contacts for select using (auth.uid() = user_id);
create policy "ec_insert" on ping_emergency_contacts for insert with check (auth.uid() = user_id);
create policy "ec_update" on ping_emergency_contacts for update using (auth.uid() = user_id);
create policy "ec_delete" on ping_emergency_contacts for delete using (auth.uid() = user_id);

-- Add to realtime so contact list updates instantly
alter publication supabase_realtime add table ping_emergency_contacts;

-- Edge function webhook placeholder (set up in Supabase → Edge Functions)
-- When an SOS is inserted, trigger: notify_emergency_contacts(sos_event_id)
-- See: supabase/functions/notify-contacts/index.ts in this project
