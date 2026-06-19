-- ============================================================
-- ESTETISTA APP — Schema SQL completo per Supabase PostgreSQL
-- Incolla questo file nel Supabase SQL Editor ed eseguilo
-- ============================================================

-- Estensione UUID
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================
create type appointment_status as enum (
  'scheduled',
  'confirmed',
  'cancelled',
  'completed',
  'no_show'
);

create type confirmation_status as enum (
  'pending',
  'confirmed',
  'declined',
  'no_response'
);

create type message_channel as enum (
  'sms',
  'whatsapp'
);

create type message_direction as enum (
  'outbound',
  'inbound'
);

-- ============================================================
-- FUNZIONE updated_at trigger
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- TABELLA: clients
-- ============================================================
create table clients (
  id            uuid primary key default uuid_generate_v4(),
  first_name    text not null,
  last_name     text not null,
  phone         text not null,
  email         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_clients_phone on clients(phone);
create index idx_clients_last_name on clients(last_name);

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ============================================================
-- TABELLA: services
-- ============================================================
create table services (
  id                 uuid primary key default uuid_generate_v4(),
  name               text not null,
  duration_minutes   integer not null check (duration_minutes > 0),
  price              numeric(10,2) not null check (price >= 0),
  description        text,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_services_active on services(active);

create trigger trg_services_updated_at
  before update on services
  for each row execute function set_updated_at();

-- ============================================================
-- TABELLA: appointments
-- ============================================================
create table appointments (
  id                    uuid primary key default uuid_generate_v4(),
  client_id             uuid not null references clients(id) on delete restrict,
  service_id            uuid not null references services(id) on delete restrict,
  start_time            timestamptz not null,
  end_time              timestamptz not null,
  status                appointment_status not null default 'scheduled',
  confirmation_status   confirmation_status not null default 'pending',
  reminder_sent_at      timestamptz,
  confirmed_at          timestamptz,
  cancelled_at          timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_times check (end_time > start_time)
);

create index idx_appointments_start_time on appointments(start_time);
create index idx_appointments_client_id on appointments(client_id);
create index idx_appointments_service_id on appointments(service_id);
create index idx_appointments_status on appointments(status);
create index idx_appointments_confirmation_status on appointments(confirmation_status);

create trigger trg_appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

-- ============================================================
-- TABELLA: message_logs
-- ============================================================
create table message_logs (
  id                  uuid primary key default uuid_generate_v4(),
  appointment_id      uuid references appointments(id) on delete set null,
  client_id           uuid references clients(id) on delete set null,
  channel             message_channel not null default 'sms',
  message_body        text not null,
  provider_message_id text,
  direction           message_direction not null,
  status              text,
  received_response   boolean not null default false,
  created_at          timestamptz not null default now()
);

create index idx_message_logs_appointment_id on message_logs(appointment_id);
create index idx_message_logs_client_id on message_logs(client_id);
create index idx_message_logs_created_at on message_logs(created_at);

-- ============================================================
-- TABELLA: settings
-- ============================================================
create table settings (
  id              uuid primary key default uuid_generate_v4(),
  center_name     text not null default 'Centro Estetico',
  phone_number    text,
  address         text,
  reminder_minutes integer not null default 30,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_settings_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- Inserisci riga settings di default
insert into settings (center_name, reminder_minutes)
values ('Il Mio Centro Estetico', 30);

-- ============================================================
-- ROW LEVEL SECURITY
-- Tutte le tabelle sono accessibili solo agli utenti autenticati
-- ============================================================
alter table clients enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table message_logs enable row level security;
alter table settings enable row level security;

-- Policy: solo utenti autenticati possono leggere e scrivere
create policy "Authenticated users: full access" on clients
  for all to authenticated using (true) with check (true);

create policy "Authenticated users: full access" on services
  for all to authenticated using (true) with check (true);

create policy "Authenticated users: full access" on appointments
  for all to authenticated using (true) with check (true);

create policy "Authenticated users: full access" on message_logs
  for all to authenticated using (true) with check (true);

create policy "Authenticated users: full access" on settings
  for all to authenticated using (true) with check (true);

-- Il webhook Twilio usa service_role key, quindi bypassa RLS
-- Nessuna policy aggiuntiva necessaria

-- ============================================================
-- FINE SCHEMA
-- ============================================================
