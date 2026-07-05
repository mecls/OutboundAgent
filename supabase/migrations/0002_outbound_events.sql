-- Append-only event log that drives the live leads table over SSE.
-- `seq` is a global identity column — ordering within a batch is a monotonic
-- subsequence with no per-batch counter to race on.

create table if not exists public.outbound_events (
  seq      bigint generated always as identity primary key,
  batch_id uuid not null references public.outbound_batches(id) on delete cascade,
  lead_id  uuid references public.outbound_leads(id) on delete cascade,
  type     text not null,
  ts       timestamptz not null default now(),
  payload  jsonb not null default '{}'::jsonb
);
create index if not exists outbound_events_batch_seq_idx
  on public.outbound_events (batch_id, seq);

alter table public.outbound_events enable row level security;
