import { env } from '@/lib/env'

/**
 * Website enrichment via Jina Reader (r.jina.ai) — free with no key (rate-limited),
 * higher-limit with JINA_API_KEY. Given a URL it returns the clean readable text
 * of the page, including JS-heavy sites. We pull the homepage (and best-effort an
 * About/Services page) so the research step understands what the business does.
 * Forked from ContentAgent's lib/integrations/jina.ts.
 */

const READER = 'https://r.jina.ai/'

async function jinaExtract(
  url: string,
  opts: { maxChars?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const maxChars = opts.maxChars ?? 6000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000)
  try {
    const key = env.jinaApiKey()
    const res = await fetch(`${READER}${url}`, {
      headers: {
        Accept: 'text/plain',
        'X-Return-Format': 'text',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return text ? text.slice(0, maxChars) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Candidate secondary paths that usually hold positioning/ICP signal. */
function aboutCandidates(homepage: string): string[] {
  try {
    const u = new URL(homepage)
    const base = `${u.protocol}//${u.host}`
    return [`${base}/about`, `${base}/about-us`, `${base}/services`]
  } catch {
    return []
  }
}

export interface WebsiteResult {
  ok: boolean
  text: string
  error?: string
}

/** Pull homepage text + one best-effort secondary page, concatenated. */
export async function scrapeWebsite(url: string): Promise<WebsiteResult> {
  const home = await jinaExtract(url, { maxChars: 6000 })
  if (!home) {
    return { ok: false, text: '', error: 'website unreachable or empty via Jina Reader' }
  }

  let secondary: string | null = null
  for (const candidate of aboutCandidates(url)) {
    secondary = await jinaExtract(candidate, { maxChars: 3000, timeoutMs: 12_000 })
    if (secondary) {
      secondary = `\n\n--- ${candidate} ---\n${secondary}`
      break
    }
  }

  return { ok: true, text: `${home}${secondary ?? ''}`.slice(0, 9000) }
}
