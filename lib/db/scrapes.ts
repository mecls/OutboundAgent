import { supabaseService } from '@/lib/supabase/service'

export interface ScrapeRow {
  id: string
  lead_id: string
  kind: 'website' | 'linkedin' | 'posts'
  text: string | null
  raw: Record<string, unknown> | null
  ok: boolean
  error: string | null
  fetched_at: string
}

export async function insertScrape(input: {
  lead_id: string
  kind: ScrapeRow['kind']
  text?: string | null
  raw?: Record<string, unknown> | null
  ok: boolean
  error?: string | null
}): Promise<void> {
  const { error } = await supabaseService().from('outbound_scrapes').insert({
    lead_id: input.lead_id,
    kind: input.kind,
    text: input.text ?? null,
    raw: input.raw ?? null,
    ok: input.ok,
    error: input.error ?? null,
  })
  if (error) throw new Error(`insertScrape failed: ${error.message}`)
}

export async function listScrapesByLead(leadId: string): Promise<ScrapeRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_scrapes')
    .select('*')
    .eq('lead_id', leadId)
    .order('fetched_at', { ascending: true })
  if (error) throw new Error(`listScrapesByLead failed: ${error.message}`)
  return (data ?? []) as ScrapeRow[]
}
