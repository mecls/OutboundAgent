-- OutboundAgent core: batches, leads, raw scrapes, and generated DM sequences.
-- Single-tenant: RLS is enabled with NO policies (deny anon/authenticated); the
-- service-role key bypasses RLS. All tables are outbound_* to avoid colliding
-- with content_* / EmailAgent / InsuranceAgent tables in the shared project.

-- ── Batches: one row per CSV upload ──────────────────────────────────────────
create table if not exists public.outbound_batches (
  id           uuid primary key default gen_random_uuid(),
  filename     text not null default '',
  source_label text not null default '',
  total        int  not null default 0,
  status       text not null default 'uploaded'
                 check (status in ('uploaded','running','done','error')),
  counts       jsonb not null default '{}'::jsonb,
  dry_run      boolean not null default false,
  batch_cap    int,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── Leads: one row per CSV row ───────────────────────────────────────────────
create table if not exists public.outbound_leads (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.outbound_batches(id) on delete cascade,
  position      int  not null default 0,
  raw           jsonb not null default '{}'::jsonb,
  full_name     text,
  first_name    text,
  last_name     text,
  company       text,
  title         text,
  website       text,
  linkedin_url  text,
  email         text,
  location      text,
  industry      text,
  status        text not null default 'pending'
                  check (status in ('pending','enriching','researching','drafting',
                                     'ready','approved','sent','skipped','error')),
  error         text,
  vertical      text,
  matched_client text,
  icp_verdict   text check (icp_verdict in ('serve','skip')),
  enrichment    jsonb,
  brief         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists outbound_leads_batch_idx
  on public.outbound_leads (batch_id, position);
-- Idempotent re-import: a LinkedIn URL is unique within a batch (NULLs allowed).
create unique index if not exists outbound_leads_batch_linkedin_uniq
  on public.outbound_leads (batch_id, linkedin_url)
  where linkedin_url is not null;

-- ── Raw scrape audit (one row per source pull) ───────────────────────────────
create table if not exists public.outbound_scrapes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.outbound_leads(id) on delete cascade,
  kind       text not null check (kind in ('website','linkedin','posts')),
  text       text,
  raw        jsonb,
  ok         boolean not null default false,
  error      text,
  fetched_at timestamptz not null default now()
);
create index if not exists outbound_scrapes_lead_idx
  on public.outbound_scrapes (lead_id, kind);

-- ── Generated DM sequence (latest per lead) ──────────────────────────────────
create table if not exists public.outbound_sequences (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null unique references public.outbound_leads(id) on delete cascade,
  connection_note text,
  opener          text,
  follow_up_1     text,
  follow_up_2     text,
  reply_handlers  jsonb not null default '{}'::jsonb,
  rationale       jsonb not null default '{}'::jsonb,
  skill_version   int,
  status          text not null default 'draft'
                    check (status in ('draft','edited','approved','sent')),
  edited          jsonb,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Append-only snapshots of prior sequences (regeneration history).
create table if not exists public.outbound_sequence_versions (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.outbound_leads(id) on delete cascade,
  sequence   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists outbound_sequence_versions_lead_idx
  on public.outbound_sequence_versions (lead_id, created_at);

alter table public.outbound_batches            enable row level security;
alter table public.outbound_leads              enable row level security;
alter table public.outbound_scrapes            enable row level security;
alter table public.outbound_sequences          enable row level security;
alter table public.outbound_sequence_versions  enable row level security;
