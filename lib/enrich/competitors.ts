import { z } from 'zod'
import { runTool } from '@/lib/llm/run-tool'
import { webSearch, type SearchResult } from '@/lib/search/web'

/**
 * Find a lead's TWO direct competitors, grounded in real web-search results.
 *
 * Geography (set manually per upload, stored on the batch) scopes the search:
 *   - US     → competitors IN the given state.
 *   - Europe → 1–2 big, region-wide competitors.
 *
 * Serper returns Google results; a forced-tool LLM call then extracts exactly two
 * real, direct competitor company names (filtering the company itself, directories
 * and aggregators). Returns ok=false (never throws) so the pipeline can mark the
 * lead's error and move on.
 */

export interface CompetitorSource {
  title: string
  link: string
}

export interface CompetitorResult {
  ok: boolean
  competitor_1: string | null
  competitor_2: string | null
  reasoning: string
  sources: CompetitorSource[]
  query: string
  error?: string
}

const ExtractSchema = z.object({
  competitor_1: z.string(),
  competitor_2: z.string(),
  reasoning: z.string(),
})

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    competitor_1: {
      type: 'string',
      description: 'First DIRECT competitor — a real company evidenced by the search results, in the required geography, NEVER the prospect itself and NEVER a directory/aggregator/listicle.',
    },
    competitor_2: {
      type: 'string',
      description: 'Second, DISTINCT direct competitor company name, same rules.',
    },
    reasoning: { type: 'string', description: 'One line: why these two are the right direct competitors.' },
  },
  required: ['competitor_1', 'competitor_2', 'reasoning'],
}

function buildQuery(
  company: string,
  whatTheyDo: string | null | undefined,
  region: string | null | undefined,
  geoArea: string | null | undefined,
): string {
  const what = whatTheyDo ? ` ${whatTheyDo}` : ''
  if (region === 'us' && geoArea) {
    return `${company} competitors in ${geoArea}${what}`
  }
  // Europe / unspecified → the biggest region-wide direct competitors.
  return `${company} competitors${what}`
}

export async function findCompetitors(input: {
  company: string | null
  whatTheyDo?: string | null
  region?: string | null
  geoArea?: string | null
  skillText?: string
}): Promise<CompetitorResult> {
  const { company, whatTheyDo, region, geoArea, skillText } = input
  const base: CompetitorResult = {
    ok: false,
    competitor_1: null,
    competitor_2: null,
    reasoning: '',
    sources: [],
    query: '',
  }
  if (!company) return { ...base, error: 'no company name' }

  const query = buildQuery(company, whatTheyDo, region, geoArea)

  let results: SearchResult[]
  try {
    results = await webSearch(query, 10)
  } catch (err) {
    return { ...base, query, error: err instanceof Error ? err.message : String(err) }
  }
  const sources = results.slice(0, 6).map((r) => ({ title: r.title, link: r.link }))
  const resultsText = results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`)
    .join('\n')

  const geoLine =
    region === 'us' && geoArea
      ? `The two competitors must be based in or strongly serving ${geoArea}, US.`
      : 'Pick large, well-known DIRECT competitors across the region (Europe-wide / international).'

  const system = `You identify a company's direct competitors from real Google results. Given the company, what it does, and the results, pick EXACTLY TWO real, direct competitor COMPANIES. ${geoLine}
Rules:
- Real companies only — each must appear in or be clearly evidenced by the results.
- NEVER the prospect company itself.
- NEVER directories, aggregators, marketplaces, or listicles (e.g. Yelp, Clutch, G2, Crunchbase, Wikipedia, "top 10" pages).
- Two DISTINCT companies, named as a customer would say them (clean brand names).
If the results are thin, choose the two best-supported direct competitors anyway. Output ONLY the \`emit_competitors\` tool call.`

  const userPrompt = `COMPANY: ${company}${whatTheyDo ? `\nWHAT THEY DO: ${whatTheyDo}` : ''}
GEOGRAPHY: ${region === 'us' ? `US — ${geoArea ?? '(state unknown)'}` : geoArea || 'Europe / region-wide'}

GOOGLE RESULTS for "${query}":
${resultsText || '(no results)'}

Return the two best direct competitors. Call \`emit_competitors\`.`

  const systemBlocks = [{ type: 'text' as const, text: system }]
  if (skillText) systemBlocks.push({ type: 'text' as const, text: `===== SKILL =====\n${skillText}` })

  try {
    const extracted = await runTool({
      systemBlocks,
      userPrompt,
      toolName: 'emit_competitors',
      toolDescription: 'Emit the two direct competitors found in the search results.',
      toolInputSchema: TOOL_INPUT_SCHEMA,
      schema: ExtractSchema,
      callLabel: 'competitors',
    })
    return {
      ok: true,
      competitor_1: extracted.competitor_1,
      competitor_2: extracted.competitor_2,
      reasoning: extracted.reasoning,
      sources,
      query,
    }
  } catch (err) {
    return { ...base, sources, query, error: err instanceof Error ? err.message : String(err) }
  }
}
