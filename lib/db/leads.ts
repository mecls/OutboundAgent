import { supabaseService } from '@/lib/supabase/service'
import type { LeadStatus, NormalizedLead } from '@/lib/leads/types'

export interface LeadRow {
  id: string
  batch_id: string
  position: number
  raw: Record<string, string>
  full_name: string | null
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  website: string | null
  linkedin_url: string | null
  email: string | null
  location: string | null
  industry: string | null
  status: LeadStatus
  error: string | null
  // Competitor-outreach fields.
  competitor_1: string | null
  competitor_2: string | null
  assistant_key: string | null
  // Legacy (kept nullable for back-compat with earlier drafts).
  vertical: string | null
  matched_client: string | null
  icp_verdict: 'serve' | 'skip' | null
  enrichment: Record<string, unknown> | null
  brief: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/**
 * Insert normalized leads for a batch. Dedupes within the upload by LinkedIn URL
 * (the DB also enforces a partial unique index). Returns the inserted count.
 */
export async function insertLeads(
  batchId: string,
  leads: NormalizedLead[],
): Promise<number> {
  const seen = new Set<string>()
  const rows = leads
    .filter((l) => {
      if (!l.linkedin_url) return true
      if (seen.has(l.linkedin_url)) return false
      seen.add(l.linkedin_url)
      return true
    })
    .map((l, i) => ({
      batch_id: batchId,
      position: i,
      raw: l.raw,
      full_name: l.full_name,
      first_name: l.first_name,
      last_name: l.last_name,
      company: l.company,
      title: l.title,
      website: l.website,
      linkedin_url: l.linkedin_url,
      email: l.email,
      location: l.location,
      industry: l.industry,
      status: 'pending' as const,
    }))

  if (rows.length === 0) return 0
  const svc = supabaseService()
  let inserted = 0
  // Chunk to stay well under payload limits on large CRM exports.
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error, count } = await svc
      .from('outbound_leads')
      .insert(chunk, { count: 'exact' })
    if (error) throw new Error(`insertLeads failed: ${error.message}`)
    inserted += count ?? chunk.length
  }
  return inserted
}

export async function listLeadsByBatch(batchId: string): Promise<LeadRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_leads')
    .select('*')
    .eq('batch_id', batchId)
    .order('position', { ascending: true })
  if (error) throw new Error(`listLeadsByBatch failed: ${error.message}`)
  return (data ?? []) as LeadRow[]
}

/** Pending leads for the worker, capped (oldest position first). */
export async function listPendingLeads(
  batchId: string,
  cap: number,
): Promise<LeadRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_leads')
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'pending')
    .order('position', { ascending: true })
    .limit(cap)
  if (error) throw new Error(`listPendingLeads failed: ${error.message}`)
  return (data ?? []) as LeadRow[]
}

export async function getLead(id: string): Promise<LeadRow | null> {
  const { data, error } = await supabaseService()
    .from('outbound_leads')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getLead failed: ${error.message}`)
  return (data as LeadRow | null) ?? null
}

export async function updateLead(
  id: string,
  patch: Partial<Omit<LeadRow, 'id' | 'batch_id'>>,
): Promise<void> {
  const { error } = await supabaseService()
    .from('outbound_leads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`updateLead failed: ${error.message}`)
}

export async function setLeadStatus(
  id: string,
  status: LeadStatus,
  patch: Partial<Omit<LeadRow, 'id' | 'batch_id' | 'status'>> = {},
): Promise<void> {
  await updateLead(id, { ...patch, status })
}

/** Reset a batch's errored leads back to 'pending' so a re-run retries them. */
export async function resetErroredLeads(batchId: string): Promise<number> {
  const { data, error } = await supabaseService()
    .from('outbound_leads')
    .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
    .eq('batch_id', batchId)
    .eq('status', 'error')
    .select('id')
  if (error) throw new Error(`resetErroredLeads failed: ${error.message}`)
  return data?.length ?? 0
}
