import { supabaseService } from '@/lib/supabase/service'

/**
 * Drain-counter wrappers (atomic SQL fns from migration 0003), keyed by batch.
 * Finalize fires when pending_leads <= 0 AND listing_complete. Forked from
 * EmailAgent's lib/db/sync.ts.
 */

export interface ScrapeState {
  pending_leads: number
  listing_complete: boolean
}

export async function resetScrapeProgress(batchId: string): Promise<void> {
  const { error } = await supabaseService().rpc('reset_scrape_progress', {
    p_batch_id: batchId,
  })
  if (error) throw new Error(`resetScrapeProgress failed: ${error.message}`)
}

export async function addPendingLeads(batchId: string, n: number): Promise<void> {
  const { error } = await supabaseService().rpc('add_pending_leads', {
    p_batch_id: batchId,
    p_n: n,
  })
  if (error) throw new Error(`addPendingLeads failed: ${error.message}`)
}

/** Decrement by `n`; returns the remaining pending count. */
export async function completeLeads(batchId: string, n: number): Promise<number> {
  const { data, error } = await supabaseService().rpc('complete_leads', {
    p_batch_id: batchId,
    p_n: n,
  })
  if (error) throw new Error(`completeLeads failed: ${error.message}`)
  return (data as number | null) ?? 0
}

/** Mark listing complete; returns the current remaining pending count. */
export async function finishLeadList(batchId: string): Promise<number> {
  const { data, error } = await supabaseService().rpc('finish_lead_list', {
    p_batch_id: batchId,
  })
  if (error) throw new Error(`finishLeadList failed: ${error.message}`)
  return (data as number | null) ?? 0
}

export async function getScrapeState(batchId: string): Promise<ScrapeState | null> {
  const { data, error } = await supabaseService()
    .from('outbound_scrape_state')
    .select('pending_leads, listing_complete')
    .eq('batch_id', batchId)
    .maybeSingle()
  if (error) throw new Error(`getScrapeState failed: ${error.message}`)
  return (data as ScrapeState | null) ?? null
}
