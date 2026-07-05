/** Canonical lead fields OutboundAgent maps CSV columns onto. */
export const LEAD_FIELDS = [
  'full_name',
  'first_name',
  'last_name',
  'company',
  'title',
  'website',
  'linkedin_url',
  'email',
  'location',
  'industry',
] as const

export type LeadField = (typeof LEAD_FIELDS)[number]

/** A header→field mapping (canonical field → source CSV header, or null if unmapped). */
export type ColumnMapping = Partial<Record<LeadField, string | null>>

/** A normalized lead ready to insert (plus the original row in `raw`). */
export interface NormalizedLead {
  full_name: string | null
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  website: string | null
  linkedin_url: string | null
  email: string | null
  location: string | null
  industry: string | null
  raw: Record<string, string>
}

export type LeadStatus =
  | 'pending'
  | 'enriching'
  | 'researching'
  | 'drafting'
  | 'ready'
  | 'approved'
  | 'sent'
  | 'skipped'
  | 'error'
