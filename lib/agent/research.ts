import { z } from 'zod'
import { runTool } from '@/lib/llm/run-tool'
import { ASSISTANT_KEYS, ASSISTANTS } from '@/lib/outreach/templates'

/**
 * Classify step: read a prospect's scraped website + LinkedIn and decide (a) a
 * one-line description of what they do (used to sharpen the competitor search) and
 * (b) which ONE of the fixed assistant catalogue best fits their business — the
 * `{specific outcome}` line in the message. Forced-tool structured output.
 */

export const LeadBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  assistant_key: z.enum(ASSISTANT_KEYS),
  assistant_reason: z.string(),
  us_state: z.string(),
  icp_verdict: z.enum(['serve', 'skip']),
  icp_reason: z.string(),
})

export type LeadBrief = z.infer<typeof LeadBriefSchema>

const CATALOGUE = ASSISTANT_KEYS.map(
  (k) => `- ${k}: ${ASSISTANTS[k].label} — "${ASSISTANTS[k].outcome}". Best fit: ${ASSISTANTS[k].fits}.`,
).join('\n')

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: '1–2 sentences: who this business is.' },
    what_they_do: {
      type: 'string',
      description: 'A short phrase describing what they actually do / sell (e.g. "commercial HVAC installer", "boutique recruitment agency"). Used to sharpen the competitor web search — keep it concrete and search-friendly.',
    },
    assistant_key: {
      type: 'string',
      enum: [...ASSISTANT_KEYS],
      description: 'Which ONE assistant from the catalogue best fits this business. Pick the single best fit.',
    },
    assistant_reason: { type: 'string', description: 'One line: why that assistant fits this business.' },
    us_state: {
      type: 'string',
      description: 'If the company is US-based, the US STATE it operates from — full state name (e.g. "California"), inferred from the CRM location, the website address/footer, or LinkedIn. Empty string "" if not US or genuinely unknown.',
    },
    icp_verdict: {
      type: 'string',
      enum: ['serve', 'skip'],
      description: "Whether this prospect fits MIRASIDE's ICP, per the skill's ICP reference (serve services/ops-heavy SMBs; skip the listed exclusions). 'serve' = worth contacting, 'skip' = out of ICP.",
    },
    icp_reason: { type: 'string', description: 'One line: why serve or skip (size / industry / fit signals).' },
  },
  required: ['summary', 'what_they_do', 'assistant_key', 'assistant_reason', 'us_state', 'icp_verdict', 'icp_reason'],
}

const RESEARCH_SYSTEM = `You analyse a cold prospect (from a CRM) using scraped text from their website and LinkedIn, plus the \`linkedin-cold-dms\` skill. Two jobs:

1. Describe in one concrete phrase WHAT THEY DO (so a competitor search can be scoped well).
2. Pick the ONE best-fit AI assistant for them from this fixed catalogue:
${CATALOGUE}

Selection heuristics: recruiting/staffing or high-volume hiring → cv_candidate; trades/home-services/agencies/dealerships/B2B services with quote or contact forms → quote_form; high inbound email volume / shared inbox → email_inquiry; heavy supplier/AP invoices → invoice; lots of staff receipts/expenses → expense. If genuinely unclear, default to quote_form.

Also decide icp_verdict (serve/skip) using the skill's ICP reference — 'serve' if they fit Miraside's ICP (services/ops-heavy SMB, right size, buyer = owner/CEO/COO), 'skip' if they hit an exclusion (too small/large, pure SaaS/AI, clinical healthcare, banks, gov, etc.) — with a one-line icp_reason.

If this is a US company, also infer the US STATE it operates from (CRM location, the website address/footer, or LinkedIn) and return the full state name in us_state — it scopes the competitor search. Return "" for us_state if the company is not US-based or the state is genuinely unknown.

Work only from the evidence. Output ONLY the \`emit_lead_brief\` tool call.`

export async function researchLead(input: {
  lead: {
    full_name: string | null
    company: string | null
    title: string | null
    website: string | null
    linkedin_url: string | null
    location: string | null
    industry: string | null
  }
  enrichmentText: string
  skillText: string
  /** Batch region — when 'us', infer the company's us_state. */
  region?: 'us' | 'europe' | null
}): Promise<LeadBrief> {
  const { lead, enrichmentText, skillText, region } = input
  const userPrompt = `PROSPECT (from CRM):
- Name: ${lead.full_name ?? '(unknown)'}
- Title: ${lead.title ?? '(unknown)'}
- Company: ${lead.company ?? '(unknown)'}
- Website: ${lead.website ?? '(none)'}
- LinkedIn: ${lead.linkedin_url ?? '(none)'}
- Location: ${lead.location ?? '(unknown)'}
- Industry (CRM): ${lead.industry ?? '(unknown)'}
- Market: ${region === 'us' ? 'US — infer the company\'s US state into us_state' : region === 'europe' ? 'Europe (us_state = "")' : '(unspecified)'}

SCRAPED ENRICHMENT:
${enrichmentText || '(no enrichment available — infer conservatively from the company name/industry)'}

Call \`emit_lead_brief\` with what they do + the best-fit assistant.`

  return runTool({
    systemBlocks: [
      { type: 'text', text: RESEARCH_SYSTEM },
      { type: 'text', text: `===== SKILL =====\n${skillText}` },
    ],
    userPrompt,
    toolName: 'emit_lead_brief',
    toolDescription: 'Emit what the prospect does + the best-fit assistant.',
    toolInputSchema: TOOL_INPUT_SCHEMA,
    schema: LeadBriefSchema,
    callLabel: 'research',
  })
}
