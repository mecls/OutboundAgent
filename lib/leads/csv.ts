import {
  LEAD_FIELDS,
  type ColumnMapping,
  type LeadField,
  type NormalizedLead,
} from '@/lib/leads/types'

/**
 * Header auto-mapping + row normalization for CRM CSV exports. Pure functions
 * (no DB, no env) so they run identically in the browser (mapping preview) and
 * on the server (import). CSV parsing itself is done by papaparse at the edges.
 */

/** Normalize a header for fuzzy matching: lowercase, collapse non-alnum to space. */
function norm(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Synonyms per canonical field, in priority order (first match wins).
const SYNONYMS: Record<LeadField, string[]> = {
  first_name: ['first name', 'firstname', 'first', 'fname', 'given name'],
  last_name: ['last name', 'lastname', 'last', 'lname', 'surname', 'family name'],
  full_name: ['full name', 'name', 'contact name', 'lead name', 'contact', 'person'],
  company: [
    'company name',
    'company',
    'organization',
    'organisation',
    'account name',
    'account',
    'business',
    'employer',
    'org',
  ],
  title: ['job title', 'title', 'position', 'role', 'headline', 'designation'],
  website: [
    'company website',
    'website url',
    'website',
    'company url',
    'domain',
    'web site',
    'url',
    'site',
    'web',
  ],
  linkedin_url: [
    'linkedin url',
    'linkedin profile',
    'linkedin profile url',
    'linkedin',
    'li url',
    'li profile',
    'profile url',
  ],
  email: ['email address', 'work email', 'email', 'e mail', 'mail'],
  location: ['location', 'city', 'country', 'region', 'geo', 'address', 'based in'],
  industry: ['industry', 'sector', 'vertical', 'naics', 'sic'],
}

/**
 * Guess a canonical-field → header mapping from the CSV header row. Greedy: each
 * header is claimed by at most one field; each field takes its best-priority
 * unclaimed header. `full_name` is only mapped if first/last weren't both found.
 */
export function autoMapHeaders(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }))
  const claimed = new Set<string>()
  const mapping: ColumnMapping = {}

  // Order matters: resolve specific name parts before the catch-all full_name.
  const order: LeadField[] = [
    'first_name',
    'last_name',
    'email',
    'linkedin_url',
    'website',
    'company',
    'title',
    'location',
    'industry',
    'full_name',
  ]

  for (const field of order) {
    if (field === 'full_name' && mapping.first_name && mapping.last_name) continue
    for (const syn of SYNONYMS[field]) {
      // Prefer an exact normalized match, then a contains match.
      const exact = normalized.find((h) => !claimed.has(h.raw) && h.n === syn)
      const partial =
        exact ?? normalized.find((h) => !claimed.has(h.raw) && h.n.includes(syn))
      if (partial) {
        mapping[field] = partial.raw
        claimed.add(partial.raw)
        break
      }
    }
  }

  return mapping
}

function clean(v: string | undefined | null): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

/** Normalize a website value into an absolute http(s) URL (or null). */
export function normalizeWebsite(raw: string | null): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null
  if (s.includes('@') && !s.includes('/')) return null // looks like an email
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`
  try {
    const u = new URL(s)
    if (!u.hostname.includes('.')) return null
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/** Normalize a LinkedIn profile URL (must be a linkedin.com/in|company path). */
export function normalizeLinkedin(raw: string | null): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`
  try {
    const u = new URL(s)
    if (!/linkedin\.com$/i.test(u.hostname.replace(/^www\./i, ''))) return null
    u.hostname = u.hostname.toLowerCase()
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: null, last: null }
  if (parts.length === 1) return { first: parts[0], last: null }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

/** Apply a mapping to a parsed CSV row → a normalized lead. */
export function normalizeRow(
  row: Record<string, string>,
  mapping: ColumnMapping,
): NormalizedLead {
  const pick = (field: LeadField): string | null => {
    const header = mapping[field]
    return header ? clean(row[header]) : null
  }

  let firstName = pick('first_name')
  let lastName = pick('last_name')
  let fullName = pick('full_name')

  if (!fullName && (firstName || lastName)) {
    fullName = [firstName, lastName].filter(Boolean).join(' ') || null
  }
  if (fullName && !firstName && !lastName) {
    const { first, last } = splitName(fullName)
    firstName = first
    lastName = last
  }

  return {
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    company: pick('company'),
    title: pick('title'),
    website: normalizeWebsite(pick('website')),
    linkedin_url: normalizeLinkedin(pick('linkedin_url')),
    email: pick('email'),
    location: pick('location'),
    industry: pick('industry'),
    raw: row,
  }
}

/** Normalize all rows and drop rows with no usable identity at all. */
export function normalizeRows(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): NormalizedLead[] {
  return rows
    .map((r) => normalizeRow(r, mapping))
    .filter((l) => l.full_name || l.company || l.linkedin_url || l.website || l.email)
}

export { LEAD_FIELDS }
