import { getLead, updateLead } from '@/lib/db/leads'
import { getBatch } from '@/lib/db/batches'
import { listScrapesByLead } from '@/lib/db/scrapes'
import { loadSkillBundle } from '@/lib/skills/store'
import { researchLead, type LeadBrief } from '@/lib/agent/research'
import { findCompetitors } from '@/lib/enrich/competitors'
import { composeOutreach, type ComposedOutreach } from '@/lib/outreach/compose'
import { persistOutreach } from '@/lib/pipeline/persist-sequence'

/**
 * Re-run a lead's outreach (used by the refine chat's regenerate tool): reuses the
 * stored classification + scraped enrichment, re-finds the two competitors
 * (geo-scoped by the batch), and re-composes the message. Runs the classify step
 * first only if no brief exists yet.
 */
export async function regenerateSequence(leadId: string): Promise<ComposedOutreach> {
  const lead = await getLead(leadId)
  if (!lead) throw new Error(`lead not found: ${leadId}`)

  const scrapes = await listScrapesByLead(leadId)
  const enrichmentText = scrapes
    .filter((s) => s.text)
    .map((s) => `# ${s.kind.toUpperCase()}\n${s.text}`)
    .join('\n\n')

  const bundle = await loadSkillBundle()
  const batch = await getBatch(lead.batch_id)

  let brief = (lead.brief as LeadBrief | null) ?? null
  if (!brief) {
    brief = await researchLead({
      lead: {
        full_name: lead.full_name,
        company: lead.company,
        title: lead.title,
        website: lead.website,
        linkedin_url: lead.linkedin_url,
        location: lead.location,
        industry: lead.industry,
      },
      enrichmentText,
      skillText: bundle.text,
      region: batch?.region ?? null,
    })
    await updateLead(leadId, {
      assistant_key: brief.assistant_key,
      icp_verdict: brief.icp_verdict,
      brief,
    })
  }

  // US → the per-lead inferred state; Europe → region-wide.
  const geoArea = batch?.region === 'us' ? brief.us_state || null : batch?.geo_area ?? null
  const competitors = await findCompetitors({
    company: lead.company,
    whatTheyDo: brief.what_they_do,
    region: batch?.region ?? null,
    geoArea,
    skillText: bundle.text,
  })
  if (!competitors.ok || !competitors.competitor_1 || !competitors.competitor_2) {
    throw new Error(`competitor search failed: ${competitors.error ?? 'no competitors found'}`)
  }
  await updateLead(leadId, {
    competitor_1: competitors.competitor_1,
    competitor_2: competitors.competitor_2,
  })

  const composed = composeOutreach({
    firstName: lead.first_name || lead.full_name?.split(/\s+/)[0] || null,
    competitor1: competitors.competitor_1,
    competitor2: competitors.competitor_2,
    assistantKey: brief.assistant_key,
  })
  await persistOutreach(leadId, composed, brief, competitors, bundle.version)
  return composed
}
