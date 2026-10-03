-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
create table if not exists push_subscriptions (
  id text primary key,                 -- hash of the device's push endpoint
  subscription jsonb not null,         -- the browser's push subscription
  created_at timestamptz not null default now()
);

-- Lock the table down. The API uses the server-side secret key, which bypasses this;
-- the public anon key (and so anyone on the internet) gets no access at all.
alter table push_subscriptions enable row level security;

-- Booking requests, shown on the band's /requests page.
create table if not exists booking_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  venue text,
  event_type text,
  distance text,
  venue_type text,
  date_text text,                      -- as shown to the customer, e.g. "Sat, Nov 14, 2026"
  date_sort date,                      -- same date as a real date for sorting; null when "Flexible"
  time_of_day text,
  set_length text,
  name text not null,
  contact text not null,
  notes text,
  contacted boolean not null default false,
  contacted_at timestamptz
);

alter table booking_requests enable row level security;
