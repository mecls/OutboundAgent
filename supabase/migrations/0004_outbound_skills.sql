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
