create table if not exists ping_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  first_name    text not null default '',
  last_name     text not null default '',
  email         text,
  phone         text,
  username      text unique,
  role          text not null default 'resident',
  village_id    text,
  village_name  text,
  village_key   text,
  language      text default 'en',
  created_at    timestamptz not null default now()
);

create table if not exists ping_messages (
  id          uuid primary key default gen_random_uuid(),
  village_id  text not null,
  user_id     uuid references ping_users(id) on delete set null,
  username    text not null,
  message     text not null,
  type        text not null default 'MSG',
  lat         double precision,
  lng         double precision,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ping_messages_village on ping_messages(village_id, created_at desc);

create table if not exists ping_direct_messages (
  id              uuid primary key default gen_random_uuid(),
  from_username   text not null,
  to_username     text not null,
  from_user_id    uuid references ping_users(id) on delete set null,
  message         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ping_dm_to on ping_direct_messages(to_username, created_at desc);

create table if not exists ping_sos_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references ping_users(id) on delete set null,
  village_id  text not null,
  username    text not null,
  lat         double precision,
  lng         double precision,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

create index if not exists idx_ping_sos_village on ping_sos_events(village_id, created_at desc);

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

alter publication supabase_realtime add table ping_messages;
alter publication supabase_realtime add table ping_direct_messages;
alter publication supabase_realtime add table ping_sos_events;

alter table ping_users              enable row level security;
alter table ping_messages           enable row level security;
alter table ping_direct_messages    enable row level security;
alter table ping_sos_events         enable row level security;
alter table ping_emergency_contacts enable row level security;

create policy "anyone_read_users"   on ping_users for select using (true);
create policy "owner_insert_users"  on ping_users for insert with check (auth.uid() = id);
create policy "owner_update_users"  on ping_users for update using (auth.uid() = id);

create policy "open_read_messages"   on ping_messages for select using (true);
create policy "open_insert_messages" on ping_messages for insert with check (true);

create policy "open_read_dms"   on ping_direct_messages for select using (true);
create policy "open_insert_dms" on ping_direct_messages for insert with check (true);

create policy "open_read_sos"   on ping_sos_events for select using (true);
create policy "open_insert_sos" on ping_sos_events for insert with check (true);

create policy "owner_ec_select" on ping_emergency_contacts for select using (auth.uid() = user_id);
create policy "owner_ec_insert" on ping_emergency_contacts for insert with check (auth.uid() = user_id);
create policy "owner_ec_update" on ping_emergency_contacts for update using (auth.uid() = user_id);
create policy "owner_ec_delete" on ping_emergency_contacts for delete using (auth.uid() = user_id);

create or replace function search_ping_users(q text)
returns table(id uuid, username text, first_name text, last_name text, village_key text, village_name text)
language sql stable as $$
  select id, username, first_name, last_name, village_key, village_name
  from ping_users
  where username ilike '%' || q || '%'
     or first_name ilike '%' || q || '%'
     or last_name  ilike '%' || q || '%'
  order by
    case when username ilike q || '%' then 0 else 1 end,
    username
  limit 30;
$$;

create table if not exists ping_otp_codes (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  code       text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_ping_otp_phone on ping_otp_codes(phone, expires_at desc);
alter table ping_otp_codes enable row level security;
create policy "open_otp" on ping_otp_codes for all using (true) with check (true);
