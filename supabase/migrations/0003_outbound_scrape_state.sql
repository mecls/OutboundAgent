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
