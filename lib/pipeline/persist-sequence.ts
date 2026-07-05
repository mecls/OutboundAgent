import { upsertSequence } from '@/lib/db/sequences'
import { assistantLabel } from '@/lib/outreach/templates'
import type { LeadBrief } from '@/lib/agent/research'
import type { ComposedOutreach } from '@/lib/outreach/compose'
import type { CompetitorResult } from '@/lib/enrich/competitors'

/** Assemble the rationale jsonb the drawer/export read (classification + competitors). */
export function buildRationale(brief: LeadBrief, competitors: CompetitorResult): Record<string, unknown> {
  return {
    summary: brief.summary,
    what_they_do: brief.what_they_do,
    us_state: brief.us_state,
    icp_verdict: brief.icp_verdict,
    icp_reason: brief.icp_reason,
    assistant_key: brief.assistant_key,
    assistant_label: assistantLabel(brief.assistant_key),
    assistant_reason: brief.assistant_reason,
    competitor_1: competitors.competitor_1,
    competitor_2: competitors.competitor_2,
    competitor_reasoning: competitors.reasoning,
    competitor_sources: competitors.sources,
    competitor_query: competitors.query,
  }
}

/** Persist the composed outreach for a lead (snapshots any prior version). */
export async function persistOutreach(
  leadId: string,
  composed: ComposedOutreach,
  brief: LeadBrief,
  competitors: CompetitorResult,
  skillVersion: number,
): Promise<void> {
  await upsertSequence(leadId, {
    message: composed.message,
    follow_up_1: composed.follow_up_1,
    follow_up_2: composed.follow_up_2,
    rationale: buildRationale(brief, competitors),
    skill_version: skillVersion,
  })
}
