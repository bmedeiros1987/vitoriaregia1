const { query } = require('./db');

async function initDatabase() {
  await query(`
    create table if not exists app_meta (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists residents (
      id text primary key,
      name text not null,
      email text,
      whatsapp text,
      apartment text not null,
      status text not null default 'approved',
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists pending_residents (
      id text primary key,
      name text not null,
      email text,
      whatsapp text,
      apartment text not null,
      status text not null default 'pending',
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists bookings (
      id text primary key,
      space_id text,
      space_name text,
      date date,
      period text,
      apartment text,
      resident_name text,
      resident_email text,
      resident_whatsapp text,
      status text not null default 'pending',
      fee numeric(12,2) default 0,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists visitors (
      id text primary key,
      name text not null,
      document text,
      phone text,
      apartment text,
      type text,
      photo text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists packages (
      id text primary key,
      apartment text,
      recipient text,
      carrier text,
      code text,
      status text not null default 'open',
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists notices (
      id text primary key,
      title text not null,
      category text,
      message text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists notification_config (
      id integer primary key default 1,
      config jsonb not null,
      updated_at timestamptz not null default now(),
      constraint notification_config_singleton check (id = 1)
    );

    create table if not exists asaas_config (
      id integer primary key default 1,
      config jsonb not null,
      updated_at timestamptz not null default now(),
      constraint asaas_config_singleton check (id = 1)
    );

    create table if not exists notification_logs (
      id text primary key,
      channel text not null,
      recipient text,
      subject text,
      message text,
      status text not null,
      error text,
      provider_response jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists idx_residents_apartment on residents(apartment);
    create index if not exists idx_pending_residents_status on pending_residents(status);
    create index if not exists idx_bookings_date_period on bookings(date, period);
    create index if not exists idx_bookings_status on bookings(status);
    create index if not exists idx_visitors_apartment_created on visitors(apartment, created_at desc);
    create index if not exists idx_packages_apartment_status on packages(apartment, status);
    create index if not exists idx_notification_logs_created on notification_logs(created_at desc);
  `);
}

module.exports = { initDatabase };
