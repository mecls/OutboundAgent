import { inngest } from '@/lib/inngest/client'
import { getBatch, setBatchStatus } from '@/lib/db/batches'
import { listPendingLeads } from '@/lib/db/leads'
import {
  resetScrapeProgress,
  addPendingLeads,
  finishLeadList,
} from '@/lib/db/scrape-state'
import { finalizeBatch } from '@/lib/pipeline/finalize'
import { events } from '@/lib/events/emit'
import { env } from '@/lib/env'

/** Leads per fan-out event. Each lead is a slow scrape+LLM job, so keep small. */
const CHUNK = 3

/**
 * Enumerate a batch's pending leads (capped), zero the drain counter, fan out
 * lead.process events, then mark the listing complete. Forked from EmailAgent's
 * index-kickoff.
 */
export const batchKickoff = inngest.createFunction(
  {
    id: 'batch-kickoff',
    concurrency: { key: 'event.data.batchId', limit: 1 },
    retries: 3,
    onFailure: async ({ event, error }) => {
      const batchId = (event?.data?.event?.data as { batchId?: string })?.batchId
      if (batchId) {
        await setBatchStatus(batchId, 'error', error.message).catch(() => {})
        await events.batchError(batchId, error.message).catch(() => {})
      }
    },
  },
  { event: 'outbound/batch.kickoff' },
  async ({ event, step }) => {
    const { batchId } = event.data

    const batch = await step.run('load-batch', async () => {
      const b = await getBatch(batchId)
      if (!b) throw new Error(`batch not found: ${batchId}`)
      return b
    })

    const cap = Math.min(batch.batch_cap ?? env.batchCap(), env.batchCap())

    const leadIds = await step.run('enumerate', async () => {
      await setBatchStatus(batchId, 'running')
      await resetScrapeProgress(batchId)
      await events.batchStarted(batchId, `Processing ${batch.filename || batchId}`)
      const leads = await listPendingLeads(batchId, cap)
      if (leads.length > 0) await addPendingLeads(batchId, leads.length)
      return leads.map((l) => l.id)
    })

    if (leadIds.length === 0) {
      await step.run('finalize-empty', async () => {
        await finishLeadList(batchId)
        await finalizeBatch(batchId)
      })
      return { batchId, fanned: 0 }
    }

    // Fan out in chunks (drain flag → these count toward finalize).
    const evts = []
    for (let i = 0; i < leadIds.length; i += CHUNK) {
      evts.push({
        name: 'outbound/lead.process' as const,
        data: { batchId, leadIds: leadIds.slice(i, i + CHUNK), drain: true },
      })
    }
    await step.sendEvent('send-lead-process', evts)

    // Mark listing complete. If every lead already drained, finalize now.
    const remaining = await step.run('finish-listing', async () => finishLeadList(batchId))
    if (remaining <= 0) {
      await step.run('finalize-after-listing', async () => finalizeBatch(batchId))
    }

    return { batchId, fanned: leadIds.length }
  },
)
