import { supabaseService } from '@/lib/supabase/service'

export interface BatchRow {
  id: string
  filename: string
  source_label: string
  total: number
  status: 'uploaded' | 'running' | 'done' | 'error'
  counts: Record<string, number>
  dry_run: boolean
  batch_cap: number | null
  // Geography (set manually on upload) — scopes the competitor search.
  region: 'us' | 'europe' | null
  geo_area: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export async function createBatch(input: {
  filename: string
  source_label?: string
  total: number
  dry_run: boolean
  batch_cap: number
  region?: 'us' | 'europe' | null
  geo_area?: string | null
}): Promise<string> {
  const { data, error } = await supabaseService()
    .from('outbound_batches')
    .insert({
      filename: input.filename,
      source_label: input.source_label ?? '',
      total: input.total,
      dry_run: input.dry_run,
      batch_cap: input.batch_cap,
      region: input.region ?? null,
      geo_area: input.geo_area ?? null,
      status: 'uploaded',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createBatch failed: ${error?.message ?? 'no data'}`)
  return data.id as string
}

export async function getBatch(id: string): Promise<BatchRow | null> {
  const { data, error } = await supabaseService()
    .from('outbound_batches')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getBatch failed: ${error.message}`)
  return (data as BatchRow | null) ?? null
}

export async function listBatches(): Promise<BatchRow[]> {
  const { data, error } = await supabaseService()
    .from('outbound_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`listBatches failed: ${error.message}`)
  return (data ?? []) as BatchRow[]
}

export async function setBatchStatus(
  id: string,
  status: BatchRow['status'],
  error?: string,
): Promise<void> {
  const { error: e } = await supabaseService()
    .from('outbound_batches')
    .update({ status, error: error ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (e) throw new Error(`setBatchStatus failed: ${e.message}`)
}

/** Recompute the per-status counts from the batch's leads and persist them. */
export async function recomputeCounts(id: string): Promise<Record<string, number>> {
  const svc = supabaseService()
  const { data, error } = await svc
    .from('outbound_leads')
    .select('status')
    .eq('batch_id', id)
  if (error) throw new Error(`recomputeCounts failed: ${error.message}`)
  const counts: Record<string, number> = {}
  for (const r of data ?? []) {
    const s = (r as { status: string }).status
    counts[s] = (counts[s] ?? 0) + 1
  }
  await svc
    .from('outbound_batches')
    .update({ counts, updated_at: new Date().toISOString() })
    .eq('id', id)
  return counts
}
