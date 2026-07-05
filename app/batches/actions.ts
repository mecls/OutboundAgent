'use server'

import { revalidatePath } from 'next/cache'
import { createBatch, setBatchStatus, recomputeCounts } from '@/lib/db/batches'
import { insertLeads } from '@/lib/db/leads'
import { normalizeRows } from '@/lib/leads/csv'
import type { ColumnMapping } from '@/lib/leads/types'
import { env } from '@/lib/env'
import { triggerBatch } from '@/lib/pipeline/trigger'

export interface CreateBatchPayload {
  filename: string
  rows: Record<string, string>[]
  mapping: ColumnMapping
  dryRun: boolean
  cap?: number
  /** Market for the whole list (US → per-company state inferred; Europe → region-wide). */
  region: 'us' | 'europe'
}

/** Create a batch + its leads from parsed CSV rows, then kick off processing. */
export async function createBatchAction(
  payload: CreateBatchPayload,
): Promise<{ batchId: string; inserted: number }> {
  const { filename, rows, mapping, dryRun, region } = payload
  const cap = Math.min(payload.cap ?? env.batchCap(), env.batchCap())
  // US states are inferred per-lead; Europe is region-wide.
  const geoArea = region === 'europe' ? 'Europe' : null

  const leads = normalizeRows(rows, mapping)
  if (leads.length === 0) throw new Error('No usable leads found in the CSV.')

  const batchId = await createBatch({
    filename,
    total: leads.length,
    dry_run: dryRun,
    batch_cap: cap,
    region,
    geo_area: geoArea,
  })
  const inserted = await insertLeads(batchId, leads)
  await recomputeCounts(batchId)
  await setBatchStatus(batchId, 'running')
  await triggerBatch(batchId)

  revalidatePath('/batches')
  return { batchId, inserted }
}
