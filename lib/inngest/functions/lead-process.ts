import { inngest } from '@/lib/inngest/client'
import { getLead } from '@/lib/db/leads'
import { getBatch } from '@/lib/db/batches'
import { completeLeads, getScrapeState } from '@/lib/db/scrape-state'
import { loadSkillBundle } from '@/lib/skills/store'
import { processLead } from '@/lib/pipeline/process-lead'
import { finalizeBatch } from '@/lib/pipeline/finalize'

/**
 * Process a small chunk of leads: enrich → research → draft → persist (each via
 * processLead, which never throws). Then decrement the drain counter; if this was
 * the last chunk and listing is complete, finalize the batch. Forked from
 * EmailAgent's index-batch. Concurrency kept low — each lead is a slow scrape+LLM job.
 */
export const leadProcess = inngest.createFunction(
  {
    id: 'lead-process',
    concurrency: { key: 'event.data.batchId', limit: 3 },
    retries: 3,
  },
  { event: 'outbound/lead.process' },
  async ({ event, step }) => {
    const { batchId, leadIds, drain } = event.data

    // processLead swallows its own errors (marks the lead status='error'), so this
    // step won't throw — keeping the drain accounting below from re-running on retry.
    await step.run('process', async () => {
      const batch = await getBatch(batchId)
      const bundle = await loadSkillBundle()
      for (const id of leadIds) {
        const lead = await getLead(id)
        if (!lead) continue
        await processLead(lead, {
          dryRun: batch?.dry_run ?? false,
          region: batch?.region ?? null,
          geoArea: batch?.geo_area ?? null,
          skillText: bundle.text,
          skillVersion: bundle.version,
        })
      }
      return { processed: leadIds.length }
    })

    if (!drain) return { batchId, processed: leadIds.length }

    await step.run('drain', async () => {
      const remaining = await completeLeads(batchId, leadIds.length)
      if (remaining <= 0) {
        const state = await getScrapeState(batchId)
        if (state?.listing_complete) await finalizeBatch(batchId)
      }
    })

    return { batchId, processed: leadIds.length }
  },
)
