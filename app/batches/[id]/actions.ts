'use server'

import { revalidatePath } from 'next/cache'
import { setBatchStatus, recomputeCounts } from '@/lib/db/batches'
import { resetErroredLeads } from '@/lib/db/leads'
import { triggerBatch } from '@/lib/pipeline/trigger'

/**
 * Re-run a batch: reset any errored leads back to pending (so a transient failure
 * — e.g. a missing key now configured — is retried), then re-send the kickoff.
 */
export async function rerunBatchAction(formData: FormData) {
  const batchId = String(formData.get('batchId') ?? '')
  if (!batchId) throw new Error('missing batchId')
  await resetErroredLeads(batchId)
  await recomputeCounts(batchId)
  await setBatchStatus(batchId, 'running')
  await triggerBatch(batchId)
  revalidatePath(`/batches/${batchId}`)
}
