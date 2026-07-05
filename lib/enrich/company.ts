import { env } from '@/lib/env'

/**
 * Company-level HIRING-SIGNAL enrichment. The strongest cold-DM hook for an
 * AI-agent-team pitch is "saw you're hiring a {role}" — an open role (or a
 * "we're hiring" post) is a public admission of exactly the capacity gap Miraside
 * fills. This module pulls two signals for a prospect's company:
 *
 *   1. Open JOB POSTS         — via APIFY_LINKEDIN_JOBS_ACTOR (search by company).
 *   2. Hiring COMPANY POSTS   — via APIFY_LINKEDIN_COMPANY_POSTS_ACTOR (recent
 *                               company posts, filtered to hiring language).
 *
 * Both are OPTIONAL and OFF by default: if the actor env is empty the signal is
 * skipped (no Apify spend). Actor input/output shapes vary — the actor ids are
 * env-configurable and the field mapping is defensive; on the first real run,
 * inspect the stored raw payload and adjust the keys below if anything is empty.
 */

export interface OpenRole {
  title: string
  location: string | null
  posted: string | null
  url: string | null
}

export interface HiringPost {
  text: string
  url: string | null
  posted: string | null
}

export interface HiringSignals {
  open_roles: OpenRole[]
  hiring_posts: HiringPost[]
}

export interface CompanyHiringResult {
  ok: boolean
  /** Prompt-ready summary folded into the lead's enrichment text. */
  text: string
  signals: HiringSignals | null
  raw: unknown
  error?: string
}

/** Language that marks a post (or job blurb) as an active hiring signal. */
const HIRING_RE =
  /\b(hiring|we[''`]?re hiring|now hiring|join (our|the) team|open (role|position|vacanc)|we are looking for|looking to hire|recruit(ing|er)|apply now|new role|growing (our|the) team|join us)\b/i

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(obj[k])
    if (v) return v
  }
  return null
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** POST an Apify actor's run-sync-get-dataset-items and return the dataset array. */
async function runActor(
  actor: string,
  token: string,
  body: Record<string, unknown>,
): Promise<unknown[]> {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`apify ${actor} failed: ${res.status} ${t.slice(0, 200)}`)
  }
  const items = (await res.json()) as unknown
  return asArray(items)
}

function mapRole(item: Record<string, unknown>): OpenRole | null {
  const title = pick(item, ['title', 'jobTitle', 'position', 'name'])
  if (!title) return null
  return {
    title,
    location: pick(item, ['location', 'formattedLocation', 'jobLocation', 'place']),
    posted: pick(item, ['postedAt', 'postedDate', 'listedAt', 'publishedAt', 'date']),
    url: pick(item, ['url', 'jobUrl', 'link', 'jobPostingUrl']),
  }
}

function mapPost(item: Record<string, unknown>): HiringPost | null {
  const text = pick(item, ['text', 'content', 'commentary', 'postText', 'description'])
  if (!text) return null
  return {
    text,
    url: pick(item, ['url', 'postUrl', 'link', 'shareUrl']),
    posted: pick(item, ['postedAt', 'postedDate', 'publishedAt', 'date', 'time']),
  }
}

/** Belongs-to-this-company filter for jobs returned by a broad search. */
function matchesCompany(item: Record<string, unknown>, companyName: string): boolean {
  const co = pick(item, ['companyName', 'company', 'organization', 'employer'])
  if (!co) return true // actor already scoped to the company — keep it
  const a = co.toLowerCase()
  const b = companyName.toLowerCase()
  return a.includes(b) || b.includes(a)
}

function summarize(signals: HiringSignals, companyName: string): string {
  const lines: string[] = []
  if (signals.open_roles.length) {
    lines.push(`Open roles at ${companyName}:`)
    for (const r of signals.open_roles.slice(0, 8)) {
      lines.push(`- ${r.title}${r.location ? ` (${r.location})` : ''}${r.posted ? ` — ${r.posted}` : ''}`)
    }
  }
  if (signals.hiring_posts.length) {
    lines.push('Recent hiring posts:')
    for (const p of signals.hiring_posts.slice(0, 4)) {
      lines.push(`- "${p.text.replace(/\s+/g, ' ').slice(0, 220)}"`)
    }
  }
  return lines.join('\n')
}

export async function scrapeCompanyHiring(input: {
  companyName: string | null
  companyLinkedinUrl?: string | null
  location?: string | null
}): Promise<CompanyHiringResult> {
  const { companyName, companyLinkedinUrl, location } = input
  const token = env.apifyToken()
  const jobsActor = env.apifyJobsActor()
  const postsActor = env.apifyCompanyPostsActor()

  if (!token) {
    return { ok: false, text: '', signals: null, raw: null, error: 'APIFY_TOKEN not configured' }
  }
  if (!jobsActor && !postsActor) {
    // Feature off — no actor configured. Skip silently (not an error).
    return { ok: false, text: '', signals: null, raw: null }
  }
  if (!companyName && !companyLinkedinUrl) {
    return { ok: false, text: '', signals: null, raw: null, error: 'no company name or URL' }
  }

  const open_roles: OpenRole[] = []
  const hiring_posts: HiringPost[] = []
  const raw: Record<string, unknown> = {}
  const errors: string[] = []

  // ── Job posts (search by company) ──────────────────────────────────────────
  if (jobsActor && companyName) {
    try {
      const items = await runActor(jobsActor, token, {
        // Send several common input keys; actors ignore unknown ones.
        companyName,
        company: companyName,
        queries: [companyName],
        title: companyName,
        searchQuery: companyName,
        location: location ?? undefined,
        rows: 15,
        maxItems: 15,
      })
      raw.jobs = items.slice(0, 15)
      for (const it of items) {
        if (!it || typeof it !== 'object') continue
        const rec = it as Record<string, unknown>
        if (!matchesCompany(rec, companyName)) continue
        const role = mapRole(rec)
        if (role) open_roles.push(role)
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  // ── Company posts (scan for hiring language) ───────────────────────────────
  if (postsActor && companyLinkedinUrl) {
    try {
      const items = await runActor(postsActor, token, {
        companyUrl: companyLinkedinUrl,
        urls: [companyLinkedinUrl],
        company: companyLinkedinUrl,
        queries: [companyLinkedinUrl],
        maxItems: 20,
      })
      raw.posts = items.slice(0, 20)
      for (const it of items) {
        if (!it || typeof it !== 'object') continue
        const post = mapPost(it as Record<string, unknown>)
        if (post && HIRING_RE.test(post.text)) hiring_posts.push(post)
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  const signals: HiringSignals = {
    open_roles: open_roles.slice(0, 15),
    hiring_posts: hiring_posts.slice(0, 6),
  }
  const ok = signals.open_roles.length > 0 || signals.hiring_posts.length > 0
  return {
    ok,
    text: ok ? summarize(signals, companyName ?? 'the company') : '',
    signals: ok ? signals : null,
    raw,
    error: errors.length ? errors.join('; ') : undefined,
  }
}
