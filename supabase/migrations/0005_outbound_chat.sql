-- Per-lead refine threads (the interactive agent loop) + a simple key/value
-- config store (sender profile, batch cap, default dry-run, ICP overrides).

create table if not exists public.outbound_chat_messages (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.outbound_leads(id) on delete cascade,
  role       text not null check (role in ('user','assistant','tool','system')),
  content    text not null default '',
  reasoning  text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
create index if not exists outbound_chat_lead_idx
  on public.outbound_chat_messages (lead_id, created_at);

create table if not exists public.outbound_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.outbound_chat_messages enable row level security;
alter table public.outbound_config        enable row level security;
