-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.
create table if not exists push_subscriptions (
  id text primary key,                 -- hash of the device's push endpoint
  subscription jsonb not null,         -- the browser's push subscription
  created_at timestamptz not null default now()
);

-- Lock the table down. The API uses the server-side secret key, which bypasses this;
-- the public anon key (and so anyone on the internet) gets no access at all.
alter table push_subscriptions enable row level security;
