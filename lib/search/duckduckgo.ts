import type { SearchResult } from '@/lib/search/types'

/**
 * DuckDuckGo HTML search — the zero-config, no-key, FREE default provider.
 * Scrapes the lightweight html.duckduckgo.com results page. Lower quality than a
 * paid API and occasionally rate-limited, but needs no signup. For better results
 * set TAVILY_API_KEY (free tier, no card).
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function unescapeHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** DDG wraps result links as //duckduckgo.com/l/?uddg=<encoded real url>. */
function decodeLink(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/)
  if (m) {
    try {
      return decodeURIComponent(m[1])
    } catch {
      /* fall through */
    }
  }
  return href.startsWith('//') ? `https:${href}` : href
}

export async function duckDuckGoSearch(query: string, num = 10): Promise<SearchResult[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`duckduckgo search failed: ${res.status}`)
  const body = await res.text()

  const snippets = [...body.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
    unescapeHtml(m[1]),
  )
  const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const out: SearchResult[] = []
  let m: RegExpExecArray | null
  let i = 0
  while ((m = linkRe.exec(body)) !== null && out.length < num) {
    const title = unescapeHtml(m[2])
    const link = decodeLink(m[1])
    if (title || link) out.push({ title, link, snippet: snippets[i] ?? '' })
    i++
  }
  return out
}
