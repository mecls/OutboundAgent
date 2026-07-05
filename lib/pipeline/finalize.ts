import { getBatch, setBatchStatus, recomputeCounts } from '@/lib/db/batches'
import { events } from '@/lib/events/emit'

/**
 * Mark a batch done exactly once. Both the last lead.process drain and the
 * kickoff's finish_lead_list may detect completion; this guards against a
 * double finalize / double batch.completed event.
 */
export async function finalizeBatch(batchId: string): Promise<void> {
  const batch = await getBatch(batchId)
  if (!batch || batch.status === 'done') return
  const counts = await recomputeCounts(batchId)
  await setBatchStatus(batchId, 'done')
  await events.batchCompleted(batchId, { counts })
}
