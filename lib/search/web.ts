import { env } from '@/lib/env'
import type { SearchResult } from '@/lib/search/types'
import { tavilySearch } from '@/lib/search/tavily'
import { duckDuckGoSearch } from '@/lib/search/duckduckgo'

export type { SearchResult }

/**
 * Run a web search via whichever provider is available. Default = DuckDuckGo
 * (free, no key). If TAVILY_API_KEY is set, use Tavily (free tier, cleaner
 * results). Both are free — no paid providers.
 */
export async function webSearch(query: string, num = 10): Promise<SearchResult[]> {
  if (env.tavilyApiKey()) return tavilySearch(query, num)
  return duckDuckGoSearch(query, num)
}
