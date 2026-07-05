import { env } from '@/lib/env'

/**
 * LinkedIn profile enrichment via an Apify actor (run-sync-get-dataset-items),
 * following ContentAgent's lib/integrations/apify.ts call pattern. Returns a
 * readable profile summary + the structured fields the draft step can use.
 *
 * IMPORTANT: actor input/output shapes vary between LinkedIn profile actors.
 * The actor id is env-configurable (APIFY_LINKEDIN_PROFILE_ACTOR). On the first
 * real run, inspect the stored raw payload (outbound_scrapes.raw) and adjust the
 * input key / field mapping below to match your actor if anything comes back empty.
 */

export interface LinkedinProfile {
  name: string | null
  headline: string | null
  about: string | null
  location: string | null
  current_role: string | null
  current_company: string | null
  /** The current company's LinkedIn URL, if the actor exposes it (feeds the
   *  company hiring-signal scrape). */
  company_linkedin: string | null
}

export interface LinkedinResult {
  ok: boolean
  text: string
  profile: LinkedinProfile | null
  raw: unknown
  error?: string
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

/** First non-empty string among several candidate fields. */
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(obj[k])
    if (v) return v
  }
  return null
}

function firstExperience(obj: Record<string, unknown>): {
  role: string | null
  company: string | null
  company_linkedin: string | null
} {
  const exp =
    (obj.experience as unknown[]) ??
    (obj.experiences as unknown[]) ??
    (obj.positions as unknown[]) ??
    []
  const first = Array.isArray(exp) && exp.length > 0 ? (exp[0] as Record<string, unknown>) : null
  if (!first) return { role: null, company: null, company_linkedin: null }
  return {
    role: pick(first, ['title', 'role', 'position']),
    company: pick(first, ['companyName', 'company', 'organization', 'subtitle']),
    company_linkedin: pick(first, ['companyLink', 'companyUrl', 'companyLinkedinUrl', 'companyUrn']),
  }
}

/** Pull the current company's LinkedIn URL from whichever shape the actor uses. */
function companyLinkedin(item: Record<string, unknown>, expUrl: string | null): string | null {
  const direct = pick(item, ['companyLinkedinUrl', 'companyUrl', 'companyLink'])
  if (direct) return direct
  const co = item.currentCompany ?? item.company
  if (co && typeof co === 'object') {
    const url = pick(co as Record<string, unknown>, ['url', 'linkedinUrl', 'link'])
    if (url) return url
  }
  return expUrl
}

function normalizeProfile(item: Record<string, unknown>): LinkedinProfile {
  const composed =
    [pick(item, ['firstName', 'first_name']), pick(item, ['lastName', 'last_name'])]
      .filter(Boolean)
      .join(' ') || null
  const name = pick(item, ['fullName', 'name', 'fullname']) ?? composed
  const exp = firstExperience(item)
  return {
    name: name || null,
    headline: pick(item, ['headline', 'occupation', 'subtitle', 'jobTitle']),
    about: pick(item, ['about', 'summary', 'bio', 'description']),
    location: pick(item, ['location', 'addressWithCountry', 'geoLocationName', 'city']),
    current_role: pick(item, ['jobTitle', 'currentRole']) ?? exp.role,
    current_company: pick(item, ['companyName', 'currentCompany']) ?? exp.company,
    company_linkedin: companyLinkedin(item, exp.company_linkedin),
  }
}

function profileToText(p: LinkedinProfile): string {
  const lines: string[] = []
  if (p.name) lines.push(p.name + (p.headline ? ` — ${p.headline}` : ''))
  else if (p.headline) lines.push(p.headline)
  if (p.current_role || p.current_company) {
    lines.push(`Current: ${[p.current_role, p.current_company].filter(Boolean).join(' @ ')}`)
  }
  if (p.location) lines.push(`Location: ${p.location}`)
  if (p.about) lines.push(`About: ${p.about}`)
  return lines.join('\n')
}

export async function scrapeLinkedinProfile(profileUrl: string): Promise<LinkedinResult> {
  const token = env.apifyToken()
  if (!token) {
    return { ok: false, text: '', profile: null, raw: null, error: 'APIFY_TOKEN not configured' }
  }

  const actor = env.apifyProfileActor()
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items`

  // Send several common input keys; most actors ignore unknown keys. Adjust if
  // your actor rejects extras or uses a different key name.
  const body = {
    profileUrls: [profileUrl],
    urls: [profileUrl],
    queries: [profileUrl],
    maxItems: 1,
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return {
        ok: false,
        text: '',
        profile: null,
        raw: null,
        error: `apify scrape failed: ${res.status} ${t.slice(0, 300)}`,
      }
    }
    const items = (await res.json()) as unknown
    const first = Array.isArray(items) && items.length > 0 ? items[0] : null
    if (!first || typeof first !== 'object') {
      return { ok: false, text: '', profile: null, raw: items, error: 'no profile item returned' }
    }
    const profile = normalizeProfile(first as Record<string, unknown>)
    const text = profileToText(profile)
    return { ok: Boolean(text), text, profile, raw: first }
  } catch (err) {
    return {
      ok: false,
      text: '',
      profile: null,
      raw: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
