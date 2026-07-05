import type { LeadRow } from '@/lib/db/leads'
import { setLeadStatus, updateLead } from '@/lib/db/leads'
import { insertScrape } from '@/lib/db/scrapes'
import { persistOutreach } from '@/lib/pipeline/persist-sequence'
import { scrapeWebsite } from '@/lib/enrich/website'
import { scrapeLinkedinProfile } from '@/lib/enrich/linkedin'
import { findCompetitors } from '@/lib/enrich/competitors'
import { researchLead } from '@/lib/agent/research'
import { composeOutreach } from '@/lib/outreach/compose'
import { loadSkillBundle } from '@/lib/skills/store'
import { events } from '@/lib/events/emit'
import { env } from '@/lib/env'

export interface ProcessOptions {
  dryRun: boolean
  /** Batch geography (scopes the competitor search). */
  region?: 'us' | 'europe' | null
  geoArea?: string | null
  /** Preloaded skill bundle (the batch worker loads once and shares). */
  skillText?: string
  skillVersion?: number
}

/**
 * Run the full per-lead pipeline: enrich website + LinkedIn → classify (what they
 * do + best-fit assistant) → find two direct competitors (geo-scoped web search) →
 * compose the fixed message + follow-ups → persist. Emits live events at each step.
 * Never throws — a failed lead is marked status='error' so the batch continues.
 */
export async function processLead(lead: LeadRow, opts: ProcessOptions): Promise<void> {
  const batchId = lead.batch_id
  const leadId = lead.id

  try {
    const bundle = opts.skillText
      ? { text: opts.skillText, version: opts.skillVersion ?? 1 }
      : await loadSkillBundle()

    // ── 1. Enrich (website + LinkedIn) ──────────────────────────────────────────
    await setLeadStatus(leadId, 'enriching')
    await events.leadStatus(batchId, leadId, 'enriching')

    const enrichmentParts: string[] = []

    if (lead.website) {
      await events.leadActivity(batchId, leadId, 'Reading website')
      const site = await scrapeWebsite(lead.website)
      await insertScrape({
        lead_id: leadId,
        kind: 'website',
        text: site.text || null,
        ok: site.ok,
        error: site.error ?? null,
      })
      if (site.ok && site.text) enrichmentParts.push(`# WEBSITE (${lead.website})\n${site.text}`)
    }

    let linkedinProfile: unknown = null
    const canScrapeLinkedin = !opts.dryRun && Boolean(lead.linkedin_url) && Boolean(env.apifyToken())
    if (canScrapeLinkedin && lead.linkedin_url) {
      await events.leadActivity(batchId, leadId, 'Scraping LinkedIn profile')
      const li = await scrapeLinkedinProfile(lead.linkedin_url)
      await insertScrape({
        lead_id: leadId,
        kind: 'linkedin',
        text: li.text || null,
        raw: li.raw && typeof li.raw === 'object' ? (li.raw as Record<string, unknown>) : null,
        ok: li.ok,
        error: li.error ?? null,
      })
      if (li.ok && li.text) {
        enrichmentParts.push(`# LINKEDIN PROFILE\n${li.text}`)
        linkedinProfile = li.profile
      }
    }

    const enrichmentText = enrichmentParts.join('\n\n')
    await updateLead(leadId, {
      enrichment: {
        website_chars: enrichmentParts.find((p) => p.startsWith('# WEBSITE'))?.length ?? 0,
        linkedin: linkedinProfile,
        dry_run: opts.dryRun,
      },
    })

    // ── 2. Classify (what they do + best-fit assistant) ─────────────────────────
    await setLeadStatus(leadId, 'researching')
    await events.leadStatus(batchId, leadId, 'researching')
    await events.leadActivity(batchId, leadId, 'Classifying the business')

    const brief = await researchLead({
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
      region: opts.region,
    })

    await updateLead(leadId, {
      assistant_key: brief.assistant_key,
      icp_verdict: brief.icp_verdict,
      brief,
    })
    await events.leadStatus(batchId, leadId, 'researching', { icp_verdict: brief.icp_verdict })

    // ── 3. Find two direct competitors (geo-scoped web search) ──────────────────
    // US → scope to the per-lead inferred state; Europe → region-wide.
    const geoArea = opts.region === 'us' ? brief.us_state || null : opts.geoArea ?? null
    await events.leadActivity(
      batchId,
      leadId,
      `Finding competitors${geoArea ? ` in ${geoArea}` : ''}`,
    )
    const competitors = await findCompetitors({
      company: lead.company,
      whatTheyDo: brief.what_they_do,
      region: opts.region,
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

    // ── 4. Compose the fixed message + follow-ups ───────────────────────────────
    await setLeadStatus(leadId, 'drafting')
    await events.leadStatus(batchId, leadId, 'drafting', {
      assistant_key: brief.assistant_key,
      icp_verdict: brief.icp_verdict,
      competitor_1: competitors.competitor_1,
      competitor_2: competitors.competitor_2,
    })
    await events.leadActivity(batchId, leadId, 'Composing message')

    const composed = composeOutreach({
      firstName: lead.first_name || lead.full_name?.split(/\s+/)[0] || null,
      competitor1: competitors.competitor_1,
      competitor2: competitors.competitor_2,
      assistantKey: brief.assistant_key,
    })

    await persistOutreach(leadId, composed, brief, competitors, bundle.version)

    // ── 5. Ready ────────────────────────────────────────────────────────────────
    await setLeadStatus(leadId, 'ready')
    await events.leadStatus(batchId, leadId, 'ready', {
      assistant_key: brief.assistant_key,
      icp_verdict: brief.icp_verdict,
      competitor_1: competitors.competitor_1,
      competitor_2: competitors.competitor_2,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setLeadStatus(leadId, 'error', { error: message.slice(0, 500) })
    await events.leadError(batchId, leadId, message.slice(0, 300))
  }
}
