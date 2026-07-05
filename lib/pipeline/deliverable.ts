import { z } from 'zod'
import { runTool } from '@/lib/llm/run-tool'
import { getLead } from '@/lib/db/leads'
import { updateSequence } from '@/lib/db/sequences'
import { listScrapesByLead } from '@/lib/db/scrapes'
import { loadSkillBundle } from '@/lib/skills/store'
import { ASSISTANTS, isAssistantKey } from '@/lib/outreach/templates'
import type { LeadBrief } from '@/lib/agent/research'

/**
 * Deliverable step ("Happy to personalise it for free"): once a prospect replies
 * yes, build the actual chosen assistant for THEM — finished, ready to use,
 * impressive enough they need a call to get the rest. Plus a short message to send
 * with it and one line on why it lands. Persisted to outbound_sequences.deliverable.
 */

export const DeliverableSchema = z.object({
  content: z.string(),
  follow_up_message: z.string(),
  why_it_works: z.string(),
})

export type Deliverable = z.infer<typeof DeliverableSchema> & { built_at: string }

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: {
      type: 'string',
      description:
        'The FINISHED assistant, specific to this prospect — a ready-to-use spec: the trigger, the exact action it takes (written for THEIR brand/offer/customer, with a realistic worked example), any qualifying/routing logic, the output/next-step it drives, and how it plugs into the tools they already use. No [brackets] or placeholders — finished, immediately usable, impressive.',
    },
    follow_up_message: {
      type: 'string',
      description: 'A short message (2–3 sentences) to send WITH the deliverable — casual, peer tone, ends by inviting a quick look/call to wire it up live.',
    },
    why_it_works: {
      type: 'string',
      description: 'ONE sentence on why this assistant will work for THIS specific business.',
    },
  },
  required: ['content', 'follow_up_message', 'why_it_works'],
}

export async function buildDeliverable(leadId: string): Promise<Deliverable> {
  const lead = await getLead(leadId)
  if (!lead) throw new Error(`lead not found: ${leadId}`)
  const brief = (lead.brief as LeadBrief | null) ?? null

  const assistantKey = isAssistantKey(lead.assistant_key)
    ? lead.assistant_key
    : brief && isAssistantKey(brief.assistant_key)
      ? brief.assistant_key
      : 'quote_form'
  const assistant = ASSISTANTS[assistantKey]

  const scrapes = await listScrapesByLead(leadId)
  const enrichmentText = scrapes
    .filter((s) => s.text)
    .map((s) => `# ${s.kind.toUpperCase()}\n${s.text}`)
    .join('\n\n')
  const bundle = await loadSkillBundle()

  const system = `You build done-for-you AI assistants for Miraside. A cold prospect just replied positively — they want the assistant you offered: the ${assistant.label} that ${assistant.outcome}.

Build the ACTUAL deliverable for THIS prospect. Make it:
1. Specific to them — their brand name, offer, customer, and tone.
2. Immediately usable — they could run it with zero extra work.
3. Impressive enough that they feel they NEED a call to get the rest of the team.
4. FINISHED — no [brackets], no placeholders.

Also produce a short message to send with it and one sentence on why it works. Ground everything in the brief + enrichment; never invent a result. Output ONLY the \`emit_deliverable\` tool call.`

  const userPrompt = `PROSPECT: ${lead.full_name ?? '(unknown)'}${lead.title ? `, ${lead.title}` : ''}${lead.company ? ` at ${lead.company}` : ''}
ASSISTANT TO BUILD: ${assistant.label} — ${assistant.outcome}
${brief ? `WHAT THEY DO: ${brief.what_they_do}` : ''}

ENRICHMENT:
${enrichmentText.slice(0, 3000) || '(none)'}

Build the finished ${assistant.label} for them. Call \`emit_deliverable\`.`

  const result = await runTool({
    systemBlocks: [
      { type: 'text', text: system },
      { type: 'text', text: `===== SKILL =====\n${bundle.text}` },
    ],
    userPrompt,
    toolName: 'emit_deliverable',
    toolDescription: 'Emit the finished, ready-to-send assistant deliverable for this prospect.',
    toolInputSchema: TOOL_INPUT_SCHEMA,
    schema: DeliverableSchema,
    callLabel: 'deliverable',
  })

  const deliverable: Deliverable = { ...result, built_at: new Date().toISOString() }
  await updateSequence(leadId, { deliverable })
  return deliverable
}
