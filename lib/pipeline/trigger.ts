import { inngest } from '@/lib/inngest/client'

/** Kicks off the fan-out worker for a batch (sends `outbound/batch.kickoff`). */
export async function triggerBatch(batchId: string): Promise<void> {
  await inngest.send({ name: 'outbound/batch.kickoff', data: { batchId } })
}
