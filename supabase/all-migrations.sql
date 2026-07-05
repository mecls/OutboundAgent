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
-- Drain counters for the fan-out worker, keyed by batch. Finalize fires when
-- pending_leads <= 0 AND listing_complete. The four SQL fns are atomic and live
-- in `public` (PostgREST resolves .rpc() only in public), SECURITY DEFINER, and
-- locked to service_role.

create table if not exists public.outbound_scrape_state (
  batch_id         uuid primary key references public.outbound_batches(id) on delete cascade,
  pending_leads    int not null default 0,
  listing_complete boolean not null default false,
  updated_at       timestamptz not null default now()
);

alter table public.outbound_scrape_state enable row level security;

create or replace function public.reset_scrape_progress(p_batch_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.outbound_scrape_state (batch_id, pending_leads, listing_complete, updated_at)
  values (p_batch_id, 0, false, now())
  on conflict (batch_id)
  do update set pending_leads = 0, listing_complete = false, updated_at = now();
$$;

create or replace function public.add_pending_leads(p_batch_id uuid, p_n int)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.outbound_scrape_state (batch_id, pending_leads, updated_at)
  values (p_batch_id, p_n, now())
  on conflict (batch_id)
  do update set pending_leads = public.outbound_scrape_state.pending_leads + p_n,
                updated_at = now();
$$;

create or replace function public.complete_leads(p_batch_id uuid, p_n int)
returns int
language sql
security definer
set search_path = public
as $$
  update public.outbound_scrape_state
     set pending_leads = greatest(pending_leads - p_n, 0), updated_at = now()
   where batch_id = p_batch_id
  returning pending_leads;
$$;

create or replace function public.finish_lead_list(p_batch_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  update public.outbound_scrape_state
     set listing_complete = true, updated_at = now()
   where batch_id = p_batch_id
  returning pending_leads;
$$;

revoke all on function public.reset_scrape_progress(uuid) from public, anon, authenticated;
revoke all on function public.add_pending_leads(uuid, int) from public, anon, authenticated;
revoke all on function public.complete_leads(uuid, int) from public, anon, authenticated;
revoke all on function public.finish_lead_list(uuid) from public, anon, authenticated;

grant execute on function public.reset_scrape_progress(uuid) to service_role;
grant execute on function public.add_pending_leads(uuid, int) to service_role;
grant execute on function public.complete_leads(uuid, int) to service_role;
grant execute on function public.finish_lead_list(uuid) to service_role;
-- DB-versioned skill system (single global skill set — no account scoping).
-- Seeded from seed/skills/* on first run; thereafter the DB is the source of
-- truth so the agent's self-improvement (append winners / propose overwrites)
-- persists. Self-edit rule: append applies immediately; overwrite of existing
-- content becomes a pending proposal.

create table if not exists public.outbound_skills (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.outbound_skill_files (
  id         uuid primary key default gen_random_uuid(),
  skill_id   uuid not null references public.outbound_skills(id) on delete cascade,
  path       text not null,
  content    text not null default '',
  version    int  not null default 1,
  updated_at timestamptz not null default now(),
  unique (skill_id, path)
);

create table if not exists public.outbound_skill_file_versions (
  id            uuid primary key default gen_random_uuid(),
  skill_file_id uuid not null references public.outbound_skill_files(id) on delete cascade,
  version       int  not null,
  content       text not null,
  change_type   text not null check (change_type in ('create','append','overwrite','rollback')),
  author        text not null check (author in ('agent','user')),
  created_at    timestamptz not null default now()
);
create index if not exists outbound_skill_file_versions_idx
  on public.outbound_skill_file_versions (skill_file_id, version);

create table if not exists public.outbound_skill_edit_proposals (
  id               uuid primary key default gen_random_uuid(),
  skill_id         uuid not null references public.outbound_skills(id) on delete cascade,
  path             text not null,
  proposed_content text not null,
  base_version     int,
  rationale        text not null default '',
  status           text not null default 'pending'
                     check (status in ('pending','approved','rejected')),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);
create index if not exists outbound_skill_edit_proposals_status_idx
  on public.outbound_skill_edit_proposals (status, created_at);

alter table public.outbound_skills              enable row level security;
alter table public.outbound_skill_files         enable row level security;
alter table public.outbound_skill_file_versions enable row level security;
alter table public.outbound_skill_edit_proposals enable row level security;
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


-- ============================================================
-- 0006_outbound_dream100.sql
-- ============================================================
-- 0006 — Dream 100 outreach: per-channel messages + the post-reply deliverable.
--
-- The skill pivoted from a single "book the 15-min call" DM to the Dream 100
-- method: a cold EMAIL + a LinkedIn DM that both lead with a free lead magnet
-- (the quote-replier agent) and end in a "mind if I share it?" raise-the-hand
-- CTA, plus a deliverable built after a positive reply. Legacy columns
-- (connection_note, opener, reply_handlers) are kept nullable for back-compat
-- with already-drafted leads; new drafts leave them null.

alter table public.outbound_sequences
  add column if not exists email_subject text,
  add column if not exists email_body    text,
  add column if not exists linkedin_dm    text,
  -- The Prompt-3 lead magnet, built after they reply: { content, follow_up_message, why_it_works, built_at }.
  add column if not exists deliverable    jsonb;


-- ============================================================
-- 0007_outbound_competitors.sql
-- ============================================================
-- 0007 — Competitor-outreach pivot.
--
-- Outreach now shows a prospect that their direct competitors are already
-- automating. Market is set manually per upload (region = 'us' | 'europe'); for
-- US the agent infers each company's STATE per-lead (stored in the lead brief),
-- so geo_area is only used for Europe ('Europe'). Each lead gets its two found
-- competitors + the chosen assistant; the single composed message lives on the
-- sequence. Legacy Dream-100 columns (email_subject/email_body/linkedin_dm +
-- honesty) stay nullable, unused.

alter table public.outbound_batches
  add column if not exists region   text,
  add column if not exists geo_area text;

alter table public.outbound_leads
  add column if not exists competitor_1   text,
  add column if not exists competitor_2   text,
  add column if not exists assistant_key  text;

alter table public.outbound_sequences
  add column if not exists message text;
