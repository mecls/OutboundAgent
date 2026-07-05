import { env } from '@/lib/env'
import type { SearchResult } from '@/lib/search/types'

/**
 * Tavily search — an OPTIONAL free-tier upgrade over DuckDuckGo (1,000 searches/
 * month free, no credit card; tavily.com). Built for LLM agents; cleaner snippets.
 * Used automatically when TAVILY_API_KEY is set (see lib/search/web.ts).
 */
export async function tavilySearch(query: string, num = 10): Promise<SearchResult[]> {
  const key = env.tavilyApiKey()
  if (!key) throw new Error('TAVILY_API_KEY not configured')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      api_key: key, // also accepted in-body for older keys
      query,
      max_results: num,
      search_depth: 'basic',
      include_answer: false,
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`tavily search failed: ${res.status} ${t.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>
  }
  return (data.results ?? [])
    .map((r) => ({
      title: r.title ?? '',
      link: r.url ?? '',
      snippet: (r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    }))
    .filter((r) => r.title || r.link)
}
